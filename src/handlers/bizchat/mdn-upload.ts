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

function detectProductionEnvironment(req: VercelRequest): boolean {
  const forceDevMode = process.env.BIZCHAT_USE_PROD !== 'true';
  if (forceDevMode) return false;
  if (req.query.env === 'prod' || req.body?.env === 'prod') return true;
  if (req.query.env === 'dev' || req.body?.env === 'dev') return false;
  if (process.env.VERCEL_ENV === 'production') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
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

  try {
    const { mdnList, action } = req.body;

    if (action === 'create-file') {
      if (!mdnList || !Array.isArray(mdnList) || mdnList.length === 0) {
        return res.status(400).json({ error: 'mdnList is required (array of phone numbers)' });
      }

      if (mdnList.length > 200000) {
        return res.status(400).json({ error: 'Maximum 200,000 MDN allowed' });
      }

      const csvContent = mdnList.map(mdn => {
        const cleanMdn = mdn.replace(/[-\s]/g, '');
        return cleanMdn.startsWith('010') ? cleanMdn : `010${cleanMdn}`;
      }).join('\n');

      const csvBuffer = Buffer.from(csvContent, 'utf-8');

      const useProduction = detectProductionEnvironment(req);
      const baseUrl = useProduction ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
      const apiKey = useProduction ? process.env.BIZCHAT_PROD_API_KEY : process.env.BIZCHAT_DEV_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'BizChat API key not configured' });
      }

      const tid = generateTid();
      const url = `${baseUrl}/api/v1/file?tid=${tid}&type=4&rcs=0`;

      console.log(`[BizChat MDN Upload] POST ${url}`);
      console.log(`[BizChat MDN Upload] MDN count: ${mdnList.length}`);

      const boundary = `----FormBoundary${Date.now()}`;
      const fileName = `mdn_${tid}.csv`;

      const formDataParts = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
        'Content-Type: text/csv',
        '',
        csvContent,
        `--${boundary}--`,
        ''
      ];

      const formDataBody = formDataParts.join('\r\n');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formDataBody,
      });

      const responseText = await response.text();
      console.log(`[BizChat MDN Upload] Response: ${response.status} - ${responseText}`);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { code: response.status.toString(), msg: responseText };
      }

      if (data.code === 'S000001' && data.data?.id) {
        return res.status(200).json({
          success: true,
          mdnFileId: data.data.id,
          mdnCount: mdnList.length,
          message: 'MDN 파일이 성공적으로 업로드되었습니다',
        });
      } else {
        return res.status(400).json({
          success: false,
          error: data.msg || 'MDN 파일 업로드 실패',
          code: data.code,
        });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use "create-file"' });
  } catch (error) {
    console.error('[BizChat MDN Upload] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
