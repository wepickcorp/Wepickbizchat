import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, desc, eq, and } from 'drizzle-orm';
import { pgTable, varchar, timestamp, decimal, text } from 'drizzle-orm/pg-core';
import { createClient } from '@supabase/supabase-js';
import { CREDIT_PRODUCTS } from '../../../shared/credit-policy';

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
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

const creditGrants = pgTable("credit_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  productType: varchar("product_type", { length: 30 }),
  remainingCredits: decimal("remaining_credits", { precision: 12, scale: 0 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

const CREDIT_UNIT_PRICE: Record<string, number> = {
  light: CREDIT_PRODUCTS.light.priceKrw / CREDIT_PRODUCTS.light.credits,
  topup: CREDIT_PRODUCTS.topup.priceKrw / CREDIT_PRODUCTS.topup.credits,
  booster: CREDIT_PRODUCTS.booster.priceKrw / CREDIT_PRODUCTS.booster.credits,
  enterprise: CREDIT_PRODUCTS.enterprise.priceKrw / CREDIT_PRODUCTS.enterprise.credits,
};

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

async function getAuthenticatedUser(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: '로그인이 필요합니다' });
  }

  const db = getDb();

  if (req.method === 'GET') {
    try {
      const userRefunds = await db
        .select()
        .from(refunds)
        .where(eq(refunds.userId, user.id))
        .orderBy(desc(refunds.createdAt));

      return res.status(200).json(userRefunds);
    } catch (error) {
      console.error('[Refunds GET] Error:', error);
      return res.status(500).json({ error: '환불 내역 조회 중 오류가 발생했습니다' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { amount, reason, bankName, accountNumber, accountHolder } = req.body || {};

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 10000) {
        return res.status(400).json({ error: '환불 금액은 최소 10,000원 이상이어야 합니다' });
      }
      if (!reason || reason.trim().length < 5) {
        return res.status(400).json({ error: '환불 사유를 5자 이상 입력해주세요' });
      }
      if (!bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ error: '계좌 정보를 모두 입력해주세요' });
      }

      const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (!dbUser) {
        return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
      }

      if (process.env.CREDIT_MODE_ENABLED === 'true') {
        const activeCreditLots = await db
          .select({
            remainingCredits: creditGrants.remainingCredits,
            productType: creditGrants.productType,
          })
          .from(creditGrants)
          .where(and(
            eq(creditGrants.userId, user.id),
            sql`${creditGrants.remainingCredits} > 0`,
            sql`${creditGrants.expiresAt} > ${new Date()}`,
          ));
        const refundableCredits = activeCreditLots.reduce(
          (sum, lot) => sum + Number(lot.remainingCredits || 0),
          0,
        );
        if (refundableCredits <= 0) {
          return res.status(400).json({
            error: '환불 가능한 크레딧이 없습니다. 예약 중이거나 이미 사용된 크레딧은 환불 신청에서 제외됩니다',
          });
        }
        const refundableValueKrw = activeCreditLots.reduce((sum, lot) => {
          const productType = String(lot.productType || '');
          const unitPrice = CREDIT_UNIT_PRICE[productType] || 0;
          return sum + Number(lot.remainingCredits || 0) * unitPrice;
        }, 0);
        if (numAmount > Math.floor(refundableValueKrw)) {
          return res.status(400).json({
            error: `환불 가능 금액은 약 ${Math.floor(refundableValueKrw).toLocaleString('ko-KR')}원입니다`,
          });
        }
      } else {
        const currentBalance = Number(dbUser.balance || 0);
        if (numAmount > currentBalance) {
          return res.status(400).json({ error: '환불 금액이 현재 잔액보다 많습니다' });
        }
      }

      const [pendingRefund] = await db
        .select()
        .from(refunds)
        .where(and(eq(refunds.userId, user.id), eq(refunds.status, 'pending')))
        .limit(1);

      if (pendingRefund) {
        return res.status(400).json({ error: '이미 처리 중인 환불 신청이 있습니다' });
      }

      const [newRefund] = await db.insert(refunds).values({
        userId: user.id,
        amount: String(numAmount),
        reason: reason.trim(),
        bankName,
        accountNumber,
        accountHolder,
        status: 'pending',
      }).returning();

      return res.status(201).json({
        success: true,
        refund: newRefund,
        message: '환불 신청이 접수되었습니다. 영업일 기준 3-5일 내 처리됩니다.',
      });
    } catch (error) {
      console.error('[Refunds POST] Error:', error);
      return res.status(500).json({ error: '환불 신청 중 오류가 발생했습니다' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
