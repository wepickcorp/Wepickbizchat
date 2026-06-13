import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, numeric, varchar } from 'drizzle-orm/pg-core';
import { createHash } from 'crypto';
import { CREDIT_PRODUCTS, type CreditProductType } from '../../../shared/credit-policy';
import { grantPurchasedCreditsForServerless } from '../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  balance: numeric('balance', { precision: 12, scale: 2 }).default('0').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const transactions = pgTable('transactions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 0 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 0 }).notNull(),
  description: text('description'),
  paymentMethod: text('payment_method'),
  stripeSessionId: text('stripe_session_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

function isCreditProductType(value: unknown): value is CreditProductType {
  return typeof value === 'string' && value in CREDIT_PRODUCTS;
}

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
}

async function ensurePaymentOrdersTable(db: ReturnType<typeof getDb>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      provider varchar(30) NOT NULL,
      order_no varchar(120) NOT NULL UNIQUE,
      user_id varchar NOT NULL REFERENCES users(id),
      product_type varchar(30),
      amount_krw integer NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending',
      payment_reference varchar(120),
      metadata jsonb,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payment_orders_reference ON payment_orders(payment_reference)`);
}

function generateEncData(mid: string, ediDate: string, goodsAmt: string, merchantKey: string): string {
  // KIS PG: SHA256(mid + ediDate + goodsAmt + merchantKey)
  const data = mid + ediDate + goodsAmt + merchantKey;
  return createHash('sha256').update(data).digest('hex');
}

function parseFormBody(body: any): Record<string, string> {
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body || {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let params: Record<string, string>;

    if (req.method === 'POST') {
      params = parseFormBody(req.body);
    } else {
      params = Object.fromEntries(
        Object.entries(req.query).map(([k, v]) => [k, String(v)])
      );
    }

    const {
      resultCd,
      resultMsg,
      tid,
      ordNo,
      amt,
    } = params;

    const baseUrl = process.env.SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null)
      || 'http://localhost:5000';

    if (resultCd !== '0000') {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', resultMsg || '결제가 실패했습니다');
      return res.redirect(302, errorUrl.toString());
    }

    const mid = (process.env.KISPG_MID || '').trim();
    const merchantKey = (process.env.KISPG_MERCHANT_KEY || '').trim();

    if (!mid || !merchantKey) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '결제 설정 오류');
      return res.redirect(302, errorUrl.toString());
    }

    // KIS PG 샘플 기준: 콜백에서 받은 encData 검증은 하지 않음
    // 결제 승인 API 호출 시 새로운 encData 생성하여 사용
    const amount = Number.parseFloat(amt);
    if (!tid || !ordNo || !amt || !Number.isFinite(amount) || amount <= 0) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', 'Invalid payment callback data');
      return res.redirect(302, errorUrl.toString());
    }

    const db = getDb();
    await ensurePaymentOrdersTable(db);
    const paymentReference = `kispg:${tid}`;
    const orderResult = await db.execute(sql`
      SELECT *
      FROM payment_orders
      WHERE provider = 'kispg'
        AND order_no = ${ordNo}
      LIMIT 1
    `);
    const order = orderResult.rows?.[0];

    if (!order) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '결제 주문 정보를 찾을 수 없습니다');
      return res.redirect(302, errorUrl.toString());
    }

    const orderAmount = Number(order.amount_krw || 0);
    if (orderAmount !== amount) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '결제 금액이 주문 정보와 일치하지 않습니다');
      return res.redirect(302, errorUrl.toString());
    }

    const [existingTransaction] = await db
      .select()
      .from(transactions)
      .where(sql`${transactions.stripeSessionId} = ${paymentReference} OR ${transactions.description} LIKE ${`%${tid}%`}`)
      .limit(1);

    console.log('[KISPG Callback] Auth callback received - tid:', tid, 'amt:', amt);

    if (existingTransaction) {
      console.warn('[KISPG Callback] Duplicate payment callback will retry credit grant:', tid);
    } else {
      // KISPG_USE_PROD=true 설정 시에만 운영 API 사용, 기본값은 테스트 API
      const useProductionApi = process.env.KISPG_USE_PROD === 'true';
      const kispgPaymentUrl = useProductionApi
        ? 'https://api.kispg.co.kr/v2/payment'
        : 'https://testapi.kispg.co.kr/v2/payment';

      console.log('[KISPG Callback] Using payment API:', kispgPaymentUrl);
      console.log('[KISPG Callback] tid:', tid);
      console.log('[KISPG Callback] amt:', amt);

      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const paymentEdiDate = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
      const paymentEncData = generateEncData(mid, paymentEdiDate, amt, merchantKey);

      const paymentResponse = await fetch(kispgPaymentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mid,
          tid,
          goodsAmt: amt,
          ediDate: paymentEdiDate,
          encData: paymentEncData,
          charset: 'UTF-8',
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (paymentResult.resultCd !== '0000') {
        const errorUrl = new URL(`${baseUrl}/billing`);
        errorUrl.searchParams.set('error', 'true');
        errorUrl.searchParams.set('message', paymentResult.resultMsg || '승인 실패');
        return res.redirect(302, errorUrl.toString());
      }
    }

    const userId = String(order.user_id);
    const productType = isCreditProductType(order.product_type) ? order.product_type : null;

    if (process.env.CREDIT_MODE_ENABLED === 'true' && productType) {
      const product = CREDIT_PRODUCTS[productType];
      const grantResult = await grantPurchasedCreditsForServerless(db, {
        userId,
        transactionId: null,
        productType,
        paymentReference,
        metadata: { tid, ordNo },
      });

      if (!grantResult.success && !grantResult.alreadyProcessed) {
        const reason = grantResult.lightLimitBlocked ? 'light monthly limit blocked' : grantResult.error;
        throw new Error(`Failed to grant KISPG credits for TID ${tid}: ${reason}`);
      }

      console.log('[KISPG Callback] Credits granted or already present:', userId, product.productType, product.credits);
    }

    const creditResult = await db.execute(sql`
      WITH target_user AS (
        SELECT id, COALESCE(balance, 0) AS balance
        FROM users
        WHERE id = ${userId}
        FOR UPDATE
      ),
      legacy_existing AS (
        SELECT id, balance_after
        FROM transactions
        WHERE stripe_session_id = ${paymentReference}
          OR description LIKE ${`%${tid}%`}
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO transactions (
          user_id,
          type,
          amount,
          balance_after,
          description,
          payment_method,
          stripe_session_id
        )
        SELECT
          target_user.id,
          'charge',
          ${amount.toString()}::numeric,
          target_user.balance + ${amount.toString()}::numeric,
          ${`KISPG 카드 결제 (TID: ${tid})`},
          'card',
          ${paymentReference}
        FROM target_user
        WHERE NOT EXISTS (SELECT 1 FROM legacy_existing)
        ON CONFLICT (stripe_session_id) DO NOTHING
        RETURNING id, balance_after
      ),
      effective_transaction AS (
        SELECT id, balance_after FROM inserted
        UNION ALL
        SELECT id, balance_after FROM legacy_existing
      ),
      updated AS (
        UPDATE users
        SET
          balance = inserted.balance_after,
          updated_at = NOW()
        FROM inserted
        WHERE users.id = ${userId}
        RETURNING users.id
      )
      SELECT
        EXISTS (SELECT 1 FROM legacy_existing) AS already_processed,
        EXISTS (SELECT 1 FROM inserted) AS transaction_inserted,
        EXISTS (SELECT 1 FROM updated) AS balance_updated,
        (SELECT id FROM effective_transaction LIMIT 1) AS transaction_id,
        (SELECT balance_after FROM effective_transaction LIMIT 1) AS balance_after
    `) as any;

    const creditRow = creditResult.rows?.[0] ?? creditResult[0];

    if (!creditRow?.already_processed && (!creditRow?.transaction_inserted || !creditRow?.balance_updated)) {
      throw new Error('Failed to credit KISPG payment');
    }

    await db.execute(sql`
      UPDATE payment_orders
      SET
        status = 'paid',
        payment_reference = ${paymentReference},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ tid, resultCd })}::jsonb,
        updated_at = now()
      WHERE order_no = ${ordNo}
    `);

    const successUrl = new URL(`${baseUrl}/billing`);
    successUrl.searchParams.set('success', 'true');
    successUrl.searchParams.set('amount', amt);
    if (creditRow?.already_processed) {
      successUrl.searchParams.set('duplicate', 'true');
    }
    return res.redirect(302, successUrl.toString());

  } catch (error) {
    console.error('KISPG callback error:', error);
    const baseUrl = process.env.SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null)
      || 'http://localhost:5000';

    const errorUrl = new URL(`${baseUrl}/billing`);
    errorUrl.searchParams.set('error', 'true');
    errorUrl.searchParams.set('message', '결제 처리 중 오류가 발생했습니다');
    return res.redirect(302, errorUrl.toString());
  }
}
