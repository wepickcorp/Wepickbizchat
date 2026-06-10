import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, desc, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, numeric, varchar } from 'drizzle-orm/pg-core';
import { createHash } from 'crypto';

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

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set');
  return drizzle(neon(dbUrl));
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
    const paymentReference = `kispg:${tid}`;
    const [existingTransaction] = await db
      .select()
      .from(transactions)
      .where(sql`${transactions.stripeSessionId} = ${paymentReference} OR ${transactions.description} LIKE ${`%${tid}%`}`)
      .limit(1);

    if (existingTransaction) {
      console.warn('[KISPG Callback] Duplicate payment callback ignored:', tid);
      const successUrl = new URL(`${baseUrl}/billing`);
      successUrl.searchParams.set('success', 'true');
      successUrl.searchParams.set('amount', amt);
      successUrl.searchParams.set('duplicate', 'true');
      return res.redirect(302, successUrl.toString());
    }

    console.log('[KISPG Callback] Auth callback received - tid:', tid, 'amt:', amt);

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

    const shortUserId = ordNo.includes('_') ? ordNo.split('_')[1] : null;
    
    if (!shortUserId) {
      console.error('Could not extract userId from ordNo:', ordNo);
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '사용자 정보 오류');
      return res.redirect(302, errorUrl.toString());
    }

    const allUsers = await db.select().from(users);
    const userResult = allUsers.filter(u => u.id.replace(/-/g, '').startsWith(shortUserId));
    if (!userResult[0]) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '사용자를 찾을 수 없습니다');
      return res.redirect(302, errorUrl.toString());
    }

    const userId = userResult[0].id;
    const creditResult = await db.execute(sql`
      WITH target_user AS (
        SELECT id, COALESCE(balance, 0) AS balance
        FROM users
        WHERE id = ${userId}
        FOR UPDATE
      ),
      legacy_existing AS (
        SELECT id
        FROM transactions
        WHERE description LIKE ${`%${tid}%`}
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
        RETURNING balance_after
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
        (EXISTS (SELECT 1 FROM legacy_existing) OR NOT EXISTS (SELECT 1 FROM inserted)) AS already_processed,
        EXISTS (SELECT 1 FROM inserted) AS transaction_inserted,
        EXISTS (SELECT 1 FROM updated) AS balance_updated
    `) as any;

    const creditRow = creditResult.rows?.[0] ?? creditResult[0];

    if (creditRow?.already_processed) {
      console.warn('[KISPG Callback] Duplicate payment callback ignored after approval:', tid);
      const successUrl = new URL(`${baseUrl}/billing`);
      successUrl.searchParams.set('success', 'true');
      successUrl.searchParams.set('amount', amt);
      successUrl.searchParams.set('duplicate', 'true');
      return res.redirect(302, successUrl.toString());
    }

    if (!creditRow?.transaction_inserted || !creditRow?.balance_updated) {
      throw new Error('Failed to credit KISPG payment');
    }

    const successUrl = new URL(`${baseUrl}/billing`);
    successUrl.searchParams.set('success', 'true');
    successUrl.searchParams.set('amount', amt);
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
