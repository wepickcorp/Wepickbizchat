import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

// 지역명 → hcode 매핑 (BizChat API 규격)
const REGION_HCODE_MAP: Record<string, string> = {
  '서울': '11',
  '경기': '41',
  '인천': '28',
  '부산': '26',
  '대구': '27',
  '광주': '29',
  '대전': '30',
  '울산': '31',
  '세종': '36',
  '강원': '51',
  '충북': '43',
  '충남': '44',
  '전북': '52',
  '전남': '46',
  '경북': '47',
  '경남': '48',
  '제주': '50',
};

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

function generateTid(): string {
  return Date.now().toString();
}

// BizChat API 규격 v0.29.0에 맞는 ATS 필터 조건 생성
interface ATSFilterCondition {
  data: unknown;
  dataType: 'number' | 'code' | 'boolean' | 'cate';
  metaType: 'svc' | 'loc' | 'pro' | 'app' | 'STREET' | 'TEL';
  code: string;
  desc: string;
  not: boolean;
}

// 타겟팅 조건을 BizChat ATS mosu 형식으로 변환
function buildATSMosuPayload(params: {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  regions?: string[];
}): { payload: { '$and': ATSFilterCondition[] }; desc: string } {
  const conditions: ATSFilterCondition[] = [];
  const descParts: string[] = [];

  // 연령 필터 (metaType: svc, code: cust_age_cd)
  if (params.ageMin !== undefined || params.ageMax !== undefined) {
    const min = params.ageMin ?? 0;
    const max = params.ageMax ?? 100;
    conditions.push({
      data: { gt: min, lt: max },
      dataType: 'number',
      metaType: 'svc',
      code: 'cust_age_cd',
      desc: `연령: ${min}세 ~ ${max}세`,
      not: false,
    });
    descParts.push(`연령: ${min}세 ~ ${max}세`);
  }

  // 성별 필터 (BizChat API 규격: code는 'sex_cd', data는 ['1'] 또는 ['2'])
  if (params.gender && params.gender !== 'all') {
    const genderValue = params.gender === 'male' ? '1' : '2';
    const genderName = params.gender === 'male' ? '남자' : '여자';
    conditions.push({
      data: [genderValue],
      dataType: 'code',
      metaType: 'svc',
      code: 'sex_cd',
      desc: `성별: ${genderName}`,
      not: false,
    });
    descParts.push(`성별: ${genderName}`);
  }

  // 지역 필터 (metaType: loc, code: home_location)
  if (params.regions && Array.isArray(params.regions) && params.regions.length > 0) {
    const hcodes: string[] = [];
    const regionNames: string[] = [];
    for (const region of params.regions) {
      const hcode = REGION_HCODE_MAP[region];
      if (hcode) {
        hcodes.push(hcode);
        regionNames.push(region);
      }
    }
    if (hcodes.length > 0) {
      conditions.push({
        data: hcodes,
        dataType: 'code',
        metaType: 'loc',
        code: 'home_location',
        desc: `추정 집주소: ${regionNames.join(', ')}`,
        not: false,
      });
      descParts.push(`지역: ${regionNames.join(', ')}`);
    }
  }

  // BizChat API 규격: 루트 객체는 항상 $and 또는 $or 컨테이너여야 함
  // 조건이 없어도 {$and: []}로 반환
  return {
    payload: { '$and': conditions },
    desc: descParts.join(', ')
  };
}

async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown> | { '$and': ATSFilterCondition[] },
  useProduction: boolean = false
) {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction
    ? process.env.BIZCHAT_PROD_API_KEY
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error(`BizChat API key not configured`);
  }

  const tid = generateTid();
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${baseUrl}${endpoint}${separator}tid=${tid}`;

  console.log(`[BizChat ATS] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat ATS] Request body:`, JSON.stringify(body, null, 2));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  console.log(`[BizChat ATS] Response: ${response.status} - ${responseText.substring(0, 500)}`);

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
  const detectEnv = (): boolean => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
    if (forceDevMode) {
      console.log('[BizChat ATS] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    if (process.env.VERCEL_ENV === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat ATS] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  const action = req.body?.action || 'mosu';

  try {
    switch (action) {
      case 'meta': {
        const result = await callBizChatAPI('/api/v1/ats/meta/filter', 'POST', {}, useProduction);
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'meta',
          data: result.data,
        });
      }

      case 'meta_loc': {
        const result = await callBizChatAPI('/api/v1/ats/meta/loc/full', 'POST', {}, useProduction);
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'meta_loc',
          data: result.data,
        });
      }

      case 'mosu':
      case 'count': {
        // BizChat API 규격 v0.29.0: /api/v1/ats/mosu 엔드포인트 사용
        const { gender, ageMin, ageMax, regions } = req.body;

        // 올바른 ATS mosu 페이로드 구성
        const { payload, desc } = buildATSMosuPayload({
          gender,
          ageMin,
          ageMax,
          regions,
        });

        const result = await callBizChatAPI('/api/v1/ats/mosu', 'POST', payload, useProduction);

        if (result.data.code === 'S000001') {
          return res.status(200).json({
            success: true,
            action: 'mosu',
            estimatedCount: result.data.data?.cnt || 0,
            filterStr: result.data.data?.filterStr || '',
            query: result.data.data?.query || '',
            sndMosuQuery: JSON.stringify(payload),
            filterDescription: desc,
            rawResponse: result.data,
          });
        } else {
          return res.status(200).json({
            success: false,
            action: 'mosu',
            error: result.data.msg || 'Failed to get count',
            code: result.data.code,
            sndMosuQuery: JSON.stringify(payload),
            filterDescription: desc,
            rawResponse: result.data,
          });
        }
      }

      case 'filter': {
        // BizChat API 규격: /api/v1/ats/filter 사용
        const { gender, ageMin, ageMax, regions, pageNumber, pageSize } = req.body;

        const { payload } = buildATSMosuPayload({
          gender,
          ageMin,
          ageMax,
          regions,
        });

        // 페이지네이션 정보 추가
        const filterPayload = {
          ...payload,
          pageNumber: pageNumber || 1,
          pageSize: pageSize || 100,
        };

        const result = await callBizChatAPI('/api/v1/ats/filter', 'POST', filterPayload, useProduction);

        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'filter',
          data: result.data.data,
          rawResponse: result.data,
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['meta', 'meta_loc', 'mosu', 'count', 'filter'],
        });
    }
  } catch (error) {
    console.error('[BizChat ATS] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
