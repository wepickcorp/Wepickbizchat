import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, ilike, or, desc } from 'drizzle-orm';
import { adminLogs, admins } from '../../shared/schema';
import { verifyAdminToken } from './lib/auth';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    const { search, page = '1', limit = '30' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    let whereClause;
    if (search) {
      whereClause = or(
        ilike(admins.name, `%${search}%`),
        ilike(adminLogs.action, `%${search}%`)
      );
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(adminLogs)
      .leftJoin(admins, sql`${adminLogs.adminId} = ${admins.id}`)
      .where(whereClause);

    const logsList = await db.select({
      id: adminLogs.id,
      action: adminLogs.action,
      targetType: adminLogs.targetType,
      targetId: adminLogs.targetId,
      details: adminLogs.details,
      ipAddress: adminLogs.ipAddress,
      createdAt: adminLogs.createdAt,
      adminId: adminLogs.adminId,
      adminName: admins.name,
      adminEmail: admins.email,
    })
    .from(adminLogs)
    .leftJoin(admins, sql`${adminLogs.adminId} = ${admins.id}`)
    .where(whereClause)
    .orderBy(desc(adminLogs.createdAt))
    .limit(limitNum)
    .offset(offset);

    return res.status(200).json({
      logs: logsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('[Admin Logs] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
}
