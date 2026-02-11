import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

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

const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 100 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  contactEmail: varchar("contact_email", { length: 200 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  companyName: varchar("company_name"),
  isAgency: boolean("is_agency").default(false),
  agencyId: varchar("agency_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId } = req.query;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: '사용자 ID가 필요합니다' });
  }

  const db = getDb();

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    }

    if (req.method === 'POST') {
      const { name, contactName, contactPhone, contactEmail } = req.body || {};
      
      if (!name) {
        return res.status(400).json({ error: '대행사명은 필수입니다' });
      }

      const [existingAgency] = await db.select().from(agencies).where(eq(agencies.userId, userId));
      if (existingAgency) {
        return res.status(400).json({ error: '이미 대행사로 등록된 계정입니다' });
      }

      const [newAgency] = await db.insert(agencies).values({
        userId,
        name,
        contactName,
        contactPhone,
        contactEmail,
      }).returning();

      await db.update(users)
        .set({ isAgency: true, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return res.status(201).json({
        success: true,
        agency: newAgency,
        message: '대행사로 등록되었습니다',
      });
    }

    if (req.method === 'DELETE') {
      const [existingAgency] = await db.select().from(agencies).where(eq(agencies.userId, userId));
      if (!existingAgency) {
        return res.status(400).json({ error: '대행사 계정이 아닙니다' });
      }

      const subAccounts = await db.select().from(users).where(eq(users.agencyId, existingAgency.id));
      for (const subAccount of subAccounts) {
        await db.update(users)
          .set({ agencyId: null, updatedAt: new Date() })
          .where(eq(users.id, subAccount.id));
      }

      await db.delete(agencies).where(eq(agencies.userId, userId));

      await db.update(users)
        .set({ isAgency: false, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return res.status(200).json({
        success: true,
        message: '대행사 등록이 해제되었습니다',
      });
    }
  } catch (error) {
    console.error('[Admin User Agency] Error:', error);
    return res.status(500).json({ error: '대행사 설정 중 오류가 발생했습니다' });
  }
}
