import type { VercelRequest, VercelResponse } from '@vercel/node';

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

interface BizChatResponse {
  tid?: string;
  code: string;
  msg?: string;
  message?: string;
  data?: unknown;
}

// Transaction ID 생성 (밀리초 타임스탬프)
function generateTid(): string {
  return Date.now().toString();
}

// BizChat API 클라이언트 (v0.29.0 규격)
async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  useProduction: boolean = false
): Promise<BizChatResponse> {
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    throw new Error(`BizChat API key not configured for ${useProduction ? 'production' : 'development'}`);
  }

  const tid = generateTid();
  
  // URL에 tid 쿼리 파라미터 추가
  const url = `${baseUrl}${endpoint}?tid=${tid}`;
  console.log(`[BizChat] Calling ${method} ${url}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': apiKey,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat] Request body:`, JSON.stringify(body).substring(0, 300));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat] Response status: ${response.status}`);
  console.log(`[BizChat] Response body: ${responseText.substring(0, 500)}`);

  let data: BizChatResponse;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = {
      code: response.status.toString(),
      message: responseText || response.statusText,
    };
  }

  return data;
}

// 발신번호 목록 조회 API (POST /api/v1/sndnum/list)
async function getSenderNumbers(useProduction: boolean = false): Promise<BizChatResponse> {
  return callBizChatAPI('/api/v1/sndnum/list', 'POST', {}, useProduction);
}

// 캠페인 목록 조회 API (POST /api/v1/cmpn/list)
async function getCampaignList(useProduction: boolean = false): Promise<BizChatResponse> {
  return callBizChatAPI('/api/v1/cmpn/list', 'POST', {
    pageNumber: 1,
    pageSize: 10,
  }, useProduction);
}

// ATS 메타 정보 조회 (POST /api/v1/ats/meta/filter)
async function getAtsMetaFilter(useProduction: boolean = false): Promise<BizChatResponse> {
  return callBizChatAPI('/api/v1/ats/meta/filter', 'POST', {}, useProduction);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
    const detectEnv = (): boolean => {
      const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
      if (forceDevMode) {
        console.log('[BizChat Test] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
        return false;
      }
      if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
      if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
      if (process.env.VERCEL_ENV === 'production') return true;
      if (process.env.NODE_ENV === 'production') return true;
      return false;
    };
    const useProduction = detectEnv();
    const testType = (req.query.type || req.body?.type || 'sndnum') as string;

    console.log(`[BizChat Test] Environment: ${useProduction ? 'Production' : 'Development'}`);
    console.log(`[BizChat Test] Test type: ${testType}`);

    let result: BizChatResponse;
    let apiPath: string;

    switch (testType) {
      case 'sndnum':
        apiPath = '/api/v1/sndnum/list';
        result = await getSenderNumbers(useProduction);
        break;
      case 'campaign':
        apiPath = '/api/v1/cmpn/list';
        result = await getCampaignList(useProduction);
        break;
      case 'ats':
        apiPath = '/api/v1/ats/meta/filter';
        result = await getAtsMetaFilter(useProduction);
        break;
      default:
        apiPath = '/api/v1/sndnum/list';
        result = await getSenderNumbers(useProduction);
    }

    // 성공 여부 판단 (S000001 = 성공)
    const isSuccess = result.code === 'S000001';

    return res.status(200).json({
      success: isSuccess,
      environment: useProduction ? 'production' : 'development',
      testType,
      apiPath,
      baseUrl: useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL,
      result,
    });
  } catch (error) {
    console.error('[BizChat Test] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: req.query.env === 'prod' ? 'production' : 'development',
    });
  }
}
