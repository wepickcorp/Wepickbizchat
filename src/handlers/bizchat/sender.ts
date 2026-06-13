import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

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

  console.log(`[BizChat Sender] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Sender] Request body:`, JSON.stringify(body).substring(0, 500));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  console.log(`[BizChat Sender] Response: ${response.status} - ${responseText.substring(0, 300)}`);

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

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
  // SK 담당자 요청: 개발 완료될 때까지 상용 URL이 아닌 개발 URL(gw-dev.bizchat1.co.kr:8443)로 요청
  const detectEnv = (): boolean => {
    // ⚠️ 개발 완료 전까지 항상 개발 API 사용
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
    if (forceDevMode) {
      console.log('[BizChat Sender] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }

    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    if (process.env.VERCEL_ENV === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat Sender] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  const action = req.body?.action || req.query.action || 'list';

  try {
    switch (action) {
      case 'list': {
        const result = await callBizChatAPI('/api/v1/sndnum/list', 'POST', {}, useProduction);

        // BizChat API 응답에서 발신번호 목록 추출 및 정규화
        // 발신번호코드(id)와 발신번호(num)를 명확히 구분
        // 예: { id: "001001", num: "16700823", name: "SK텔레콤 혜택 알림" }
        const rawList = result.data.data?.list || [];
        const senderNumbers = rawList.map((item: any) => ({
          id: item.id,           // 발신번호코드 (캠페인 생성 시 sndNum에 사용)
          code: item.id,         // 발신번호코드 (별칭)
          num: item.num,         // 실제 발신번호
          number: item.num,      // 실제 발신번호 (별칭)
          name: item.name || '', // 발신번호 이름
          displayName: item.name ? `${item.name} (${item.num})` : item.num,
          comment: item.comment || '',
          state: item.state,     // 상태
          regDate: item.regDate, // 등록일
        }));

        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'list',
          senderNumbers,
          // 캠페인 생성 시 사용법 안내
          usage: {
            note: '캠페인 생성 시 sndNum 필드에 발신번호코드(id/code)를 사용하세요',
            example: 'sndNum: "001001" (SK텔레콤 혜택 알림 - 16700823)',
          },
          rawResponse: result.data,
        });
      }

      case 'create': {
        const { number, name, comment, certFiles } = req.body;

        if (!number) {
          return res.status(400).json({ error: 'number is required' });
        }

        const payload: Record<string, unknown> = {
          num: number.replace(/[^0-9]/g, ''),
          name: name || '',
          comment: comment || '',
        };

        if (certFiles && Array.isArray(certFiles) && certFiles.length > 0) {
          payload.certFiles = certFiles;
        }

        const result = await callBizChatAPI('/api/v1/sndnum/create', 'POST', payload, useProduction);

        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'create',
          senderNumberId: result.data.data?.id,
          rawResponse: result.data,
        });
      }

      case 'read': {
        const { senderId } = req.body;

        if (!senderId) {
          return res.status(400).json({ error: 'senderId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/sndnum?id=${senderId}`, 'GET', undefined, useProduction);

        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'read',
          senderNumber: result.data.data,
          rawResponse: result.data,
        });
      }

      case 'update': {
        const { senderId, name, comment, certFiles } = req.body;

        if (!senderId) {
          return res.status(400).json({ error: 'senderId is required' });
        }

        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name;
        if (comment !== undefined) payload.comment = comment;
        if (certFiles) payload.certFiles = certFiles;

        const result = await callBizChatAPI(`/api/v1/sndnum/update?id=${senderId}`, 'POST', payload, useProduction);

        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'update',
          rawResponse: result.data,
        });
      }

      case 'delete': {
        const { senderId } = req.body;

        if (!senderId) {
          return res.status(400).json({ error: 'senderId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/sndnum/delete?id=${senderId}`, 'POST', {}, useProduction);

        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'delete',
          rawResponse: result.data,
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['list', 'create', 'read', 'update', 'delete'],
        });
    }
  } catch (error) {
    console.error('[BizChat Sender] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
