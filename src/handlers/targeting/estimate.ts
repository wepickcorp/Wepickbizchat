import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const BIZCHAT_DEV_URL = 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = 'https://gw.bizchat1.co.kr';

function getBizChatUrl() {
  return process.env.BIZCHAT_USE_PROD === 'true' ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
}

function getBizChatApiKey() {
  return process.env.BIZCHAT_USE_PROD === 'true'
    ? process.env.BIZCHAT_PROD_API_KEY
    : process.env.BIZCHAT_DEV_API_KEY;
}

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
  '강원': '42',
  '충북': '43',
  '충남': '44',
  '전북': '45',
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

// BizChat API 규격 v0.31.0에 맞는 ATS 필터 조건
interface ATSFilterCondition {
  data: unknown;
  dataType: 'number' | 'code' | 'boolean' | 'cate';
  metaType: 'svc' | 'loc' | 'pro' | 'app' | 'tel' | 'call' | 'STREET' | 'TEL' | 'CALL';
  code: string;
  desc: string;
  not: boolean;
}

// BizChat 규격 카테고리 데이터
interface CategoryData {
  cat1: string;
  cat2?: string;
  cat3?: string;
}

// 새로운 타겟팅 형식 (BizChat v0.31.0 규격)
// cat1/cat2/cat3에는 cateid 코드를 저장, *Name에는 표시명을 저장
interface SelectedCategory {
  cat1: string;       // cateid 코드 (예: "01")
  cat1Name?: string;  // 표시명 (예: "가구/인테리어")
  cat2?: string;      // cateid 코드 (예: "0101")
  cat2Name?: string;  // 표시명
  cat3?: string;      // cateid 코드 (예: "010101")
  cat3Name?: string;  // 표시명
}

interface SelectedLocation {
  code: string;
  type: 'home' | 'work';
  name: string;
}

interface SelectedProfiling {
  code: string;
  value: string | number | boolean | { gt: string | number; lt: string | number };
  desc: string;
}

interface TargetingParams {
  // 기본 타겟팅
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  regions?: string[];
  // 고급 타겟팅 (BizChat 규격)
  shopping11stCategories?: SelectedCategory[];
  webappCategories?: SelectedCategory[];
  callCategories?: SelectedCategory[];
  locations?: SelectedLocation[];
  profiling?: SelectedProfiling[];
}

