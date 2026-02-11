import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth, searchPOI } from '../bizchat/maptics.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { skey, type } = req.body;

    if (!skey || typeof skey !== 'string') {
      return res.status(400).json({ error: '검색어(skey)가 필요합니다' });
    }

    if (!type || (type !== 'poi' && type !== 'addr')) {
      return res.status(400).json({ error: "검색 타입은 'poi' 또는 'addr'이어야 합니다" });
    }

    console.log(`[POI Search] skey=${skey}, type=${type}`);
    const results = await searchPOI(skey, type);
    console.log(`[POI Search] Found ${results.length} results`);

    return res.status(200).json({ list: results });
  } catch (error: any) {
    console.error('[POI Search] Error:', error);
    return res.status(500).json({ error: error.message || 'POI 검색 실패' });
  }
}
