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
  
  console.log(`[BizChat Template] ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    console.log(`[BizChat Template] Request body:`, JSON.stringify(body).substring(0, 500));
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`[BizChat Template] Response: ${response.status} - ${responseText.substring(0, 300)}`);

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
      console.log('[BizChat Template] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    if (process.env.VERCEL_ENV === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat Template] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  const action = req.body?.action || 'list';

  try {
    switch (action) {
      case 'list': {
        const { pageNumber = 1, pageSize = 20 } = req.body;
        
        const result = await callBizChatAPI('/api/v1/cmpn/tpl/list', 'POST', {
          pageNumber,
          pageSize,
        }, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'list',
          templates: result.data.data?.list || [],
          total: result.data.data?.total || 0,
          rawResponse: result.data,
        });
      }

      case 'read': {
        const { templateId } = req.body;
        
        if (!templateId) {
          return res.status(400).json({ error: 'templateId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/cmpn/tpl?id=${templateId}`, 'GET', undefined, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'read',
          template: result.data.data,
          rawResponse: result.data,
        });
      }

      case 'create': {
        const { 
          name,
          msgType,
          senderNumber,
          title,
          content,
          imageId,
          buttons,
        } = req.body;

        if (!name || !msgType) {
          return res.status(400).json({ error: 'name and msgType are required' });
        }

        const validMsgTypes = ['SMS', 'LMS', 'MMS', 'RCS'];
        if (!validMsgTypes.includes(msgType)) {
          return res.status(400).json({ 
            error: 'Invalid msgType', 
            validTypes: validMsgTypes 
          });
        }

        const payload: Record<string, unknown> = {
          name,
          msgType,
          title: title || '',
          msg: content || '',
        };

        if (senderNumber) {
          payload.sndNum = senderNumber.replace(/[^0-9]/g, '');
        }

        if (msgType === 'MMS' && imageId) {
          payload.mms = [{
            origId: imageId,
          }];
        }

        if (msgType === 'RCS') {
          payload.rcs = [{
            slideNum: 1,
            title: title || '',
            msg: content || '',
            urlLink: { list: [] },
            buttons: buttons ? { list: buttons } : { list: [] },
          }];
        }

        const result = await callBizChatAPI('/api/v1/cmpn/tpl/create', 'POST', payload, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'create',
          templateId: result.data.data?.id,
          rawResponse: result.data,
        });
      }

      case 'update': {
        const { templateId, name, title, content, imageId, buttons } = req.body;

        if (!templateId) {
          return res.status(400).json({ error: 'templateId is required' });
        }

        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name;
        if (title !== undefined) payload.title = title;
        if (content !== undefined) payload.msg = content;
        if (imageId !== undefined) {
          payload.mms = [{ origId: imageId }];
        }
        if (buttons !== undefined) {
          payload.rcs = [{
            slideNum: 1,
            buttons: { list: buttons },
          }];
        }

        const result = await callBizChatAPI(`/api/v1/cmpn/tpl/update?id=${templateId}`, 'POST', payload, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'update',
          rawResponse: result.data,
        });
      }

      case 'delete': {
        const { templateId } = req.body;

        if (!templateId) {
          return res.status(400).json({ error: 'templateId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/cmpn/tpl/delete?id=${templateId}`, 'POST', {}, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'delete',
          rawResponse: result.data,
        });
      }

      case 'submit': {
        const { templateId } = req.body;

        if (!templateId) {
          return res.status(400).json({ error: 'templateId is required' });
        }

        const result = await callBizChatAPI(`/api/v1/cmpn/tpl/appr/req?id=${templateId}`, 'POST', {}, useProduction);
        
        return res.status(200).json({
          success: result.data.code === 'S000001',
          action: 'submit',
          rawResponse: result.data,
        });
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['list', 'read', 'create', 'update', 'delete', 'submit'],
        });
    }
  } catch (error) {
    console.error('[BizChat Template] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
