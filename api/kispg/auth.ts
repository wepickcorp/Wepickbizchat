import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

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

function generateOrderNo(userId: string): string {
  const timestamp = Date.now().toString().slice(-10);
  const shortUserId = userId.replace(/-/g, '').slice(0, 8);
  return `BC${timestamp}_${shortUserId}`;
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

    const { amount } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({ error: '최소 충전 금액은 10,000원입니다' });
    }

    const mid = (process.env.KISPG_MID || '').trim();
    const merchantKey = (process.env.KISPG_MERCHANT_KEY || '').trim();

    if (!mid || !merchantKey) {
      return res.status(500).json({ error: 'KISPG configuration is missing' });
    }

    const ediDate = getEdiDate();
    const ordNo = generateOrderNo(auth.userId);
    const goodsAmt = amount.toString();
    const encData = generateEncData(mid, ediDate, goodsAmt, merchantKey);

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

    const mallNm = '(주)위픽코퍼레이션';
    const mchtNm = mallNm;

    // MOB 모델 사용 - 전체 페이지 리다이렉트 방식
    // WEB 모델은 iframe + postMessage 방식이므로 현재 구현에 적합하지 않음
    const authParams = {
      payMethod: 'CARD',
      model: 'MOB',
      channel: '0002',
      trxCd: '0',
      mid,
      mallNm,
      mchtNm,
      goodsNm: 'BizChat 잔액 충전',
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
    
    console.log('[KISPG Auth] model: MOB, channel: 0002');

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