// 타겟팅 조건을 BizChat ATS mosu 형식으로 변환
function buildATSMosuPayload(params: TargetingParams): { payload: { '$and': ATSFilterCondition[] }; desc: string } {
  const conditions: ATSFilterCondition[] = [];
  const descParts: string[] = [];

  // 1. 연령 필터 (metaType: svc, code: cust_age_cd)
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

  // 2. 성별 필터 (metaType: svc, code: sex_cd)
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

  // 3. 지역 필터 (metaType: loc, code: home_location) - 기본 타겟팅
  if (params.regions && params.regions.length > 0) {
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

  // 4. 11번가 쇼핑 카테고리 (metaType: STREET, dataType: cate)
  // BizChat ATS mosu 형식: cat1/cat2/cat3에 카테고리 이름 사용 (cateid 코드가 아님!)
  if (params.shopping11stCategories && params.shopping11stCategories.length > 0) {
    // 카테고리 이름으로 API 페이로드 구성 (API 규격 v0.29.0)
    const categoryData: CategoryData[] = params.shopping11stCategories.map(cat => ({
      cat1: cat.cat1Name || cat.cat1,  // 카테고리 이름 (예: "가구/인테리어")
      ...(cat.cat2 && { cat2: cat.cat2Name || cat.cat2 }),  // 카테고리 이름 (예: "침대/소파")
      ...(cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }),  // 카테고리 이름 (예: "펠트")
    }));

    // 설명에는 표시명 사용
    const categoryDesc = params.shopping11stCategories.map(cat => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? (cat.cat2Name || cat.cat2) : '';
      const cat3Display = cat.cat3 ? (cat.cat3Name || cat.cat3) : '';
      return `${cat1Display}${cat2Display ? ' > ' + cat2Display : ''}${cat3Display ? ' > ' + cat3Display : ''}`;
    }).join(', ');

    conditions.push({
      data: categoryData,
      dataType: 'cate',
      metaType: 'STREET',  // BizChat ATS mosu API 규격: 11번가는 'STREET'
      code: '',
      desc: `11번가: ${categoryDesc}`,
      not: false,
    });
    descParts.push(`11번가: ${categoryDesc}`);
  }

  // 5. 웹앱 카테고리 (metaType: app, dataType: cate)
  // BizChat ATS mosu 형식: cat1/cat2/cat3에 카테고리 이름 사용 (cateid 코드가 아님!)
  if (params.webappCategories && params.webappCategories.length > 0) {
    // 카테고리 이름으로 API 페이로드 구성 (API 규격 v0.29.0)
    const categoryData: CategoryData[] = params.webappCategories.map(cat => ({
      cat1: cat.cat1Name || cat.cat1,  // 카테고리 이름 (예: "게임")
      ...(cat.cat2 && { cat2: cat.cat2Name || cat.cat2 }),  // 카테고리 이름 (예: "VR/AR게임")
      ...(cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }),  // 카테고리 이름 (예: "포켓몬 고")
    }));

    // 설명에는 표시명 사용
    const categoryDesc = params.webappCategories.map(cat => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? (cat.cat2Name || cat.cat2) : '';
      const cat3Display = cat.cat3 ? (cat.cat3Name || cat.cat3) : '';
      return `${cat1Display}${cat2Display ? ' > ' + cat2Display : ''}${cat3Display ? ' > ' + cat3Display : ''}`;
    }).join(', ');

    conditions.push({
      data: categoryData,
      dataType: 'cate',
      metaType: 'app',  // BizChat ATS mosu API 규격: 웹앱은 'app' (소문자)
      code: '',
      desc: `앱/웹: ${categoryDesc}`,
      not: false,
    });
    descParts.push(`앱/웹: ${categoryDesc}`);
  }

  // 6. 통화Usage 카테고리 (metaType: TEL, dataType: cate)
  // BizChat ATS mosu 형식: cat1/cat2/cat3에 카테고리 이름 사용 (cateid 코드가 아님!)
  if (params.callCategories && params.callCategories.length > 0) {
    // 카테고리 이름으로 API 페이로드 구성 (API 규격 v0.29.0)
    const categoryData: CategoryData[] = params.callCategories.map(cat => ({
      cat1: cat.cat1Name || cat.cat1,  // 카테고리 이름
      ...(cat.cat2 && { cat2: cat.cat2Name || cat.cat2 }),
      ...(cat.cat3 && { cat3: cat.cat3Name || cat.cat3 }),
    }));

    // 설명에는 표시명 사용
    const categoryDesc = params.callCategories.map(cat => {
      const cat1Display = cat.cat1Name || cat.cat1;
      const cat2Display = cat.cat2 ? (cat.cat2Name || cat.cat2) : '';
      const cat3Display = cat.cat3 ? (cat.cat3Name || cat.cat3) : '';
      return `${cat1Display}${cat2Display ? ' > ' + cat2Display : ''}${cat3Display ? ' > ' + cat3Display : ''}`;
    }).join(', ');

    conditions.push({
      data: categoryData,
      dataType: 'cate',
      metaType: 'TEL',  // BizChat ATS mosu API 규격: 통화Usage는 'TEL' (대문자)
      code: '',
      desc: `통화: ${categoryDesc}`,
      not: false,
    });
    descParts.push(`통화: ${categoryDesc}`);
  }

  // 7. 위치 타겟팅 (metaType: loc, code: home_location/work_location)
  if (params.locations && params.locations.length > 0) {
    const homeLocations = params.locations.filter(l => l.type === 'home');
    const workLocations = params.locations.filter(l => l.type === 'work');

    if (homeLocations.length > 0) {
      const hcodes = homeLocations.map(l => l.code);
      const names = homeLocations.map(l => l.name);
      conditions.push({
        data: hcodes,
        dataType: 'code',
        metaType: 'loc',
        code: 'home_location',
        desc: `추정 집주소: ${names.join(', ')}`,
        not: false,
      });
      descParts.push(`집주소: ${names.join(', ')}`);
    }

    if (workLocations.length > 0) {
      const hcodes = workLocations.map(l => l.code);
      const names = workLocations.map(l => l.name);
      conditions.push({
        data: hcodes,
        dataType: 'code',
        metaType: 'loc',
        code: 'work_location',
        desc: `추정 직장주소: ${names.join(', ')}`,
        not: false,
      });
      descParts.push(`직장주소: ${names.join(', ')}`);
    }
  }

  // 7. 프로파일링 필터 (metaType: pro)
  // BizChat API 규격: 범위 값은 {gt: number, lt: number} 형식
  if (params.profiling && params.profiling.length > 0) {
    for (const pro of params.profiling) {
      // 값 처리: 문자열 gt/lt를 숫자로 변환
      let processedValue: unknown = pro.value;
      let dataType: 'number' | 'boolean' | 'code' = 'number';

      if (typeof pro.value === 'object' && pro.value !== null && 'gt' in pro.value) {
        // 범위 값 - 숫자로 변환
        processedValue = {
          gt: typeof pro.value.gt === 'string' ? parseFloat(pro.value.gt) : pro.value.gt,
          lt: typeof pro.value.lt === 'string' ? parseFloat(pro.value.lt) : pro.value.lt,
        };
        dataType = 'number';
      } else if (typeof pro.value === 'boolean') {
        dataType = 'boolean';
      } else if (typeof pro.value === 'string') {
        // 문자열 값 (예: 'Y', 'N') - code 타입으로 처리
        dataType = 'code';
        processedValue = [pro.value]; // BizChat API는 배열 형식을 기대
      } else if (typeof pro.value === 'number') {
        dataType = 'number';
      }

      conditions.push({
        data: processedValue,
        dataType: dataType,
        metaType: 'pro',
        code: pro.code,
        desc: pro.desc,
        not: false,
      });
      descParts.push(pro.desc);
    }
  }

  return {
    payload: { '$and': conditions },
    desc: descParts.join(', '),
  };
}

