import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { createHmac } from 'crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, numeric } from 'drizzle-orm/pg-core';

neonConfig.fetchConnectionCache = true;

const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  statusCode: integer('status_code').default(0),
  status: text('status').default('temp_registered'),
  bizchatCampaignId: text('bizchat_campaign_id'),
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

// 캠페인 중단 가능 상태 코드 (발송 중)
const STOPPABLE_STATUS_CODES = [30];

// 상태 코드별 한글 명칭
const STATUS_NAMES: Record<number, string> = {
  0: '임시등록',
  1: '검수요청',
  2: '검수완료',
  5: '임시저장',
  10: '승인요청',
  11: '승인완료',
  17: '반려',
  20: '발송준비',
  30: '발송중',
  40: '발송완료',
  90: '취소',
  91: '중단',
};

// BizChat API 호출
async function callBizChatStopAPI(bizchatCampaignId: string, useProduction: boolean = false) {
  const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
  const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction
    ? process.env.BIZCHAT_PROD_API_KEY
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error('BizChat API key not configured');
  }

  const tid = Date.now().toString();
  const url = `${baseUrl}/api/v1/cmpn/stop?tid=${tid}&id=${bizchatCampaignId}`;

  console.log(`[BizChat Stop] POST ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  });

  const responseText = await response.text();
  console.log(`[BizChat Stop] Response: ${response.status} - ${responseText}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }

  return { status: response.status, data };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid campaign ID' });
  }

  const db = getDb();

  try {
    // 캠페인 조회
    const campaignResult = await db.select().from(campaigns).where(eq(campaigns.id, id));
    const campaign = campaignResult[0];

    if (!campaign) {
      return res.status(404).json({ error: '캠페인을 찾을 수 없습니다' });
    }

    if (campaign.userId !== auth.userId) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    // 상태 검증
    const currentStatusCode = campaign.statusCode || 0;
    if (!STOPPABLE_STATUS_CODES.includes(currentStatusCode)) {
      const statusName = STATUS_NAMES[currentStatusCode] || `상태코드 ${currentStatusCode}`;
      return res.status(400).json({
        error: `현재 상태(${statusName})에서는 중단할 수 없습니다. 중단은 발송 중인 캠페인만 가능합니다.`
      });
    }

    // BizChat API 호출
    if (campaign.bizchatCampaignId) {
      const useProduction = process.env.BIZCHAT_USE_PROD === 'true';
      console.log(`[Stop] Calling BizChat stop API for campaign: ${campaign.bizchatCampaignId}`);

      const bizchatResult = await callBizChatStopAPI(campaign.bizchatCampaignId, useProduction);

      if (bizchatResult.data.code !== 'S000001') {
        console.error('[Stop] BizChat API error:', bizchatResult.data);
        return res.status(400).json({
          error: `BizChat 중단 실패: ${bizchatResult.data.msg || '알 수 없는 오류'}`,
          bizchatError: bizchatResult.data
        });
      }
    }

    // 로컬 DB 상태 업데이트 (BizChat 규격: state=35는 중단)
    const updatedResult = await db.update(campaigns)
      .set({
        statusCode: 35,
        status: 'stopped',
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, id))
      .returning();

    console.log(`[Stop] Campaign ${id} stopped successfully`);

    return res.status(200).json({
      success: true,
      message: '캠페인 발송이 중단되었습니다',
      campaign: updatedResult[0]
    });

  } catch (error) {
    console.error('[Stop] Error:', error);
    return res.status(500).json({
      error: '캠페인 중단 중 오류가 발생했습니다',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
