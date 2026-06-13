import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, ilike, eq, or, desc, and } from 'drizzle-orm';
import { pgTable, varchar, timestamp, decimal, boolean, integer } from 'drizzle-orm/pg-core';
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
});

const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  messageType: varchar("message_type", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  statusCode: integer("status_code").default(0).notNull(),
  targetCount: integer("target_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0),
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
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
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await verifyAdminToken(req);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    const { search, status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    if (search) {
      conditions.push(or(
        ilike(campaigns.name, `%${search}%`),
        ilike(users.email, `%${search}%`)
      ));
    }

    if (status && status !== 'all') {
      conditions.push(eq(campaigns.status, status as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.userId, users.id))
      .where(whereClause);

    const campaignsList = await db.select({
      id: campaigns.id,
      name: campaigns.name,
      messageType: campaigns.messageType,
      status: campaigns.status,
      statusCode: campaigns.statusCode,
      targetCount: campaigns.targetCount,
      sentCount: campaigns.sentCount,
      budget: campaigns.budget,
      createdAt: campaigns.createdAt,
      userId: campaigns.userId,
      userEmail: users.email,
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.userId, users.id))
    .where(whereClause)
    .orderBy(desc(campaigns.createdAt))
    .limit(limitNum)
    .offset(offset);

    return res.status(200).json({
      campaigns: campaignsList,
      total: Number(countResult?.count || 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('[Admin Campaigns] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
}
