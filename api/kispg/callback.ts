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
      payMethod,
      tid,
      ordNo,
      amt,
      ediDate,
      encData: receivedEncData,
    } = params;

    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.REPLIT_DOMAINS?.split(',')[0]
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';

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

    const expectedEncData = generateEncData(mid, ediDate, amt, merchantKey);
    if (receivedEncData !== expectedEncData) {
      console.error('encData mismatch - possible tampering');
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '결제 검증 실패');
      return res.redirect(302, errorUrl.toString());
    }

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

    const db = getDb();
    const amount = parseFloat(amt);

    const allUsers = await db.select().from(users);
    const userResult = allUsers.filter(u => u.id.replace(/-/g, '').startsWith(shortUserId));
    if (!userResult[0]) {
      const errorUrl = new URL(`${baseUrl}/billing`);
      errorUrl.searchParams.set('error', 'true');
      errorUrl.searchParams.set('message', '사용자를 찾을 수 없습니다');
      return res.redirect(302, errorUrl.toString());
    }

    const userId = userResult[0].id;
    const currentBalance = parseFloat(userResult[0].balance as string) || 0;
    const newBalance = currentBalance + amount;

    await db.update(users).set({
      balance: newBalance.toString(),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    // 거래 내역 삽입 (실패해도 잔액 업데이트는 유지)
    try {
      await db.insert(transactions).values({
        userId,
        type: 'charge',
        amount: amount.toString(),
        balanceAfter: newBalance.toString(),
        description: `KISPG 카드 결제 (TID: ${tid})`,
        paymentMethod: 'card',
      });
    } catch (txError) {
      console.error('[KISPG Callback] Failed to insert transaction record:', txError);
      // 거래 기록 실패는 경고만 로깅
    }

    const successUrl = new URL(`${baseUrl}/billing`);
    successUrl.searchParams.set('success', 'true');
    successUrl.searchParams.set('amount', amt);
    return res.redirect(302, successUrl.toString());

  } catch (error) {
    console.error('KISPG callback error:', error);
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.REPLIT_DOMAINS?.split(',')[0]
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000';
    
    const errorUrl = new URL(`${baseUrl}/billing`);
    errorUrl.searchParams.set('error', 'true');
    errorUrl.searchParams.set('message', '결제 처리 중 오류가 발생했습니다');
    return res.redirect(302, errorUrl.toString());
  }
}
