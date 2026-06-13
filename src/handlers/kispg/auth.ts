import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { CREDIT_PRODUCTS, type CreditProductType } from '../../../shared/credit-policy';
import { hasLightCreditGrantInCurrentKstMonthForServerless } from '../_shared/credit-ledger';

neonConfig.fetchConnectionCache = true;

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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return { userId: user.id, email: user.email || '' };
  } catch { return null; }
}

function generateEncData(mid: string, ediDate: string, goodsAmt: string, merchantKey: string): string {
  // KIS PG: SHA256(mid + ediDate + goodsAmt + merchantKey)
  // merchantKey는 원본 문자열 그대로 사용 (Base64 디코딩 안함)
  const data = mid + ediDate + goodsAmt + merchantKey;
  const hash = createHash('sha256').update(data).digest('hex');
  console.log('[KISPG] encData generated with SHA256');
  console.log('[KISPG] Input: mid=' + mid + ', ediDate=' + ediDate + ', goodsAmt=' + goodsAmt);
  return hash;
}

function getEdiDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function isCreditProductType(value: unknown): value is CreditProductType {
  return typeof value === 'string' && value in CREDIT_PRODUCTS;
}

function generateOrderNo(_userId: string, productType?: CreditProductType): string {
  const timestamp = Date.now().toString().slice(-10);
  const nonce = randomBytes(4).toString('hex');
  return productType ? `BC${timestamp}_${nonce}_${productType}` : `BC${timestamp}_${nonce}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { amount, productType } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({ error: '최소 충전 금액은 10,000원입니다' });
    }

    const creditProduct = isCreditProductType(productType) ? CREDIT_PRODUCTS[productType] : null;

    if (process.env.CREDIT_MODE_ENABLED === 'true' && !creditProduct) {
      return res.status(400).json({ error: '크레딧 상품을 선택해주세요' });
    }

    if (creditProduct && creditProduct.priceKrw !== amount) {
      return res.status(400).json({ error: '상품 금액이 올바르지 않습니다' });
    }

    if (process.env.CREDIT_MODE_ENABLED === 'true' && creditProduct?.productType === 'light') {
      const db = getDb();
      if (await hasLightCreditGrantInCurrentKstMonthForServerless(db, auth.userId)) {
        return res.status(400).json({ error: '라이트 충전은 매월 1회만 구매할 수 있습니다' });
      }
    }

    const mid = (process.env.KISPG_MID || '').trim();
    const merchantKey = (process.env.KISPG_MERCHANT_KEY || '').trim();

    if (!mid || !merchantKey) {
      return res.status(500).json({ error: 'KISPG configuration is missing' });
    }

    const ediDate = getEdiDate();
    const ordNo = generateOrderNo(auth.userId, creditProduct?.productType);
    const goodsAmt = amount.toString();
    const encData = generateEncData(mid, ediDate, goodsAmt, merchantKey);
    const db = getDb();
    await ensurePaymentOrdersTable(db);
    await db.execute(sql`
      INSERT INTO payment_orders (
        provider,
        order_no,
        user_id,
        product_type,
        amount_krw,
        status,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        'kispg',
        ${ordNo},
        ${auth.userId},
        ${creditProduct?.productType || null},
        ${amount},
        'pending',
        ${JSON.stringify({ ediDate, model: 'pending' })}::jsonb,
        now(),
        now()
      )
      ON CONFLICT (order_no) DO UPDATE SET
        user_id = excluded.user_id,
        product_type = excluded.product_type,
        amount_krw = excluded.amount_krw,
        status = 'pending',
        metadata = excluded.metadata,
        updated_at = now()
    `);

    // KISPG_RETURN_URL 환경변수가 설정된 경우 우선 사용 (KIS PG에 등록된 URL과 일치해야 함)
    let returnUrl = process.env.KISPG_RETURN_URL;

    if (!returnUrl) {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.REPLIT_DOMAINS?.split(',')[0]
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'http://localhost:5000';
      returnUrl = `${baseUrl}/api/kispg/callback`;
    }

    console.log('[KISPG Auth] returnUrl:', returnUrl);

    // KISPG_USE_PROD=true 설정 시에만 운영 API 사용, 기본값은 테스트 API
    const useProductionApi = process.env.KISPG_USE_PROD === 'true';
    const kispgAuthUrl = useProductionApi
      ? 'https://api.kispg.co.kr/v2/auth'
      : 'https://testapi.kispg.co.kr/v2/auth';

    console.log('[KISPG Auth] Using API:', kispgAuthUrl);
    console.log('[KISPG Auth] MID:', mid);
    console.log('[KISPG Auth] ediDate:', ediDate);
    console.log('[KISPG Auth] goodsAmt:', goodsAmt);

    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

    const mallNm = '(주)위픽코퍼레이션';
    const mchtNm = mallNm;

    // WEB: iframe + postMessage 방식, MOB: 전체 페이지 리다이렉트
    const model = isMobile ? 'MOB' : 'WEB';
    const channel = isMobile ? '0002' : '0001';

    const authParams = {
      payMethod: 'CARD',
      model,
      channel,
      trxCd: '0',
      mid,
      mallNm,
      mchtNm,
      goodsNm: creditProduct ? `BizChat ${creditProduct.name}` : 'BizChat 잔액 충전',
      currencyType: 'KRW',
      ordNo,
      goodsAmt,
      ordNm: auth.email?.split('@')[0] || '고객',
      ordTel: '01000000000',
      userIp: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || '127.0.0.1',
      ediDate,
      encData,
      returnUrl,
      payReqType: '1',
      charset: 'UTF-8',
    };

    console.log('[KISPG Auth] model:', model, 'channel:', channel);

    return res.status(200).json({
      success: true,
      kispgAuthUrl,
      params: authParams,
    });
  } catch (error) {
    console.error('KISPG auth error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
}
