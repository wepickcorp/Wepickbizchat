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

export async function verifyAuth(req: VercelRequest) {
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

export function generateTid(): string {
  return Date.now().toString();
}

export function getBizChatApiUrl(): string {
  return process.env.BIZCHAT_USE_PROD === 'true' ? BIZCHAT_PROD_URL : BIZCHAT_DEV_URL;
}

export function getBizChatApiKey(): string {
  const key = process.env.BIZCHAT_USE_PROD === 'true' 
    ? process.env.BIZCHAT_PROD_API_KEY 
    : process.env.BIZCHAT_DEV_API_KEY;
  if (!key) throw new Error('BizChat API key not configured');
  return key;
}

export interface POISearchResult {
  road: string;
  lat: string;
  lon: string;
}

export interface GeofenceTarget {
  gender: number;
  minAge: number;
  maxAge: number;
  stayMin: number;
  radius: number;
  address: string;
  lat?: string; // POI 위도
  lon?: string; // POI 경도
}

export interface GeofenceCreateRequest {
  name: string;
  target: GeofenceTarget[];
}

export async function searchPOI(skey: string, type: 'poi' | 'addr'): Promise<POISearchResult[]> {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey();
  const tid = generateTid();

  const response = await fetch(`${baseUrl}/api/v1/maptics/poi?tid=${tid}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ skey, type }),
  });

  if (!response.ok) {
    throw new Error(`BizChat POI API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 'S000001') {
    throw new Error(`BizChat POI API failed: ${result.msg}`);
  }

  return result.data?.list || [];
}

export async function createGeofence(name: string, target: GeofenceTarget[]): Promise<number> {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey();
  const tid = generateTid();

  const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/save?tid=${tid}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ name, target }),
  });

  if (!response.ok) {
    throw new Error(`BizChat Geofence create API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 'S000001') {
    throw new Error(`BizChat Geofence create failed: ${result.msg}`);
  }

  return result.data?.id;
}

export async function updateGeofence(targetId: number, name: string, target: GeofenceTarget[]): Promise<void> {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey();
  const tid = generateTid();

  const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/update?tid=${tid}&targetId=${targetId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ name, target }),
  });

  if (!response.ok) {
    throw new Error(`BizChat Geofence update API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 'S000001') {
    throw new Error(`BizChat Geofence update failed: ${result.msg}`);
  }
}

export async function deleteGeofence(targetId: number): Promise<void> {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey();
  const tid = generateTid();

  const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/delete?tid=${tid}&targetId=${targetId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`BizChat Geofence delete API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 'S000001') {
    throw new Error(`BizChat Geofence delete failed: ${result.msg}`);
  }
}

export interface GeofenceListItem {
  id: number;
  name: string;
  regDt?: string;
  target?: GeofenceTarget[];
}

export async function listGeofences(): Promise<GeofenceListItem[]> {
  const baseUrl = getBizChatApiUrl();
  const apiKey = getBizChatApiKey();
  const tid = generateTid();

  try {
    const response = await fetch(`${baseUrl}/api/v1/maptics/geofences/list?tid=${tid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      console.error(`BizChat Geofence list API error: ${response.status}`);
      return [];
    }

    const result = await response.json();
    if (result.code !== 'S000001') {
      console.error(`BizChat Geofence list failed: ${result.msg}`);
      return [];
    }

    return result.data?.list || [];
  } catch (error) {
    console.error('BizChat Geofence list error:', error);
    return [];
  }
}
