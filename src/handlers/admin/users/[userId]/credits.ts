import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { boolean, timestamp, varchar } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

const admins = pgTable('admins', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email').unique().notNull(),
  passwordHash: varchar('password_hash').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 20 }).default('cs').notNull(),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const adminLogs = pgTable('admin_logs', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar('admin_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: varchar('target_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

function verifyToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.ADMIN_JWT_SECRET!)
      .update(data)
      .digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

async function verifyAdminToken(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const verified = verifyToken(authHeader.replace('Bearer ', ''));
  if (!verified) return null;

  try {
    const db = getDb();
    const [admin] = await db.select().from(admins).where(eq(admins.id, verified.adminId)).limit(1);
    if (!admin?.isActive) return null;
    return admin;
  } catch {
    return null;
  }
}

function mapGrant(row: any) {
  return {
    id: row.id,
    productType: row.product_type,
    originalCredits: Number(row.original_credits || 0),
    remainingCredits: Number(row.remaining_credits || 0),
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    transactionId: row.transaction_id,
  };
}

function mapLedger(row: any) {
  return {
    id: row.id,
    type: row.type,
    amountCredits: Number(row.amount_credits || 0),
    balanceAfterCredits: row.balance_after_credits == null ? null : Number(row.balance_after_credits),
    productType: row.product_type,
    description: row.description,
    campaignId: row.campaign_id,
    transactionId: row.transaction_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await verifyAdminToken(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  const { userId } = req.query;
  if (typeof userId !== 'string') return res.status(400).json({ error: 'Invalid user ID' });

  try {
    const db = getDb();

    if (req.method === 'POST') {
      const amountCredits = Number(req.body?.amountCredits);
      const reason = String(req.body?.reason || '').trim();
      const adjustmentKey = typeof req.body?.adjustmentKey === 'string'
        ? req.body.adjustmentKey.trim()
        : '';
      const idempotencyKey = adjustmentKey
        ? `admin-adjust:${userId}:${adjustmentKey.slice(0, 80)}`
        : null;

      if (!Number.isInteger(amountCredits) || amountCredits === 0) {
        return res.status(400).json({ error: '조정 크레딧을 0이 아닌 정수로 입력해주세요' });
      }
      if (!reason) {
        return res.status(400).json({ error: '조정 사유를 입력해주세요' });
      }
      if (!adjustmentKey) {
        return res.status(400).json({ error: '조정 요청 키가 누락되었습니다' });
      }

      const result = await db.execute(sql`
        WITH target_user AS (
          SELECT id, email
          FROM users
          WHERE id = ${userId}
          FOR UPDATE
        ),
        existing_adjustment AS (
          SELECT id, balance_after_credits
          FROM credit_ledger
          WHERE idempotency_key = ${idempotencyKey}
            AND EXISTS (SELECT 1 FROM target_user)
          LIMIT 1
        ),
        active_lots AS (
          SELECT
            id,
            product_type,
            remaining_credits::integer AS remaining_credits,
            expires_at,
            COALESCE(
              SUM(remaining_credits::integer) OVER (
                ORDER BY expires_at ASC, id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            ) AS credits_before
          FROM credit_grants
          WHERE user_id = ${userId}
            AND remaining_credits > 0
            AND expires_at > NOW()
        ),
        active_balance_before AS (
          SELECT COALESCE(SUM(remaining_credits), 0)::integer AS credits
          FROM active_lots
        ),
        inserted_ledger_marker AS (
          INSERT INTO credit_ledger (
            user_id,
            type,
            amount_credits,
            balance_after_credits,
            product_type,
            idempotency_key,
            description,
            metadata
          )
          SELECT
            ${userId},
            'adjustment',
            ${amountCredits},
            NULL,
            CASE WHEN ${amountCredits} > 0 THEN 'adjustment' ELSE NULL END,
            ${idempotencyKey},
            ${`관리자 크레딧 조정: ${reason}`},
            jsonb_build_object(
              'reason', ${reason},
              'adminId', ${admin.id},
              'direction', CASE WHEN ${amountCredits} > 0 THEN 'add' ELSE 'subtract' END,
              'adjustmentKey', ${adjustmentKey}
            )
          WHERE EXISTS (SELECT 1 FROM target_user)
            AND NOT EXISTS (SELECT 1 FROM existing_adjustment)
            AND (
              ${amountCredits} > 0
              OR (SELECT credits FROM active_balance_before) >= ${Math.abs(amountCredits)}
            )
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id
        ),
        selected_lots AS (
          SELECT
            id,
            product_type,
            expires_at,
            GREATEST(0, LEAST(remaining_credits, ${Math.abs(amountCredits)} - credits_before))::integer AS deducted_credits
          FROM active_lots
          WHERE credits_before < ${Math.abs(amountCredits)}
            AND ${amountCredits} < 0
        ),
        updated_lots AS (
          UPDATE credit_grants AS grant
          SET
            remaining_credits = grant.remaining_credits - selected_lots.deducted_credits,
            updated_at = NOW()
          FROM selected_lots, active_balance_before
          WHERE grant.id = selected_lots.id
            AND selected_lots.deducted_credits > 0
            AND active_balance_before.credits >= ${Math.abs(amountCredits)}
            AND EXISTS (SELECT 1 FROM target_user)
            AND EXISTS (SELECT 1 FROM inserted_ledger_marker)
          RETURNING
            grant.id,
            selected_lots.product_type,
            selected_lots.deducted_credits,
            grant.remaining_credits AS remaining_credits_after,
            grant.expires_at
        ),
        inserted_grant AS (
          INSERT INTO credit_grants (
            user_id,
            product_type,
            original_credits,
            remaining_credits,
            expires_at
          )
          SELECT
            ${userId},
            'adjustment',
            ${amountCredits},
            ${amountCredits},
            NOW() + INTERVAL '12 months'
          WHERE ${amountCredits} > 0
            AND EXISTS (SELECT 1 FROM target_user)
            AND EXISTS (SELECT 1 FROM inserted_ledger_marker)
          RETURNING id, remaining_credits
        ),
        active_balance_after AS (
          SELECT ((SELECT credits FROM active_balance_before) + ${amountCredits})::integer AS credits
        ),
        adjustment_ledger AS (
          UPDATE credit_ledger
          SET
            credit_grant_id = COALESCE(
              (SELECT id FROM inserted_grant LIMIT 1),
              (SELECT id FROM updated_lots ORDER BY expires_at ASC, id ASC LIMIT 1)
            ),
            balance_after_credits = active_balance_after.credits,
            product_type = CASE WHEN ${amountCredits} > 0 THEN 'adjustment' ELSE (SELECT product_type FROM updated_lots ORDER BY expires_at ASC, id ASC LIMIT 1) END,
            metadata = jsonb_build_object(
              'reason', ${reason},
              'adminId', ${admin.id},
              'direction', CASE WHEN ${amountCredits} > 0 THEN 'add' ELSE 'subtract' END,
              'adjustmentKey', ${adjustmentKey},
              'allocations', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'creditGrantId', id,
                    'deductedCredits', deducted_credits,
                    'remainingCreditsAfter', remaining_credits_after
                  )
                  ORDER BY expires_at ASC, id ASC
                )
                FROM updated_lots
              ), '[]'::jsonb)
            )
          FROM active_balance_after
          WHERE credit_ledger.id = (SELECT id FROM inserted_ledger_marker LIMIT 1)
            AND (
              (${amountCredits} > 0 AND EXISTS (SELECT 1 FROM inserted_grant))
              OR (${amountCredits} < 0 AND COALESCE((SELECT SUM(deducted_credits) FROM updated_lots), 0) = ${Math.abs(amountCredits)})
            )
          RETURNING credit_ledger.id, credit_ledger.balance_after_credits
        ),
        inserted_admin_log AS (
          INSERT INTO admin_logs (
            admin_id,
            action,
            target_type,
            target_id,
            details,
            ip_address,
            created_at
          )
          SELECT
            ${admin.id},
            'credit_adjust',
            'user',
            ${userId},
            jsonb_build_object(
              'amountCredits', ${amountCredits},
              'reason', ${reason},
              'previousBalanceCredits', (SELECT credits FROM active_balance_before),
              'newBalanceCredits', (SELECT balance_after_credits FROM adjustment_ledger LIMIT 1),
              'userEmail', (SELECT email FROM target_user LIMIT 1)
            ),
            ${String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0]},
            NOW()
          WHERE EXISTS (SELECT 1 FROM adjustment_ledger)
          RETURNING id
        )
        SELECT
          EXISTS (SELECT 1 FROM target_user) AS user_found,
          EXISTS (SELECT 1 FROM existing_adjustment) AS already_processed,
          (SELECT credits FROM active_balance_before) AS previous_balance_credits,
          COALESCE(
            (SELECT balance_after_credits FROM adjustment_ledger LIMIT 1),
            (SELECT balance_after_credits FROM existing_adjustment LIMIT 1),
            (SELECT credits FROM active_balance_before)
          ) AS new_balance_credits,
          EXISTS (SELECT 1 FROM adjustment_ledger) AS ledger_inserted
      `);

      const row = result.rows?.[0] || {};
      if (!row.user_found) return res.status(404).json({ error: 'User not found' });
      if (row.already_processed) {
        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          previousBalanceCredits: Number(row.previous_balance_credits || 0),
          newBalanceCredits: Number(row.new_balance_credits || 0),
          amountCredits,
        });
      }
      if (amountCredits < 0 && Number(row.previous_balance_credits || 0) < Math.abs(amountCredits)) {
        return res.status(400).json({ error: '차감할 수 있는 크레딧이 부족합니다' });
      }
      if (!row.ledger_inserted) {
        return res.status(500).json({ error: '크레딧 조정 장부 기록에 실패했습니다' });
      }

      return res.status(200).json({
        success: true,
        previousBalanceCredits: Number(row.previous_balance_credits || 0),
        newBalanceCredits: Number(row.new_balance_credits || 0),
        amountCredits,
      });
    }

    const [userResult, grantsResult, ledgerResult, recentLedgerResult] = await Promise.all([
      db.execute(sql`
        SELECT id, email, company_name, balance
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `),
      db.execute(sql`
        SELECT id, transaction_id, product_type, original_credits, remaining_credits, purchased_at, expires_at
        FROM credit_grants
        WHERE user_id = ${userId}
        ORDER BY expires_at ASC, created_at ASC
      `),
      db.execute(sql`
        SELECT type, amount_credits, campaign_id
        FROM credit_ledger
        WHERE user_id = ${userId}
      `),
      db.execute(sql`
        SELECT id, type, amount_credits, balance_after_credits, product_type, description,
               campaign_id, transaction_id, idempotency_key, created_at
        FROM credit_ledger
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 30
      `),
    ]);

    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const lots = (grantsResult.rows || []).map(mapGrant);
    const activeLots = lots.filter((lot) => Number(lot.remainingCredits) > 0 && new Date(lot.expiresAt) > now);
    const availableCredits = activeLots.reduce((sum, lot) => sum + Number(lot.remainingCredits || 0), 0);
    const totalGrantedCredits = lots.reduce((sum, lot) => sum + Number(lot.originalCredits || 0), 0);
    const ledgerRows = ledgerResult.rows || [];
    const totalUsedCredits = ledgerRows
      .filter((row: any) => row.type === 'use')
      .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_credits || 0)), 0);
    const totalRefundCredits = ledgerRows
      .filter((row: any) => row.type === 'refund')
      .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_credits || 0)), 0);
    const terminalCampaignIds = new Set(
      ledgerRows
        .filter((row: any) => row.type === 'use' || row.type === 'release')
        .map((row: any) => row.campaign_id)
        .filter(Boolean),
    );
    const reservedCredits = ledgerRows
      .filter((row: any) => row.type === 'reserve' && row.campaign_id && !terminalCampaignIds.has(row.campaign_id))
      .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_credits || 0)), 0);

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        companyName: user.company_name,
        legacyBalance: Number(user.balance || 0),
      },
      summary: {
        enabled: process.env.CREDIT_MODE_ENABLED === 'true',
        hasLedger: lots.length > 0 || (recentLedgerResult.rows || []).length > 0,
        availableCredits,
        reservedCredits,
        totalGrantedCredits,
        totalUsedCredits,
        totalRefundCredits,
        activeLotCount: activeLots.length,
      },
      lots,
      recentLedger: (recentLedgerResult.rows || []).map(mapLedger),
    });
  } catch (error) {
    console.error('[Admin User Credits] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch user credits' });
  }
}
