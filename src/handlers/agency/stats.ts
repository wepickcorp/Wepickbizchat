import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean, decimal, integer, text } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  companyName: varchar("company_name"),
  isAgency: boolean("is_agency").default(false),
  agencyId: varchar("agency_id"),
  balance: decimal("balance", { precision: 12, scale: 0 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).default("temp_registered").notNull(),
  statusCode: integer("status_code").default(0).notNull(),
  budget: decimal("budget", { precision: 12, scale: 0 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 0 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

function verifyAgencyToken(token: string): { agencyId: string; userId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return { agencyId: payload.agencyId, userId: payload.userId };
  } catch { return null; }
}

async function verifyAgency(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const verified = verifyAgencyToken(token);
  if (!verified) return null;
  
  try {
    const db = getDb();
    const [agency] = await db.select().from(agencies).where(eq(agencies.id, verified.agencyId));
    if (!agency || !agency.isActive) return null;
    return { agency, userId: verified.userId };
  } catch { return null; }
}

function calculateCommissionRate(totalSpend: number): number {
  if (totalSpend >= 100000000) return 20;
  if (totalSpend >= 50000000) return 15;
  return 10;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const verified = await verifyAgency(req);
  if (!verified) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { agency } = verified;
  const db = getDb();

  try {
    const subAccounts = await db.select().from(users).where(eq(users.agencyId, agency.id));
    const subAccountIds = subAccounts.map(u => u.id);

    if (subAccountIds.length === 0) {
      return res.status(200).json({
        subAccountCount: 0,
        totalSpendThisMonth: 0,
        totalCampaigns: 0,
        activeCampaigns: 0,
        commissionRate: 10,
        estimatedCommission: 0,
      });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const usageTransactions = await db
      .select()
      .from(transactions)
      .where(
        and(
          inArray(transactions.userId, subAccountIds),
          eq(transactions.type, 'usage'),
          gte(transactions.createdAt, startOfMonth),
          lte(transactions.createdAt, endOfMonth)
        )
      );

    const totalSpendThisMonth = usageTransactions.reduce((sum, t) => {
      return sum + Math.abs(Number(t.amount || 0));
    }, 0);

    const allCampaigns = await db
      .select()
      .from(campaigns)
      .where(inArray(campaigns.userId, subAccountIds));

    const activeCampaigns = allCampaigns.filter(c => 
      c.statusCode === 30 || c.status === 'running'
    );

    const commissionRate = calculateCommissionRate(totalSpendThisMonth);
    const estimatedCommission = Math.floor(totalSpendThisMonth * (commissionRate / 100));

    return res.status(200).json({
      subAccountCount: subAccounts.length,
      totalSpendThisMonth,
      totalCampaigns: allCampaigns.length,
      activeCampaigns: activeCampaigns.length,
      commissionRate,
      estimatedCommission,
    });
  } catch (error) {
    console.error('[Agency Stats] Error:', error);
    return res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다' });
  }
}
