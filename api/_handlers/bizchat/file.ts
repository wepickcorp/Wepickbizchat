import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import FormData from 'form-data';
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
  // 대리 로그인 토큰 확인
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // 환경 감지: 개발 완료 전까지 항상 개발 API 사용
  const detectEnv = (): boolean => {
    const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
    if (forceDevMode) {
      console.log('[BizChat File] Force DEV mode: BIZCHAT_USE_PROD is not set to "true"');
      return false;
    }
    if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
    if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
    if (process.env.VERCEL_ENV === 'production') return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  };
  const useProduction = detectEnv();
  console.log(`[BizChat File] Environment: ${useProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
  const apiKey = useProduction 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'BizChat API key not configured' });
  }

  try {
    const { fileData, fileName, fileType, type, rcs } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'fileData is required (base64 encoded)' });
    }

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const tid = generateTid();
    // type: 1=기타, 2=이미지, 3=동영상, 4=csv, 5=오디오, 6=텍스트
    // rcs: 1=RCS용, 그외=아님
    const fileTypeParam = type || 2; // 기본값: 이미지
    const rcsParam = rcs || 0; // 기본값: 아님
    const url = `${baseUrl}/api/v1/file?tid=${tid}&type=${fileTypeParam}&rcs=${rcsParam}`;
    
    // 파일명을 영문 + 타임스탬프로 변환 (BizChat API는 한글/특수문자 파일명 미지원)
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const safeFileName = `bizchat_upload_${Date.now()}.${fileExt}`;
    
    console.log(`[BizChat File] Uploading file: ${fileName} -> ${safeFileName}`);

    // form-data 패키지 사용 (Vercel 서버리스 환경에서 올바른 multipart boundary 생성)
    const formData = new FormData();
    
    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');
    
    // Buffer를 직접 append (form-data 패키지 방식)
    formData.append('file', binaryData, {
      filename: safeFileName,
      contentType: fileType || 'image/jpeg',
    });

    // form-data 패키지는 getBuffer()로 전체 body를 생성
    const formBuffer = formData.getBuffer();
    const formHeaders = formData.getHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        ...formHeaders, // multipart boundary 포함
      },
      body: new Uint8Array(formBuffer), // Buffer를 Uint8Array로 변환 (fetch body 호환)
    });

    const responseText = await response.text();
    console.log(`[BizChat File] Response: ${response.status} - ${responseText.substring(0, 300)}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { code: response.status.toString(), msg: responseText };
    }

    if (data.code === 'S000001') {
      return res.status(200).json({
        success: true,
        fileId: data.data?.origId || data.data?.id,
        fileName,
        rawResponse: data,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: data.msg || 'File upload failed',
        rawResponse: data,
      });
    }

  } catch (error) {
    console.error('[BizChat File] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
