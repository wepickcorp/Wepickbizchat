import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, sql } from 'drizzle-orm';
import { pgTable, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import crypto from 'crypto';

const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  companyName: varchar("company_name"),
  isAgency: boolean("is_agency").default(false),
  agencyId: varchar("agency_id"),
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

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sqlClient = neon(databaseUrl);
  return drizzle(sqlClient);
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function createAgencyToken(agencyId: string, userId: string, email: string, agencyName: string): string {
  const payload = {
    agencyId,
    userId,
    email,
    agencyName,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24시간 유효
    iat: Date.now(),
  };
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, signature })).toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const db = getDb();

    const [user] = await db.select().from(users).where(eq(users.id, authData.user.id));
    if (!user) {
      return res.status(401).json({ error: '등록된 사용자가 아닙니다' });
    }

    if (!user.isAgency) {
      return res.status(403).json({ error: '대행사 계정이 아닙니다. 일반 로그인을 이용해주세요.' });
    }

    const [agency] = await db.select().from(agencies).where(eq(agencies.userId, user.id));
    if (!agency || !agency.isActive) {
      return res.status(403).json({ error: '비활성화된 대행사 계정입니다' });
    }

    const token = createAgencyToken(agency.id, user.id, user.email || '', agency.name);

    return res.status(200).json({
      success: true,
      token,
      agency: {
        id: agency.id,
        name: agency.name,
        contactName: agency.contactName,
        contactEmail: agency.contactEmail,
      },
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName,
      },
    });
  } catch (error) {
    console.error('[Agency Login] Error:', error);
    return res.status(500).json({ error: '로그인 중 오류가 발생했습니다' });
  }
}
