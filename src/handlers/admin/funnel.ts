import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql, eq } from 'drizzle-orm';
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

const FUNNEL_STEPS = [
  { key: "landing", label: "랜딩에서 시작", events: ["landing_cta_clicked"] },
  { key: "auth", label: "가입/로그인 완료", events: ["signup_completed", "login_completed"] },
  { key: "credit", label: "충전 관심", events: ["credit_product_selected", "payment_started", "payment_auth_opened"] },
  { key: "campaign", label: "문자 만들기 시작", events: ["campaign_create_started"] },
  { key: "message", label: "메시지 선택", events: ["message_template_selected"] },
  { key: "target", label: "받을 고객 설정", events: ["targeting_completed"] },
  { key: "review", label: "최종 확인 도착", events: ["campaign_review_reached"] },
  { key: "confirm", label: "발송 확인", events: ["send_confirm_opened", "send_submitted"] },
  { key: "send", label: "발송 시작", events: ["send_started"] },
];

const FAILURE_EVENTS = [
  "signup_failed",
  "login_failed",
  "payment_failed",
  "campaign_update_failed",
  "send_failed",
];

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
  } catch {
    return null;
  }
}

async function verifyAdminToken(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const verified = verifyToken(authHeader.replace('Bearer ', ''));
  if (!verified) return null;

  try {
    const db = getDb();
    const admin = await db.select().from(admins).where(eq(admins.id, verified.adminId)).limit(1);
    if (admin.length === 0 || !admin[0].isActive) return null;
    return admin[0];
  } catch {
    return null;
  }
}

function getDays(value: unknown) {
  const parsed = Number.parseInt(String(value || "7"), 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(90, Math.max(1, parsed));
}

function isMissingEventTable(error: unknown) {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error || "");
  return code === "42P01" || message.includes("event_logs");
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function buildFunnel(eventRows: any[]) {
  const byEvent = new Map(
    eventRows.map((row) => [
      String(row.event_name),
      {
        events: toNumber(row.event_count),
        users: toNumber(row.user_count),
      },
    ]),
  );

  let previousUsers = 0;
  return FUNNEL_STEPS.map((step, index) => {
    const totals = step.events.reduce(
      (acc, eventName) => {
        const row = byEvent.get(eventName);
        acc.events += row?.events || 0;
        acc.users += row?.users || 0;
        return acc;
      },
      { events: 0, users: 0 },
    );

    const conversionFromPrevious =
      index === 0 || previousUsers === 0 ? 100 : Math.round((totals.users / previousUsers) * 1000) / 10;
    const dropoff = index === 0 ? 0 : Math.max(0, previousUsers - totals.users);
    previousUsers = totals.users;

    return {
      key: step.key,
      label: step.label,
      events: totals.events,
      users: totals.users,
      conversionFromPrevious,
      dropoff,
    };
  });
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
    const days = getDays(req.query.period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [eventResult, trendResult, recentResult, failureResult] = await Promise.all([
      db.execute(sql`
        SELECT
          event_name,
          COUNT(*)::int AS event_count,
          COUNT(DISTINCT COALESCE(user_id, anonymous_id))::int AS user_count
        FROM event_logs
        WHERE created_at >= ${startDate}
        GROUP BY event_name
      `),
      db.execute(sql`
        SELECT
          DATE(created_at)::text AS date,
          event_name,
          COUNT(*)::int AS event_count
        FROM event_logs
        WHERE created_at >= ${startDate}
          AND event_name IN ('landing_cta_clicked', 'campaign_review_reached', 'send_started')
        GROUP BY DATE(created_at), event_name
        ORDER BY DATE(created_at)
      `),
      db.execute(sql`
        SELECT event_name, funnel_step, page_path, campaign_id, product_type, metadata, created_at
        FROM event_logs
        WHERE created_at >= ${startDate}
        ORDER BY created_at DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT event_name, COUNT(*)::int AS event_count
        FROM event_logs
        WHERE created_at >= ${startDate}
          AND event_name IN ('signup_failed', 'login_failed', 'payment_failed', 'campaign_update_failed', 'send_failed')
        GROUP BY event_name
      `),
    ]);

    const funnel = buildFunnel(eventResult.rows || []);
    const first = funnel[0]?.users || 0;
    const last = funnel[funnel.length - 1]?.users || 0;
    const finalConversion = first > 0 ? Math.round((last / first) * 1000) / 10 : 0;
    const failureEvents = FAILURE_EVENTS.map((eventName) => {
      const row = (failureResult.rows || []).find((item: any) => item.event_name === eventName);
      return { eventName, count: toNumber(row?.event_count) };
    });

    return res.status(200).json({
      period: { days, startDate: startDate.toISOString() },
      missingTable: false,
      overview: {
        startUsers: first,
        sendUsers: last,
        finalConversion,
        failureCount: failureEvents.reduce((sum, item) => sum + item.count, 0),
      },
      funnel,
      trends: trendResult.rows || [],
      recentEvents: recentResult.rows || [],
      failureEvents,
    });
  } catch (error) {
    if (isMissingEventTable(error)) {
      return res.status(200).json({
        period: { days: getDays(req.query.period), startDate: null },
        missingTable: true,
        overview: { startUsers: 0, sendUsers: 0, finalConversion: 0, failureCount: 0 },
        funnel: FUNNEL_STEPS.map((step) => ({
          key: step.key,
          label: step.label,
          events: 0,
          users: 0,
          conversionFromPrevious: 0,
          dropoff: 0,
        })),
        trends: [],
        recentEvents: [],
        failureEvents: FAILURE_EVENTS.map((eventName) => ({ eventName, count: 0 })),
        message: "event_logs 테이블을 먼저 만들어야 해요.",
      });
    }

    console.error('[Admin Funnel]', error);
    return res.status(500).json({ error: 'Failed to load funnel report' });
  }
}
