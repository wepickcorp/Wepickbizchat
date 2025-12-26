import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

// BizChat API Configuration
const BIZCHAT_DEV_URL = process.env.BIZCHAT_DEV_API_URL || 'https://gw-dev.bizchat1.co.kr:8443';
const BIZCHAT_PROD_URL = process.env.BIZCHAT_PROD_API_URL || 'https://gw.bizchat1.co.kr';

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
    const expectedSignature = createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
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

// Transaction ID 생성 (밀리초 타임스탬프)
function generateTid(): string {
  return Date.now().toString();
}

// BizChat API 호출 (v0.29.0 규격)
async function callBizChatAPI(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
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
  
  console.log(`[BizChat AI] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat AI] Request body:`, JSON.stringify(body).substring(0, 500));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat AI] Response: ${response.status} - ${responseText.substring(0, 500)}`);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { code: response.status.toString(), msg: responseText };
  }

  return { status: response.status, data };
}

// AI 캠페인 문구 생성 (POST /api/v1/ai/gen/msg)
// guideline은 최소 10자 이상
async function generateCampaignMessage(guideline: string, useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/ai/gen/msg', 'POST', { guideline }, useProduction);
}

// AI 캠페인 문구 검증 (POST /api/v1/ai/chk/msg)
// 문구 오류 검출 및 수정 제안
async function checkCampaignMessage(title: string, body: string, useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/ai/chk/msg', 'POST', { title, body }, useProduction);
}

// 고언연 캠페인 검수 요청 (POST /api/v1/ai/goun/inspect)
// 캠페인 상태가 "임시 등록"일 때만 가능
// 캠페인 시작 시간은 검수 요청 시간보다 최소 2.5일 이상이어야 함
async function requestGounInspection(campaignId: string, useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/ai/goun/inspect', 'POST', { cmpnId: campaignId }, useProduction);
}

// 고언연 캠페인 검수 결과 확인 (POST /api/v1/ai/goun/inspect/result)
async function getGounInspectionResult(campaignId: string, useProduction: boolean = false) {
  return callBizChatAPI('/api/v1/ai/goun/inspect/result', 'POST', { cmpnId: campaignId }, useProduction);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
  const detectEnv = (): boolean => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
    if (forceDevMode) {
      console.log('[BizChat AI] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    if (process.env.VERCEL_ENV === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat AI] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);

  try {
    const { action } = req.body;

    switch (action) {
      case 'generate': {
        // AI 문구 생성
        const { guideline } = req.body;
        
        if (!guideline || guideline.length < 10) {
          return res.status(400).json({ 
            error: '가이드라인은 최소 10자 이상이어야 합니다',
            example: '광고주(또는 브랜드명): 위픽\n이벤트 내용: 신규 가입 이벤트\n이벤트 기간: 2024년 12월 1일~12월 31일\nURL: https://example.com',
          });
        }

        const result = await generateCampaignMessage(guideline, useProduction);
        
        if (result.data.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            action: 'generate',
            error: 'AI 문구 생성에 실패했습니다',
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data,
          });
        }

        return res.status(200).json({
          success: true,
          action: 'generate',
          result: result.data,
        });
      }

      case 'check': {
        // AI 문구 검증
        const { title, body } = req.body;
        
        if (!title || !body) {
          return res.status(400).json({ 
            error: '제목(title)과 본문(body)이 필요합니다',
          });
        }

        const result = await checkCampaignMessage(title, body, useProduction);
        
        if (result.data.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            action: 'check',
            error: 'AI 문구 검증에 실패했습니다',
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data,
          });
        }

        return res.status(200).json({
          success: true,
          action: 'check',
          result: result.data,
        });
      }

      case 'gounInspect': {
        // 고언연 검수 요청
        const { campaignId } = req.body;
        
        if (!campaignId) {
          return res.status(400).json({ error: 'campaignId is required' });
        }

        const result = await requestGounInspection(campaignId, useProduction);
        
        if (result.data.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            action: 'gounInspect',
            error: '고언연 검수 요청에 실패했습니다',
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data,
          });
        }

        return res.status(200).json({
          success: true,
          action: 'gounInspect',
          result: result.data,
          note: '캠페인 시작 시간은 검수 요청 시간보다 최소 2.5일 이상이어야 합니다',
        });
      }

      case 'gounResult': {
        // 고언연 검수 결과 확인
        const { campaignId } = req.body;
        
        if (!campaignId) {
          return res.status(400).json({ error: 'campaignId is required' });
        }

        const result = await getGounInspectionResult(campaignId, useProduction);
        
        if (result.data.code !== 'S000001') {
          return res.status(400).json({
            success: false,
            action: 'gounResult',
            error: '고언연 검수 결과 조회에 실패했습니다',
            bizchatCode: result.data.code,
            bizchatMessage: result.data.msg,
            bizchatError: result.data,
          });
        }

        return res.status(200).json({
          success: true,
          action: 'gounResult',
          result: result.data,
        });
      }

      default:
        return res.status(400).json({ 
          error: 'Invalid action',
          validActions: ['generate', 'check', 'gounInspect', 'gounResult'],
          description: {
            generate: 'AI 캠페인 문구 생성 (guideline 필요)',
            check: 'AI 캠페인 문구 검증 (title, body 필요)',
            gounInspect: '고언연 캠페인 검수 요청 (campaignId 필요)',
            gounResult: '고언연 캠페인 검수 결과 확인 (campaignId 필요)',
          },
        });
    }

  } catch (error) {
    console.error('[BizChat AI] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
