import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { users, adminLogs } from '../../lib/schema';
import { verifyAdminToken, getClientIp } from '../../lib/auth';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (admin.role !== 'super') {
    return res.status(403).json({ error: '슈퍼 어드민만 마스터 권한을 변경할 수 있습니다' });
  }

  const { userId } = req.query;
  const { isMaster } = req.body;

  if (!userId || typeof isMaster !== 'boolean') {
    return res.status(400).json({ error: '필수 값이 누락되었습니다' });
  }

  try {
    const db = getDb();

    const [user] = await db.select().from(users).where(eq(users.id, userId as string)).limit(1);
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다' });
    }

    await db.update(users)
      .set({ isMaster, updatedAt: new Date() })
      .where(eq(users.id, userId as string));

    await db.insert(adminLogs).values({
      adminId: admin.id,
      action: 'master_toggle',
      targetType: 'user',
      targetId: userId as string,
      details: { 
        previousValue: user.isMaster, 
        newValue: isMaster,
        userEmail: user.email,
      },
      ipAddress: getClientIp(req),
    });

    return res.status(200).json({ success: true, isMaster });
  } catch (error) {
    console.error('[Admin Master Toggle] Error:', error);
    return res.status(500).json({ error: '마스터 상태 변경 중 오류가 발생했습니다' });
  }
}
