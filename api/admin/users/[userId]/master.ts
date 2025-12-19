import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

// Inline schema definitions
const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).default("cs").notNull(),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  isMaster: boolean("is_master").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

function verifyToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch { return null; }
}

async function verifyAdminToken(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);
  if (!verified) return null;
  try {
    const db = getDb();
    const admin = await db.select().from(admins).where(eq(admins.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch { return null; }
}

function getClientIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
         req.headers['x-real-ip'] as string || 
         'unknown';
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