// ATS mosu API 응답 결과
interface ATSMosuResult {
  estimatedCount: number;
  sndMosuQuery?: string;  // BizChat API에서 반환하는 SQL 형식 query
}

// BizChat ATS mosu API 호출
async function callATSMosuAPI(mosuQuery: { '$and': ATSFilterCondition[] }): Promise<ATSMosuResult> {
  const tid = generateTid();
  const apiKey = getBizChatApiKey();

  if (!apiKey) {
    console.log('[Estimate] BizChat API key not configured, returning mock data');
    return { estimatedCount: 500000 };
  }

  const url = `${getBizChatUrl()}/api/v1/ats/mosu?tid=${tid}`;
  console.log('[Estimate] Calling ATS mosu API:', { url, payload: JSON.stringify(mosuQuery) });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify(mosuQuery),
    });

    if (!response.ok) {
      throw new Error(`ATS mosu API HTTP error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Estimate] ATS mosu response:', JSON.stringify(data).substring(0, 1000));

    if (data.code === 'S000001') {
      // BizChat ATS mosu API 응답에서 sndMosu와 query 추출
      const estimatedCount = data.data?.sndMosu || data.data?.cnt || 0;
      const sndMosuQuery = data.data?.query || undefined;  // SQL 형식 query

      console.log('[Estimate] Extracted sndMosu:', estimatedCount, 'sndMosuQuery:', sndMosuQuery?.substring(0, 200));

      return { estimatedCount, sndMosuQuery };
    } else {
      console.error('[Estimate] ATS mosu API error:', data.code, data.msg);
      // 에러 발생 시 추정값 반환
      return { estimatedCount: 500000 };
    }
  } catch (error) {
    console.error('[Estimate] ATS mosu API call failed:', error);
    return { estimatedCount: 500000 };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const params: TargetingParams & { targetingMode?: string; geofences?: unknown[] } = req.body;
    console.log('[Estimate] Request params:', JSON.stringify(params));

    // Maptics 모드에서는 ATS mosu API 호출하지 않음 (지오펜스 기반 추정)
    if (params.targetingMode === 'maptics') {
      console.log('[Estimate] Maptics mode - returning geofence-based estimate');
      const geofenceCount = params.geofences?.length ?? 0;
      const estimatedCount = geofenceCount > 0 ? geofenceCount * 50000 : 0;

      return res.status(200).json({
        estimatedCount,
        minCount: Math.floor(estimatedCount * 0.8),
        maxCount: Math.ceil(estimatedCount * 1.2),
        reachRate: 85,
        sndMosuQuery: null,
        sndMosuDesc: `지오펜스 ${geofenceCount}개 타겟`,
        mosuQuery: null,
        mosuDesc: `지오펜스 ${geofenceCount}개 타겟`,
      });
    }

    // ATS mosu 페이로드 생성
    const { payload, desc } = buildATSMosuPayload(params);
    console.log('[Estimate] Built payload:', JSON.stringify(payload));

    // ATS mosu API 호출 - sndMosu와 SQL query 모두 추출
    const result = await callATSMosuAPI(payload);

    return res.status(200).json({
      estimatedCount: result.estimatedCount,
      // BizChat API 규격: sndMosuQuery는 SQL 형식이어야 함
      sndMosuQuery: result.sndMosuQuery || JSON.stringify(payload),  // SQL query 또는 fallback으로 JSON
      sndMosuDesc: desc,
      // 기존 호환성 유지
      mosuQuery: payload,
      mosuDesc: desc,
      // 추가 정보
      minCount: Math.floor(result.estimatedCount * 0.8),
      maxCount: Math.ceil(result.estimatedCount * 1.2),
      reachRate: 85,
    });
  } catch (error: any) {
    console.error('[Estimate] Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to estimate audience' });
  }
}
