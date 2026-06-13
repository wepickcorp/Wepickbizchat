import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, decimal, text, jsonb } from 'drizzle-orm/pg-core';
import crypto from 'crypto';
import { CREDIT_PRODUCTS } from '../../../../../shared/credit-policy';

const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  transactionId: varchar("transaction_id"),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  adminId: varchar("admin_id"),
  adminNote: text("admin_note"),
  bankName: varchar("bank_name", { length: 50 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountHolder: varchar("account_holder", { length: 50 }),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }),
  description: text("description"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
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
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAdminToken(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);
  if (!verified) return null;
  try {
    const db = getDb();
    const admin = await db.select().from(admins).where(eq(admins.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch { return null; }
}

function getClientIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         req.headers['x-real-ip'] as string ||
         'unknown';
}

const CREDIT_PRODUCT_PRICING: Record<string, { priceKrw: number; credits: number }> = {
  light: { priceKrw: CREDIT_PRODUCTS.light.priceKrw, credits: CREDIT_PRODUCTS.light.credits },
  topup: { priceKrw: CREDIT_PRODUCTS.topup.priceKrw, credits: CREDIT_PRODUCTS.topup.credits },
  booster: { priceKrw: CREDIT_PRODUCTS.booster.priceKrw, credits: CREDIT_PRODUCTS.booster.credits },
  enterprise: { priceKrw: CREDIT_PRODUCTS.enterprise.priceKrw, credits: CREDIT_PRODUCTS.enterprise.credits },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (admin.role !== 'super' && admin.role !== 'finance') {
    return res.status(403).json({ error: '권한이 없습니다' });
  }

  const { id } = req.query;
  const { action, adminNote } = req.body;

  if (!action || !['approve', 'reject', 'complete'].includes(action)) {
    return res.status(400).json({ error: '올바른 작업을 선택해주세요' });
  }

  try {
    const db = getDb();

    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id as string)).limit(1);
    if (!refund) {
      return res.status(404).json({ error: '환불 요청을 찾을 수 없습니다' });
    }

    if (refund.status === 'completed') {
      return res.status(400).json({ error: '이미 처리 완료된 환불입니다' });
    }

    let newStatus = refund.status;

    if (action === 'approve') {
      if (refund.status !== 'pending') {
        return res.status(400).json({ error: '대기 중인 환불만 승인할 수 있습니다' });
      }
      newStatus = 'approved';
    } else if (action === 'reject') {
      if (refund.status !== 'pending' && refund.status !== 'approved') {
        return res.status(400).json({ error: '처리 가능한 환불 상태가 아닙니다' });
      }
      newStatus = 'rejected';
    } else if (action === 'complete') {
      if (refund.status !== 'approved') {
        return res.status(400).json({ error: '승인된 환불만 완료 처리할 수 있습니다' });
      }
      newStatus = 'completed';

      const [user] = await db.select().from(users).where(eq(users.id, refund.userId)).limit(1);
      if (user) {
        const refundAmount = Number(refund.amount);
        if (process.env.CREDIT_MODE_ENABLED === 'true') {
          const idempotencyKey = `refund-complete:${refund.id}`;

          const result = await db.execute(sql`
            WITH target_refund AS (
              SELECT *
              FROM refunds
              WHERE id = ${refund.id}
                AND status = 'approved'
              FOR UPDATE
            ),
            existing_ledger AS (
              SELECT id, balance_after_credits
              FROM credit_ledger
              WHERE idempotency_key = ${idempotencyKey}
              LIMIT 1
            ),
            priced_lots AS (
              SELECT
                id,
                product_type,
                remaining_credits::integer AS remaining_credits,
                expires_at,
                CASE product_type
                  WHEN 'light' THEN ${CREDIT_PRODUCT_PRICING.light.priceKrw / CREDIT_PRODUCT_PRICING.light.credits}::numeric
                  WHEN 'topup' THEN ${CREDIT_PRODUCT_PRICING.topup.priceKrw / CREDIT_PRODUCT_PRICING.topup.credits}::numeric
                  WHEN 'booster' THEN ${CREDIT_PRODUCT_PRICING.booster.priceKrw / CREDIT_PRODUCT_PRICING.booster.credits}::numeric
                  WHEN 'enterprise' THEN ${CREDIT_PRODUCT_PRICING.enterprise.priceKrw / CREDIT_PRODUCT_PRICING.enterprise.credits}::numeric
                  ELSE NULL
                END AS unit_price_krw
              FROM credit_grants
              WHERE user_id = ${refund.userId}
                AND remaining_credits > 0
                AND expires_at > NOW()
            ),
            active_lots AS (
              SELECT
                *,
                remaining_credits * unit_price_krw AS lot_value_krw,
                COALESCE(
                  SUM(remaining_credits * unit_price_krw) OVER (
                    ORDER BY expires_at ASC, id ASC
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                  ),
                  0
                ) AS value_before_krw
              FROM priced_lots
              WHERE unit_price_krw IS NOT NULL
            ),
            refundable AS (
              SELECT COALESCE(SUM(lot_value_krw), 0)::numeric AS value_krw
              FROM active_lots
            ),
            active_credit_balance AS (
              SELECT COALESCE(SUM(remaining_credits), 0)::integer AS credits
              FROM priced_lots
            ),
            selected_lots AS (
              SELECT
                id,
                product_type,
                unit_price_krw,
                expires_at,
                remaining_credits,
                LEAST(lot_value_krw, ${refundAmount}::numeric - value_before_krw) AS refund_value_krw
              FROM active_lots
              WHERE value_before_krw < ${refundAmount}::numeric
            ),
            calculated_lots AS (
              SELECT
                id,
                product_type,
                unit_price_krw,
                expires_at,
                LEAST(remaining_credits, CEIL(refund_value_krw / unit_price_krw)::integer) AS refunded_credits
              FROM selected_lots
              WHERE refund_value_krw > 0
            ),
            updated_lots AS (
              UPDATE credit_grants AS grant
              SET
                remaining_credits = grant.remaining_credits - calculated_lots.refunded_credits,
                updated_at = NOW()
              FROM calculated_lots, refundable
              WHERE grant.id = calculated_lots.id
                AND calculated_lots.refunded_credits > 0
                AND refundable.value_krw >= ${refundAmount}::numeric
                AND NOT EXISTS (SELECT 1 FROM existing_ledger)
                AND EXISTS (SELECT 1 FROM target_refund)
              RETURNING
                grant.id,
                calculated_lots.product_type,
                calculated_lots.unit_price_krw,
                calculated_lots.refunded_credits,
                grant.remaining_credits AS remaining_credits_after,
                calculated_lots.refunded_credits * calculated_lots.unit_price_krw AS refund_value_krw,
                calculated_lots.expires_at
            ),
            allocation_json AS (
              SELECT COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'creditGrantId', id,
                    'refundedCredits', refunded_credits,
                    'remainingCreditsAfter', remaining_credits_after,
                    'productType', product_type,
                    'unitPriceKrw', unit_price_krw,
                    'refundValueKrw', refund_value_krw
                  )
                  ORDER BY expires_at ASC, id ASC
                ),
                '[]'::jsonb
              ) AS data
              FROM updated_lots
            ),
            active_balance AS (
              SELECT (
                (SELECT credits FROM active_credit_balance)
                - COALESCE((SELECT SUM(refunded_credits) FROM updated_lots), 0)::integer
              ) AS balance_after_credits
            ),
            inserted_ledger AS (
              INSERT INTO credit_ledger (
                user_id,
                credit_grant_id,
                type,
                amount_credits,
                balance_after_credits,
                idempotency_key,
                description,
                metadata
              )
              SELECT
                ${refund.userId},
                (SELECT id FROM updated_lots ORDER BY expires_at ASC, id ASC LIMIT 1),
                'refund',
                -COALESCE((SELECT SUM(refunded_credits) FROM updated_lots), 0)::integer,
                active_balance.balance_after_credits,
                ${idempotencyKey},
                ${`환불 완료 (${refund.reason})`},
                jsonb_build_object(
                  'refundId', ${refund.id},
                  'refundAmount', ${refundAmount},
                  'totalRefundedCredits', COALESCE((SELECT SUM(refunded_credits) FROM updated_lots), 0)::integer,
                  'allocations', allocation_json.data,
                  'adminId', ${admin.id}
                )
              FROM active_balance, allocation_json, refundable
              WHERE NOT EXISTS (SELECT 1 FROM existing_ledger)
                AND refundable.value_krw >= ${refundAmount}::numeric
                AND COALESCE((SELECT SUM(refunded_credits) FROM updated_lots), 0) > 0
              ON CONFLICT (idempotency_key) DO NOTHING
              RETURNING id, balance_after_credits
            ),
            updated_refund AS (
              UPDATE refunds
              SET
                status = 'completed',
                admin_id = ${admin.id},
                admin_note = COALESCE(${adminNote || null}, admin_note),
                processed_at = NOW(),
                updated_at = NOW()
              WHERE id = ${refund.id}
                AND status = 'approved'
                AND (
                  EXISTS (SELECT 1 FROM inserted_ledger)
                  OR EXISTS (SELECT 1 FROM existing_ledger)
                )
              RETURNING id
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
                'refund_complete',
                'refund',
                ${refund.id},
                jsonb_build_object(
                  'amount', ${refund.amount},
                  'previousStatus', ${refund.status},
                  'newStatus', 'completed',
                  'adminNote', ${adminNote || null},
                  'idempotencyKey', ${idempotencyKey}
                ),
                ${getClientIp(req)},
                NOW()
              WHERE EXISTS (SELECT 1 FROM updated_refund)
              RETURNING id
            )
            SELECT
              EXISTS (SELECT 1 FROM target_refund) AS refund_found,
              EXISTS (SELECT 1 FROM existing_ledger) AS already_processed,
              EXISTS (SELECT 1 FROM inserted_ledger) AS ledger_inserted,
              EXISTS (SELECT 1 FROM updated_refund) AS refund_updated,
              (SELECT value_krw FROM refundable) AS refundable_value_krw,
              COALESCE(
                (SELECT balance_after_credits FROM inserted_ledger LIMIT 1),
                (SELECT balance_after_credits FROM existing_ledger LIMIT 1),
                (SELECT balance_after_credits FROM active_balance LIMIT 1)
              ) AS balance_after_credits
          `);

          const row = result.rows?.[0] || {};
          const refundableValueKrw = Number(row.refundable_value_krw || 0);

          if (!row.refund_found) {
            return res.status(400).json({ error: '승인된 환불만 완료 처리할 수 있습니다' });
          }
          if (!row.already_processed && refundableValueKrw < refundAmount) {
            return res.status(400).json({
              error: `환불 가능한 크레딧 가치가 부족합니다. 환불 가능 약 ${Math.floor(refundableValueKrw).toLocaleString('ko-KR')}원`,
            });
          }
          if (!row.already_processed && !row.ledger_inserted) {
            return res.status(400).json({ error: '환불 가능한 상품 크레딧이 부족합니다' });
          }
          if (!row.refund_updated) {
            return res.status(500).json({ error: '환불 완료 처리에 실패했습니다' });
          }
        } else {
          const currentBalance = Number(user.balance || 0);
          if (refundAmount <= 0 || currentBalance < refundAmount) {
            return res.status(400).json({ error: '환불 금액이 현재 잔액보다 많습니다' });
          }
          const newBalance = currentBalance - refundAmount;

          await db.update(users)
            .set({ balance: String(newBalance), updatedAt: new Date() })
            .where(eq(users.id, refund.userId));

          await db.insert(transactions).values({
            userId: refund.userId,
            type: 'refund',
            amount: String(-refundAmount),
            balanceAfter: String(Math.max(0, newBalance)),
            description: `환불 완료 (${refund.reason})`,
            paymentMethod: 'bank_transfer',
          });
        }
      }
    }

    if (action !== 'complete' || process.env.CREDIT_MODE_ENABLED !== 'true') {
      await db.update(refunds)
        .set({
          status: newStatus,
          adminId: admin.id,
          adminNote: adminNote || refund.adminNote,
          processedAt: ['approved', 'rejected', 'completed'].includes(newStatus) ? new Date() : refund.processedAt,
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, id as string));

      await db.insert(adminLogs).values({
        adminId: admin.id,
        action: `refund_${action}`,
        targetType: 'refund',
        targetId: id as string,
        details: {
          amount: refund.amount,
          previousStatus: refund.status,
          newStatus,
          adminNote,
        },
        ipAddress: getClientIp(req),
      });
    }

    return res.status(200).json({ success: true, status: newStatus });
  } catch (error) {
    console.error('[Admin Refund Process] Error:', error);
    return res.status(500).json({ error: '환불 처리 중 오류가 발생했습니다' });
  }
}
