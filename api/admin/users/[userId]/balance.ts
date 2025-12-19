import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, sql } from 'drizzle-orm';
import { pgTable, varchar, timestamp, decimal, boolean, text, jsonb } from 'drizzle-orm/pg-core';
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 0 }),
  description: text("description"),
  campaignId: varchar("campaign_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
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

  const { userId } = req.query;
  const { amount, reason } = req.body || {};

  const numAmount = Number(amount);
  if (!userId || isNaN(numAmount) || !reason) {
    return res.status(400).json({ error: '필수 값이 누락되었습니다 (userId, amount, reason 필요)' });
  }

  try {
    const db = getDb();

    const [user] = await db.select().from(users).where(eq(users.id, userId as string)).limit(1);
    if (!user) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다' });
    }

    const currentBalance = Number(user.balance || 0);
    const newBalance = currentBalance + numAmount;

    if (newBalance < 0) {
      return res.status(400).json({ error: '잔액이 마이너스가 될 수 없습니다' });
    }

    await db.update(users)
      .set({ balance: String(newBalance), updatedAt: new Date() })
      .where(eq(users.id, userId as string));

    await db.insert(transactions).values({
      userId: userId as string,
      type: 'admin_adjustment',
      amount: String(numAmount),
      balanceAfter: String(newBalance),
      description: `[관리자 조정] ${reason}`,
      paymentMethod: 'admin',
    });

    await db.insert(adminLogs).values({
      adminId: admin.id,
      action: 'balance_adjust',
      targetType: 'user',
      targetId: userId as string,
      details: { 
        previousBalance: currentBalance, 
        newBalance, 
        amount: numAmount, 
        reason,
        userEmail: user.email,
      },
      ipAddress: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      previousBalance: currentBalance,
      newBalance,
    });
  } catch (error) {
    console.error('[Admin Balance Adjust] Error:', error);
    return res.status(500).json({ error: '잔액 조정 중 오류가 발생했습니다' });
  }
}
