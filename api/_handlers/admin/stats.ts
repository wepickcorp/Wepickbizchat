import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq, gte, and } from 'drizzle-orm';
import { pgTable, varchar, timestamp, decimal, boolean, integer, text } from 'drizzle-orm/pg-core';
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
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  sentCount: integer("sent_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const totalUsers = Number(totalUsersResult?.count || 0);

    const [newUsersTodayResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, today));
    const newUsersToday = Number(newUsersTodayResult?.count || 0);

    const [activeCampaignsResult] = await db.select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(eq(campaigns.status, 'running'));
    const activeCampaigns = Number(activeCampaignsResult?.count || 0);

    const [revenueTodayResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(and(eq(transactions.type, 'charge'), gte(transactions.createdAt, today)));
    const revenueToday = Number(revenueTodayResult?.sum || 0);

    const [totalRevenueResult] = await db.select({ sum: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL)), 0)` })
      .from(transactions)
      .where(eq(transactions.type, 'charge'));
    const totalRevenue = Number(totalRevenueResult?.sum || 0);

    const [totalSentResult] = await db.select({ sum: sql<number>`COALESCE(SUM(sent_count), 0)` })
      .from(campaigns);
    const totalSent = Number(totalSentResult?.sum || 0);

    return res.status(200).json({
      totalUsers,
      newUsersToday,
      activeCampaigns,
      revenueToday,
      totalRevenue,
      totalSent,
    });
  } catch (error) {
    console.error('[Admin Stats] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
