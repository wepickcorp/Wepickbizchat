import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq, gte, lte, and, desc } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, decimal, integer } from 'drizzle-orm/pg-core';
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

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  messageType: varchar("message_type", { length: 10 }).notNull(),
  targetCount: integer("target_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0),
  successCount: integer("success_count").default(0),
  clickCount: integer("click_count").default(0),
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
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
    const { period = '30' } = req.query;
    const days = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [totalUsersResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [activeUsersResult] = await db.select({ count: sql<number>`count(DISTINCT user_id)` })
      .from(campaigns)
      .where(gte(campaigns.createdAt, startDate));

    const [campaignStatsResult] = await db.select({
      total: sql<number>`count(*)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN status IN ('approval_requested', 'approved') THEN 1 ELSE 0 END)`,
      totalSent: sql<number>`COALESCE(SUM(sent_count), 0)`,
      totalSuccess: sql<number>`COALESCE(SUM(success_count), 0)`,
      totalClicks: sql<number>`COALESCE(SUM(click_count), 0)`,
      totalBudget: sql<number>`COALESCE(SUM(CAST(budget AS DECIMAL)), 0)`,
    })
    .from(campaigns)
    .where(gte(campaigns.createdAt, startDate));

    const userGrowth = await db.select({
      date: sql<string>`DATE(created_at)`,
      count: sql<number>`count(*)`,
    })
    .from(users)
    .where(gte(users.createdAt, startDate))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);

    const campaignsByStatus = await db.select({
      status: campaigns.status,
      count: sql<number>`count(*)`,
    })
    .from(campaigns)
    .where(gte(campaigns.createdAt, startDate))
    .groupBy(campaigns.status);

    const campaignsByMessageType = await db.select({
      messageType: campaigns.messageType,
      count: sql<number>`count(*)`,
      totalSent: sql<number>`COALESCE(SUM(sent_count), 0)`,
    })
    .from(campaigns)
    .where(gte(campaigns.createdAt, startDate))
    .groupBy(campaigns.messageType);

    const dailyCampaigns = await db.select({
      date: sql<string>`DATE(created_at)`,
      count: sql<number>`count(*)`,
      totalBudget: sql<number>`COALESCE(SUM(CAST(budget AS DECIMAL)), 0)`,
    })
    .from(campaigns)
    .where(gte(campaigns.createdAt, startDate))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);

    const topAdvertisers = await db.select({
      userId: campaigns.userId,
      userEmail: users.email,
      campaignCount: sql<number>`count(*)`,
      totalBudget: sql<number>`COALESCE(SUM(CAST(${campaigns.budget} AS DECIMAL)), 0)`,
      totalSent: sql<number>`COALESCE(SUM(${campaigns.sentCount}), 0)`,
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.userId, users.id))
    .where(gte(campaigns.createdAt, startDate))
    .groupBy(campaigns.userId, users.email)
    .orderBy(desc(sql`COALESCE(SUM(CAST(${campaigns.budget} AS DECIMAL)), 0)`))
    .limit(10);

    const totalSent = Number(campaignStatsResult?.totalSent || 0);
    const totalSuccess = Number(campaignStatsResult?.totalSuccess || 0);
    const totalClicks = Number(campaignStatsResult?.totalClicks || 0);

    return res.status(200).json({
      period: { days, startDate },
      overview: {
        totalUsers: Number(totalUsersResult?.count || 0),
        activeUsers: Number(activeUsersResult?.count || 0),
        totalCampaigns: Number(campaignStatsResult?.total || 0),
        completedCampaigns: Number(campaignStatsResult?.completed || 0),
        runningCampaigns: Number(campaignStatsResult?.running || 0),
        pendingCampaigns: Number(campaignStatsResult?.pending || 0),
        totalSent,
        totalSuccess,
        totalClicks,
        totalBudget: Number(campaignStatsResult?.totalBudget || 0),
        deliveryRate: totalSent > 0 ? ((totalSuccess / totalSent) * 100).toFixed(2) : '0',
        clickRate: totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(2) : '0',
      },
      trends: {
        userGrowth,
        dailyCampaigns,
      },
      breakdown: {
        byStatus: campaignsByStatus,
        byMessageType: campaignsByMessageType,
      },
      topAdvertisers,
    });
  } catch (error) {
    console.error('[Admin Analytics] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}
