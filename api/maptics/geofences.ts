import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { verifyAuth, createGeofence, updateGeofence, deleteGeofence, GeofenceTarget, listGeofences } from '../bizchat/maptics.js';
import { db } from '../../server/db.js';
import { geofences } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const geofenceTargetSchema = z.object({
  gender: z.number().min(0).max(2),
  minAge: z.number().min(19).max(90),
  maxAge: z.number().min(19).max(90),
  stayMin: z.number().min(5).max(30),
  radius: z.number().min(50).max(2000),
  address: z.string().min(1),
  lat: z.string().optional(), // POI 검색 결과의 위도
  lon: z.string().optional(), // POI 검색 결과의 경도
});

const createGeofenceSchema = z.object({
  name: z.string().min(1),
  target: z.array(geofenceTargetSchema).min(1),
});

const updateGeofenceSchema = z.object({
  targetId: z.number(),
  name: z.string().min(1),
  target: z.array(geofenceTargetSchema).min(1),
});

const deleteGeofenceSchema = z.object({
  targetId: z.number(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // GET: 지오펜스 목록 조회 (로컬 DB + BizChat 동기화)
    if (req.method === 'GET') {
      console.log(`[Geofence List] Fetching geofences for user: ${auth.userId}`);
      
      // BizChat에서 지오펜스 목록 가져오기
      const bizchatGeofences = await listGeofences();
      console.log(`[Geofence List] BizChat returned ${bizchatGeofences.length} geofences`);
      
      // 로컬 DB에서 사용자의 지오펜스 가져오기
      const localGeofences = await db.select()
        .from(geofences)
        .where(and(
          eq(geofences.userId, auth.userId),
          eq(geofences.isActive, true)
        ))
        .orderBy(desc(geofences.createdAt));
      
      console.log(`[Geofence List] Local DB has ${localGeofences.length} geofences`);
      
      // BizChat 지오펜스와 로컬 지오펜스를 매칭하여 반환
      // bizchatGeofenceId로 매핑
      const result = bizchatGeofences.map(bg => {
        const local = localGeofences.find(lg => lg.bizchatGeofenceId === String(bg.id));
        return {
          id: bg.id,
          name: bg.name,
          localId: local?.id || null,
          latitude: local?.latitude || null,
          longitude: local?.longitude || null,
          radius: local?.radius || bg.target?.[0]?.radius || 500,
          poiName: local?.poiName || bg.target?.[0]?.address || null,
          createdAt: bg.regDt || local?.createdAt,
          isLocal: !!local,
        };
      });
      
      return res.status(200).json({ geofences: result });
    }

    if (req.method === 'POST') {
      const parsed = createGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: '잘못된 요청 형식', details: parsed.error.errors });
      }

      const { name, target } = parsed.data;
      console.log(`[Geofence Create] name=${name}, targets=${target.length}`);
      
      const geofenceId = await createGeofence(name, target as GeofenceTarget[]);
      console.log(`[Geofence Create] Created geofence ID: ${geofenceId}`);

      return res.status(200).json({ id: geofenceId });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const parsed = updateGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: '잘못된 요청 형식', details: parsed.error.errors });
      }

      const { targetId, name, target } = parsed.data;
      console.log(`[Geofence Update] targetId=${targetId}, name=${name}`);
      
      await updateGeofence(targetId, name, target as GeofenceTarget[]);
      console.log(`[Geofence Update] Updated geofence ID: ${targetId}`);

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const parsed = deleteGeofenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: '잘못된 요청 형식', details: parsed.error.errors });
      }

      const { targetId } = parsed.data;
      console.log(`[Geofence Delete] targetId=${targetId}`);
      
      await deleteGeofence(targetId);
      console.log(`[Geofence Delete] Deleted geofence ID: ${targetId}`);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Geofence] Error:', error);
    return res.status(500).json({ error: error.message || '지오펜스 처리 실패' });
  }
}
