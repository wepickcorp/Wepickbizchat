import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import {
  getNeededCampaignCredits,
  isCreditModeEnabled,
  restoreUsedCampaignCreditsForServerless,
} from '../../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  targetCount: integer('target_count').default(0),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function verifyImpersonateToken(token: string): { userId: string; adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== 'impersonate') return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAuth(req: VercelRequest) {
  const impersonateToken = req.headers['x-impersonate-token'] as string;
  const impersonateUserId = req.headers['x-impersonate-user-id'] as string;
  if (impersonateToken && impersonateUserId) {
    const verified = verifyImpersonateToken(impersonateToken);
    if (verified && verified.userId === impersonateUserId) {
      return { userId: verified.userId, email: '' };
    }
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

function isInternalFailureRequest(req: VercelRequest) {
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production') {
    return true;
  }

  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const provided = req.headers['x-internal-secret'];
  return Boolean(secret && provided === secret);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isInternalFailureRequest(req)) {
    return res.status(403).json({ error: 'Internal secret is required' });
  }

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid campaign ID' });

  const reason = String(req.body?.reason || 'internal_failure');
  if (!['internal_failure', 'skt_receipt_failure', 'partial_delivery_failure'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid failure reason' });
  }

  const db = getDb();

  try {
    const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
    const campaign = campaignResult[0];

    if (!campaign) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다' });
    if (campaign.userId !== auth.userId) return res.status(403).json({ error: '권한이 없습니다' });

    if (!isCreditModeEnabled()) {
      const [updatedCampaign] = await db.update(campaigns)
        .set({ statusCode: 35, status: 'stopped', updatedAt: new Date() })
        .where(eq(campaigns.id, id))
        .returning();

      return res.status(200).json({
        success: true,
        campaign: updatedCampaign,
        restoredCredits: 0,
      });
    }

    const chargeableCount = req.body?.chargeableCount ?? req.body?.acceptedCount ?? req.body?.processedCount;
    let restoreCredits: number | undefined;

    if (reason === 'partial_delivery_failure') {
      const numericChargeableCount = Number(chargeableCount);
      const targetCount = Number((campaign as any).targetCount || 0);

      if (!Number.isFinite(numericChargeableCount) || numericChargeableCount < 0 || numericChargeableCount > targetCount) {
        return res.status(400).json({
          error: 'partial_delivery_failure requires chargeableCount between 0 and targetCount',
        });
      }

      restoreCredits = getNeededCampaignCredits(Math.max(0, targetCount - numericChargeableCount)).neededCredits;
    }

    const restoreResult = await restoreUsedCampaignCreditsForServerless(db, {
      userId: auth.userId,
      campaignId: id,
      reason,
      description: reason === 'skt_receipt_failure'
        ? `SKT 접수 실패 복구: ${campaign.name}`
        : reason === 'partial_delivery_failure'
          ? `잔여 발송분 복구: ${campaign.name}`
        : `내부 발송 실패 복구: ${campaign.name}`,
      restoreCredits,
      statusCode: 35,
      status: 'stopped',
    });

    return res.status(200).json({
      success: true,
      restoredCredits: restoreResult.restoredCredits,
      creditBalanceAfter: restoreResult.balanceAfterCredits,
      alreadyProcessed: restoreResult.alreadyProcessed,
    });
  } catch (error) {
    console.error('[Campaign Fail] Error:', error);
    return res.status(500).json({
      error: '캠페인 실패 처리 중 오류가 발생했습니다',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
