import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { CAMPAIGN_STATUS } from "@shared/schema";
import { calculateCampaignCredits, CREDIT_PRODUCTS, getCreditExpiryDate } from "@shared/credit-policy";
import {
  getBizChatCallbackCreditPlan,
  readBizChatCallbackCounts,
} from "@shared/bizchat-callback";
import { storage } from "./storage";
import { getLocalDevSessionUserId } from "./devAuth";

type DbTemplateRow = Record<string, any>;

const CATEGORIES = [
  { value: "commerce", label: "커머스/리테일" },
  { value: "cafe_food", label: "카페/음식/프랜차이즈" },
  { value: "travel_culture", label: "여행/문화" },
  { value: "sports_health", label: "스포츠/건강" },
  { value: "education_life", label: "교육/라이프" },
  { value: "medical", label: "병의원" },
];

const PURPOSES = [
  { value: "signup", label: "회원가입 유도" },
  { value: "review_event", label: "리뷰 이벤트" },
  { value: "holiday_discount", label: "명절 할인" },
  { value: "product_discount", label: "상품 할인 안내" },
  { value: "new_product", label: "신규 상품 안내" },
  { value: "new_product_discount", label: "신제품 할인 안내" },
  { value: "app_download", label: "앱 다운로드 이벤트" },
  { value: "offline_product_discount", label: "오프라인 행사 상품 할인 안내" },
  { value: "offline_event", label: "오프라인 행사 안내" },
  { value: "event", label: "이벤트 안내" },
  { value: "timedeal", label: "타임딜 이벤트" },
  { value: "special_product", label: "특가 상품 안내" },
  { value: "consultation", label: "상담 신청 유도" },
];

const ATS_CATEGORIES: Record<string, Array<{ id: string; cateid: string; name: string }>> = {
  "11st": [
    { id: "11ST_001", cateid: "11ST_001", name: "패션/의류" },
    { id: "11ST_002", cateid: "11ST_002", name: "뷰티/화장품" },
    { id: "11ST_003", cateid: "11ST_003", name: "식품/생활" },
  ],
  webapp: [
    { id: "APP_001", cateid: "APP_001", name: "금융/보험" },
    { id: "APP_002", cateid: "APP_002", name: "쇼핑" },
    { id: "APP_003", cateid: "APP_003", name: "여행/교통" },
  ],
  call: [
    { id: "CALL_001", cateid: "CALL_001", name: "통화량 상위" },
    { id: "CALL_002", cateid: "CALL_002", name: "업무시간 통화" },
    { id: "CALL_003", cateid: "CALL_003", name: "저녁시간 통화" },
  ],
};

const ATS_FILTERS = [
  {
    name: "성별",
    desc: "성별",
    code: "gender",
    dataType: "enum",
    min: 0,
    max: 0,
    unit: "",
    attributes: [
      { name: "남성", val: "M", desc: "남성" },
      { name: "여성", val: "F", desc: "여성" },
    ],
  },
  {
    name: "연령대",
    desc: "연령대",
    code: "age",
    dataType: "range",
    min: 20,
    max: 60,
    unit: "세",
    attributes: [],
  },
];

const ATS_LOCATIONS = [
  { hcode: "KR-11", ado: "서울특별시", sigu: "", dong: "" },
  { hcode: "KR-26", ado: "부산광역시", sigu: "", dong: "" },
  { hcode: "KR-27", ado: "대구광역시", sigu: "", dong: "" },
  { hcode: "KR-28", ado: "인천광역시", sigu: "", dong: "" },
  { hcode: "KR-41", ado: "경기도", sigu: "성남시", dong: "분당구" },
  { hcode: "KR-41-1", ado: "경기도", sigu: "수원시", dong: "" },
];

const LOCAL_ADMIN = {
  id: "local-admin-super",
  email: "admin2026@wepick.co.kr",
  password: "admin1234",
  name: "로컬 관리자",
  role: "super",
};

const LOCAL_DEFAULT_USER_ID = "local-92063146aaba48a8d4ea5ee0";

const CREDIT_PRODUCT_PRICES: Record<string, number> = {
  light: 100_000,
  topup: 100_000,
  booster: 500_000,
  enterprise: 1_000_000,
};

let poolPromise: Promise<any> | null = null;

async function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  if (!poolPromise) {
    const moduleName = "pg";
    poolPromise = import(moduleName).then((pg: any) => new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    }));
  }

  return poolPromise;
}

function hashPassword(password: string) {
  return crypto
    .createHash("sha256")
    .update(password + (process.env.ADMIN_SALT || "wepick-admin-salt"))
    .digest("hex");
}

function generateAdminToken(adminId: string) {
  const data = JSON.stringify({
    adminId,
    exp: Date.now() + 2 * 60 * 60 * 1000,
  });
  const signature = crypto
    .createHmac("sha256", process.env.ADMIN_JWT_SECRET!)
    .update(data)
    .digest("hex");

  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

async function ensureLocalAdmin(pool: any) {
  await pool.query(
    `
      insert into admins (id, email, password_hash, name, role, is_active, created_at, updated_at)
      values ($1, $2, $3, $4, $5, true, now(), now())
      on conflict (email) do update set
        password_hash = excluded.password_hash,
        name = excluded.name,
        role = excluded.role,
        is_active = true,
        updated_at = now()
    `,
    [
      LOCAL_ADMIN.id,
      LOCAL_ADMIN.email,
      hashPassword(LOCAL_ADMIN.password),
      LOCAL_ADMIN.name,
      LOCAL_ADMIN.role,
    ],
  );
}

async function ensureMessageCopyRequestsTable(pool: any) {
  await pool.query(`
    create table if not exists message_copy_requests (
      id varchar primary key,
      user_id varchar not null references users(id),
      content text not null,
      status varchar(30) not null default 'reviewing',
      admin_id varchar references admins(id),
      admin_note text,
      rejection_reason text,
      template_id varchar references templates(id),
      promoted_template_id varchar references recommended_templates(id),
      reviewed_at timestamp,
      created_at timestamp default now(),
      updated_at timestamp default now()
    )
  `);
  await pool.query("alter table message_copy_requests add column if not exists admin_note text");
  await pool.query("alter table message_copy_requests add column if not exists rejection_reason text");
  await pool.query("alter table message_copy_requests add column if not exists template_id varchar");
  await pool.query("alter table message_copy_requests add column if not exists promoted_template_id varchar");
  await pool.query("alter table message_copy_requests add column if not exists reviewed_at timestamp");
  await pool.query("alter table message_copy_requests add column if not exists updated_at timestamp default now()");
  await pool.query("create index if not exists idx_message_copy_requests_user on message_copy_requests(user_id)");
  await pool.query("create index if not exists idx_message_copy_requests_status on message_copy_requests(status)");
  await pool.query("create index if not exists idx_message_copy_requests_created on message_copy_requests(created_at desc)");
}

function getRequestUserId(req: Request) {
  const localDevUserId = getLocalDevSessionUserId(req);
  if (localDevUserId) return localDevUserId;

  const impersonateUserId = req.headers["x-impersonate-user-id"];
  if (typeof impersonateUserId === "string" && impersonateUserId.trim()) {
    return impersonateUserId.trim();
  }

  return LOCAL_DEFAULT_USER_ID;
}

function mapMessageCopyRequest(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    companyName: row.company_name,
    content: row.content,
    status: row.status,
    adminId: row.admin_id,
    adminName: row.admin_name,
    adminNote: row.admin_note,
    rejectionReason: row.rejection_reason,
    templateId: row.template_id,
    templateName: row.template_name,
    promotedTemplateId: row.promoted_template_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function verifyAdminToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const expectedSignature = crypto
      .createHmac("sha256", process.env.ADMIN_JWT_SECRET!)
      .update(decoded.data)
      .digest("hex");

    if (decoded.signature !== expectedSignature) return null;
    const payload = JSON.parse(decoded.data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

function mapTemplate(row: DbTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    purpose: row.purpose,
    version: row.version,
    titleTemplate: row.title_template,
    lmsTitleTemplate: row.lms_title_template,
    contentTemplate: row.content_template,
    lmsContentTemplate: row.lms_content_template,
    variableSchema: row.variable_schema,
    defaultImageUrl: row.default_image_url,
    messageType: row.message_type,
    rcsType: row.rcs_type,
    urlLinks: row.url_links,
    buttons: row.buttons,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    targetingConfig: row.targeting_config,
    sourceTemplateId: row.source_template_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCustomerTemplate(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    messageType: row.message_type,
    rcsType: row.rcs_type,
    title: row.title,
    lmsTitle: row.lms_title,
    content: row.content,
    lmsContent: row.lms_content,
    variableSchema: row.variable_schema || [],
    imageUrl: row.image_url,
    status: row.status,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function replaceLocalTemplateVariables(template: string | null | undefined, variables: Record<string, any>) {
  if (!template) return template || null;
  return Object.entries(variables || {}).reduce((result, [key, value]) => {
    let displayValue = value;
    if (value && typeof value === "object" && "start" in value && "end" in value) {
      displayValue = `${value.start} ~ ${value.end}`;
    }
    return result
      .split(`{{${key}}}`)
      .join(displayValue == null ? "" : String(displayValue))
      .split(`{${key}}`)
      .join(displayValue == null ? "" : String(displayValue));
  }, template);
}

function isLocalTemplateVariableMissing(value: any) {
  if (value && typeof value === "object" && ("start" in value || "end" in value)) {
    return !value.start || !value.end;
  }
  return value === undefined || value === null || String(value).trim() === "";
}

function getMissingLocalRequiredTemplateVariables(variableSchema: unknown, variables: Record<string, any>) {
  if (!Array.isArray(variableSchema)) return [];
  return variableSchema.filter((variable: any) => {
    const key = typeof variable?.key === "string" ? variable.key : "";
    return Boolean(variable?.required && key && isLocalTemplateVariableMissing(variables[key]));
  });
}

function hasLocalUnresolvedTemplateVariables(...templates: Array<string | null | undefined>) {
  return templates.some((template) => /\{[^}]+\}/.test(template || ""));
}

const TEMPLATE_FIELDS: Record<string, { column: string; json?: boolean }> = {
  name: { column: "name" },
  category: { column: "category" },
  purpose: { column: "purpose" },
  version: { column: "version" },
  titleTemplate: { column: "title_template" },
  lmsTitleTemplate: { column: "lms_title_template" },
  contentTemplate: { column: "content_template" },
  lmsContentTemplate: { column: "lms_content_template" },
  variableSchema: { column: "variable_schema", json: true },
  defaultImageUrl: { column: "default_image_url" },
  messageType: { column: "message_type" },
  rcsType: { column: "rcs_type" },
  urlLinks: { column: "url_links", json: true },
  buttons: { column: "buttons", json: true },
  isActive: { column: "is_active" },
  sortOrder: { column: "sort_order" },
  sourceTemplateId: { column: "source_template_id" },
  targetingConfig: { column: "targeting_config", json: true },
};

function dbValue(field: { json?: boolean }, value: unknown) {
  return field.json && value !== undefined ? JSON.stringify(value) : value;
}

async function handleAdminLogin(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호를 입력해 주세요" });
  }

  const pool = await getPool();
  if (email === LOCAL_ADMIN.email) {
    await ensureLocalAdmin(pool);
  }

  const { rows } = await pool.query(
    "select id, email, password_hash, name, role, is_active from admins where email = $1 limit 1",
    [email],
  );
  const admin = rows[0];

  if (!admin || !admin.is_active || admin.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
  }

  await pool.query(
    "update admins set last_login_at = now(), updated_at = now() where id = $1",
    [admin.id],
  );

  return res.status(200).json({
    success: true,
    token: generateAdminToken(admin.id),
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
}

async function handleAdminMe(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const verified = verifyAdminToken(authHeader.replace("Bearer ", ""));
  if (!verified) return res.status(401).json({ error: "Invalid or expired token" });

  const pool = await getPool();
  const { rows } = await pool.query(
    "select id, email, name, role, is_active from admins where id = $1 limit 1",
    [verified.adminId],
  );
  const admin = rows[0];

  if (!admin || !admin.is_active) {
    return res.status(401).json({ error: "Admin not found or inactive" });
  }

  return res.status(200).json({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });
}

async function getVerifiedAdmin(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const verified = verifyAdminToken(authHeader.replace("Bearer ", ""));
  if (!verified) return null;

  const pool = await getPool();
  const { rows } = await pool.query(
    "select id, email, name, role, is_active from admins where id = $1 limit 1",
    [verified.adminId],
  );
  const admin = rows[0];

  if (!admin || !admin.is_active) return null;
  return admin;
}

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

const FUNNEL_FAILURE_EVENTS = [
  "signup_failed",
  "login_failed",
  "payment_failed",
  "campaign_update_failed",
  "send_failed",
];

function getFunnelDays(value: unknown) {
  const parsed = Number.parseInt(String(value || "7"), 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(90, Math.max(1, parsed));
}

function buildLocalFunnel(eventRows: any[]) {
  const byEvent = new Map(
    eventRows.map((row) => [
      String(row.event_name),
      { events: Number(row.event_count || 0), users: Number(row.user_count || 0) },
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

async function handleAdminFunnel(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const days = getFunnelDays(req.query.period);
  const pool = await getPool();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  try {
    const [eventResult, trendResult, recentResult, failureResult] = await Promise.all([
      pool.query(
        `select
           event_name,
           count(*)::int as event_count,
           count(distinct coalesce(user_id, anonymous_id))::int as user_count
         from event_logs
         where created_at >= $1
         group by event_name`,
        [startDate],
      ),
      pool.query(
        `select
           date(created_at)::text as date,
           event_name,
           count(*)::int as event_count
         from event_logs
         where created_at >= $1
           and event_name in ('landing_cta_clicked', 'campaign_review_reached', 'send_started')
         group by date(created_at), event_name
         order by date(created_at)`,
        [startDate],
      ),
      pool.query(
        `select event_name, funnel_step, page_path, campaign_id, product_type, metadata, created_at
         from event_logs
         where created_at >= $1
         order by created_at desc
         limit 30`,
        [startDate],
      ),
      pool.query(
        `select event_name, count(*)::int as event_count
         from event_logs
         where created_at >= $1
           and event_name in ('signup_failed', 'login_failed', 'payment_failed', 'campaign_update_failed', 'send_failed')
         group by event_name`,
        [startDate],
      ),
    ]);

    const funnel = buildLocalFunnel(eventResult.rows || []);
    const first = funnel[0]?.users || 0;
    const last = funnel[funnel.length - 1]?.users || 0;
    const failureEvents = FUNNEL_FAILURE_EVENTS.map((eventName) => {
      const row = (failureResult.rows || []).find((item: any) => item.event_name === eventName);
      return { eventName, count: Number(row?.event_count || 0) };
    });

    return res.status(200).json({
      period: { days, startDate: startDate.toISOString() },
      missingTable: false,
      overview: {
        startUsers: first,
        sendUsers: last,
        finalConversion: first > 0 ? Math.round((last / first) * 1000) / 10 : 0,
        failureCount: failureEvents.reduce((sum, item) => sum + item.count, 0),
      },
      funnel,
      trends: trendResult.rows || [],
      recentEvents: recentResult.rows || [],
      failureEvents,
    });
  } catch (error: any) {
    if (error?.code === "42P01" || String(error?.message || "").includes("event_logs")) {
      return res.status(200).json({
        period: { days, startDate: null },
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
        failureEvents: FUNNEL_FAILURE_EVENTS.map((eventName) => ({ eventName, count: 0 })),
        message: "event_logs 테이블을 먼저 만들어야 해요.",
      });
    }
    throw error;
  }
}

async function handleAdminUsers(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const search = String(req.query.search || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;

  const values: unknown[] = [];
  let where = "";

  if (search) {
    values.push(`%${search}%`);
    where = `where email ilike $${values.length} or company_name ilike $${values.length}`;
  }

  const { rows: countRows } = await pool.query(
    `select count(*)::int as count from users ${where}`,
    values,
  );

  values.push(limit, offset);
  const { rows } = await pool.query(
    `select
       id,
       email,
       first_name as "firstName",
       last_name as "lastName",
       profile_image_url as "profileImageUrl",
       company_name as "companyName",
       business_number as "businessNumber",
       representative_name as "representativeName",
       phone,
       balance,
       stripe_customer_id as "stripeCustomerId",
       is_verified as "isVerified",
       is_master as "isMaster",
       master_reset_at as "masterResetAt",
       is_agency as "isAgency",
       agency_id as "agencyId",
       created_at as "createdAt",
       updated_at as "updatedAt"
     from users
     ${where}
     order by created_at desc
     limit $${values.length - 1}
     offset $${values.length}`,
    values,
  );

  return res.status(200).json({
    users: rows,
    total: Number(countRows[0]?.count || 0),
    page,
    limit,
  });
}

async function handleAdminLogs(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const search = String(req.query.search || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
  const offset = (page - 1) * limit;

  const values: unknown[] = [];
  const conditions: string[] = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(a.name ilike $${values.length} or a.email ilike $${values.length} or l.action ilike $${values.length})`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const { rows: countRows } = await pool.query(
    `select count(*)::int as count
     from admin_logs l
     left join admins a on a.id = l.admin_id
     ${where}`,
    values,
  );

  values.push(limit, offset);
  const { rows } = await pool.query(
    `select
       l.id,
       l.action,
       l.target_type as "targetType",
       l.target_id as "targetId",
       l.details,
       l.ip_address as "ipAddress",
       l.created_at as "createdAt",
       l.admin_id as "adminId",
       a.name as "adminName",
       a.email as "adminEmail"
     from admin_logs l
     left join admins a on a.id = l.admin_id
     ${where}
     order by l.created_at desc
     limit $${values.length - 1}
     offset $${values.length}`,
    values,
  );

  return res.status(200).json({
    logs: rows,
    total: Number(countRows[0]?.count || 0),
    page,
    limit,
  });
}

async function handleAdminRefunds(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all");
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`u.email ilike $${values.length}`);
  }

  if (status && status !== "all") {
    values.push(status);
    conditions.push(`r.status = $${values.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const { rows: countRows } = await pool.query(
    `select count(*)::int as count
     from refunds r
     left join users u on u.id = r.user_id
     ${where}`,
    values,
  );
  const { rows: pendingRows } = await pool.query(
    "select count(*)::int as count from refunds where status = 'pending'",
  );
  const { rows: totalRows } = await pool.query(
    "select coalesce(sum(amount), 0)::numeric as sum from refunds where status = 'completed'",
  );

  values.push(limit, offset);
  const { rows } = await pool.query(
    `select
       r.id,
       r.user_id as "userId",
       r.amount,
       r.reason,
       r.status,
       r.admin_note as "adminNote",
       r.bank_name as "bankName",
       r.account_number as "accountNumber",
       r.account_holder as "accountHolder",
       r.processed_at as "processedAt",
       r.created_at as "createdAt",
       u.email as "userEmail"
     from refunds r
     left join users u on u.id = r.user_id
     ${where}
     order by r.created_at desc
     limit $${values.length - 1}
     offset $${values.length}`,
    values,
  );

  return res.status(200).json({
    refunds: rows,
    total: Number(countRows[0]?.count || 0),
    page,
    limit,
    pendingCount: Number(pendingRows[0]?.count || 0),
    totalRefunded: Number(totalRows[0]?.sum || 0),
  });
}

async function handleMessageCopyRequests(req: Request, res: Response) {
  const pool = await getPool();
  await ensureMessageCopyRequestsTable(pool);
  const userId = getRequestUserId(req);

  if (req.method === "GET") {
    const { rows } = await pool.query(
      `select
         r.*,
         u.email as user_email,
         u.company_name,
         a.name as admin_name,
         t.name as template_name
       from message_copy_requests r
       left join users u on u.id = r.user_id
       left join admins a on a.id = r.admin_id
       left join templates t on t.id = r.template_id
       where r.user_id = $1
       order by r.created_at desc
       limit 20`,
      [userId],
    );

    return res.status(200).json({
      requests: rows.map(mapMessageCopyRequest),
      pendingCount: rows.filter((row: any) => row.status === "reviewing").length,
    });
  }

  if (req.method === "POST") {
    const content = String(req.body?.content || "").trim();
    if (content.length < 5) {
      return res.status(400).json({ error: "요청 내용을 5자 이상 입력해주세요" });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: "요청 내용은 2,000자 이하로 입력해주세요" });
    }

    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Local', 'User', '로컬 테스트 고객사', '010-0000-0000', '0', true, false, false, now(), now())
       on conflict (id) do nothing`,
      [userId, `${userId}@wepick.local`],
    );

    const id = `copy-request-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const { rows } = await pool.query(
      `insert into message_copy_requests (
         id, user_id, content, status, created_at, updated_at
       )
       values ($1, $2, $3, 'reviewing', now(), now())
       returning *`,
      [id, userId, content],
    );

    return res.status(201).json({
      success: true,
      request: mapMessageCopyRequest(rows[0]),
      notification: {
        screen: true,
        sms: false,
        message: "운영자 화면의 메시지 유형 요청함에 알림이 표시됩니다.",
      },
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function handleAdminMessageCopyRequests(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  await ensureMessageCopyRequestsTable(pool);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all");
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (status && status !== "all") {
    values.push(status);
    conditions.push(`r.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(u.email ilike $${values.length} or u.company_name ilike $${values.length} or r.content ilike $${values.length})`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await pool.query(
    `select
       r.*,
       u.email as user_email,
       u.company_name,
       a.name as admin_name,
       t.name as template_name
     from message_copy_requests r
     left join users u on u.id = r.user_id
     left join admins a on a.id = r.admin_id
     left join templates t on t.id = r.template_id
     ${where}
     order by
       case when r.status = 'reviewing' then 0 else 1 end,
       r.created_at desc
     limit 100`,
    values,
  );
  const { rows: countRows } = await pool.query(
    `select status, count(*)::int as count
     from message_copy_requests
     group by status`,
  );

  return res.status(200).json({
    requests: rows.map(mapMessageCopyRequest),
    counts: countRows.reduce((acc: Record<string, number>, row: any) => {
      acc[row.status] = Number(row.count || 0);
      return acc;
    }, {}),
  });
}

async function handleAdminMessageCopyRequestProcess(req: Request, res: Response, requestId: string) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const action = String(req.body?.action || "");
  const adminNote = req.body?.adminNote ? String(req.body.adminNote) : null;
  const templateId = req.body?.templateId ? String(req.body.templateId) : null;
  const rejectionReason = req.body?.rejectionReason ? String(req.body.rejectionReason) : null;
  const statusByAction: Record<string, string> = {
    approve_private: "approved_private",
    reject: "rejected",
    promote: "promoted",
    review: "reviewing",
  };
  const nextStatus = statusByAction[action];

  if (!nextStatus) return res.status(400).json({ error: "Invalid action" });
  if (action === "approve_private" && !templateId) {
    return res.status(400).json({ error: "고객 전용으로 반영할 템플릿을 선택해주세요" });
  }
  if (action === "reject" && !rejectionReason) {
    return res.status(400).json({ error: "보완 요청 내용을 입력해주세요" });
  }

  const pool = await getPool();
  await ensureMessageCopyRequestsTable(pool);
  if (templateId) {
    const { rows: templateRows } = await pool.query(
      `select t.id
       from templates t
       join message_copy_requests r on r.user_id = t.user_id
       where r.id = $1
         and t.id = $2
         and t.status = 'approved'
       limit 1`,
      [requestId, templateId],
    );
    if (!templateRows[0]) {
      return res.status(400).json({ error: "요청 고객에게 승인된 템플릿만 연결할 수 있습니다" });
    }
  }
  const { rows } = await pool.query(
    `update message_copy_requests
     set status = $1,
         admin_id = $2,
         admin_note = $3,
         template_id = coalesce($4, template_id),
         rejection_reason = $5,
         reviewed_at = case when $1 = 'reviewing' then null else now() end,
         updated_at = now()
     where id = $6
     returning *`,
    [nextStatus, admin.id, adminNote, templateId, rejectionReason, requestId],
  );

  if (!rows[0]) return res.status(404).json({ error: "메시지 유형 요청을 찾을 수 없습니다" });

  return res.status(200).json({
    success: true,
    request: mapMessageCopyRequest(rows[0]),
  });
}

async function handleAdminMessageCopyRequestTemplates(req: Request, res: Response, requestId: string) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  await ensureMessageCopyRequestsTable(pool);
  await pool.query("alter table templates add column if not exists variable_schema jsonb");

  const { rows: requestRows } = await pool.query(
    `select r.id, r.user_id, u.email as user_email, u.company_name
     from message_copy_requests r
     left join users u on u.id = r.user_id
     where r.id = $1
     limit 1`,
    [requestId],
  );

  const request = requestRows[0];
  if (!request) return res.status(404).json({ error: "메시지 유형 요청을 찾을 수 없습니다" });

  if (req.method === "POST") {
    const name = String(req.body?.name || "").trim();
    const messageType = String(req.body?.messageType || "RCS").trim();
    const title = req.body?.title ? String(req.body.title).trim() : null;
    const lmsTitle = req.body?.lmsTitle ? String(req.body.lmsTitle).trim() : null;
    const content = String(req.body?.content || "").trim();
    const lmsContent = req.body?.lmsContent ? String(req.body.lmsContent).trim() : null;
    const variableSchema = Array.isArray(req.body?.variableSchema) ? req.body.variableSchema : [];
    const allowedTypes = new Set(["LMS", "MMS", "RCS"]);

    if (!name) return res.status(400).json({ error: "템플릿 이름을 입력해주세요" });
    if (!allowedTypes.has(messageType)) return res.status(400).json({ error: "지원하지 않는 메시지 유형입니다" });
    if (!content) return res.status(400).json({ error: "SKT 검수 완료 본문을 입력해주세요" });
    if (messageType === "RCS" && !lmsContent) {
      return res.status(400).json({ error: "RCS 템플릿은 LMS 대체 문구도 필요합니다" });
    }

    const templateId = crypto.randomUUID();
    const { rows: createdRows } = await pool.query(
      `insert into templates (
         id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
         variable_schema, status, reviewed_at, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'approved', now(), now(), now())
       returning id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
                 variable_schema, image_url, status, reviewed_at, created_at, updated_at`,
      [
        templateId,
        request.user_id,
        name,
        messageType,
        messageType === "RCS" ? 4 : null,
        title,
        messageType === "RCS" ? lmsTitle : null,
        content,
        messageType === "RCS" ? lmsContent : null,
        JSON.stringify(variableSchema),
      ],
    );

    return res.status(201).json({
      success: true,
      template: mapCustomerTemplate(createdRows[0]),
    });
  }

  const { rows } = await pool.query(
    `select id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
            variable_schema, image_url, status, reviewed_at, created_at, updated_at
     from templates
     where user_id = $1
       and status = 'approved'
     order by reviewed_at desc nulls last, created_at desc
     limit 100`,
    [request.user_id],
  );

  return res.status(200).json({
    request: {
      id: request.id,
      userId: request.user_id,
      userEmail: request.user_email,
      companyName: request.company_name,
    },
    templates: rows.map(mapCustomerTemplate),
  });
}

async function handleLocalVerifyMessageCopyRequests(req: Request, res: Response) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  await ensureLocalAdmin(pool);
  await ensureMessageCopyRequestsTable(pool);

  const userId = LOCAL_DEFAULT_USER_ID;
  await pool.query(
    `insert into users (
       id, email, first_name, last_name, company_name, phone, balance,
       is_verified, is_master, is_agency, created_at, updated_at
     )
     values ($1, $2, 'Local', 'User', '로컬 테스트 고객사', '010-0000-0000', '0', true, false, false, now(), now())
     on conflict (id) do nothing`,
    [userId, `${userId}@wepick.local`],
  );

  const id = `verify-copy-request-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const content = "재방문 고객에게 다음 예약 혜택을 안내하는 메시지 유형이 필요해요.";
  const { rows: insertedRows } = await pool.query(
    `insert into message_copy_requests (
       id, user_id, content, status, created_at, updated_at
     )
     values ($1, $2, $3, 'reviewing', now(), now())
     returning *`,
    [id, userId, content],
  );

  const { rows: userRows } = await pool.query(
    `select
       r.*,
       u.email as user_email,
       u.company_name,
       a.name as admin_name,
       t.name as template_name
     from message_copy_requests r
     left join users u on u.id = r.user_id
     left join admins a on a.id = r.admin_id
     left join templates t on t.id = r.template_id
     where r.user_id = $1
     order by r.created_at desc
     limit 20`,
    [userId],
  );

  const { rows: adminRows } = await pool.query(
    `select
       r.*,
       u.email as user_email,
       u.company_name,
       a.name as admin_name,
       t.name as template_name
     from message_copy_requests r
     left join users u on u.id = r.user_id
     left join admins a on a.id = r.admin_id
     left join templates t on t.id = r.template_id
     where r.status = 'reviewing'
     order by r.created_at desc
     limit 100`,
  );

  const pendingCount = userRows.filter((row: any) => row.status === "reviewing").length;
  const adminReviewingCount = adminRows.length;
  const passed =
    Boolean(insertedRows[0]) &&
    userRows.some((row: any) => row.id === id) &&
    adminRows.some((row: any) => row.id === id) &&
    pendingCount > 0 &&
    adminReviewingCount > 0;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    request: mapMessageCopyRequest(insertedRows[0]),
    userNotification: {
      route: "/more",
      pendingCount,
      latestRequest: mapMessageCopyRequest(userRows[0]),
    },
    adminNotification: {
      route: "/admin/message-copy-requests",
      reviewingCount: adminReviewingCount,
      latestRequest: mapMessageCopyRequest(adminRows[0]),
    },
  });
}

async function handleLocalVerifyMessageCopyPrivateTemplateFlow(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  await ensureLocalAdmin(pool);
  await ensureMessageCopyRequestsTable(pool);
  await pool.query("alter table templates add column if not exists variable_schema jsonb");

  const runId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const ownerUserId = `local-copy-owner-${runId}`;
  const otherUserId = `local-copy-other-${runId}`;
  const requestId = `local-copy-request-${runId}`;
  const ownerTemplateId = `local-copy-template-${runId}`;
  const otherTemplateId = `local-copy-other-template-${runId}`;
  const draftTemplateId = `local-copy-draft-template-${runId}`;

  async function insertUser(id: string, email: string, companyName: string) {
    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Copy', 'Flow', $3, '010-0000-0000', '0',
               true, false, false, now(), now())
       on conflict (id) do update set
         email = excluded.email,
         company_name = excluded.company_name,
         updated_at = now()`,
      [id, email, companyName],
    );
  }

  async function insertTemplate(id: string, userId: string, name: string, status: string) {
    await pool.query(
      `insert into templates (
         id, user_id, name, message_type, rcs_type, title, lms_title,
         content, lms_content, variable_schema, status, reviewed_at, created_at, updated_at
       )
       values ($1, $2, $3, 'RCS', 4, '검수 완료 안내', '검수 완료 안내',
               '검수 완료된 {브랜드명} 고객 전용 메시지입니다.', '검수 완료된 {브랜드명} 고객 전용 메시지입니다.',
               $4::jsonb, $5, case when $6 = 'approved' then now() else null end, now(), now())
       on conflict (id) do update set
         user_id = excluded.user_id,
         name = excluded.name,
         status = excluded.status,
         variable_schema = excluded.variable_schema,
         reviewed_at = excluded.reviewed_at,
         updated_at = now()`,
      [
        id,
        userId,
        name,
        JSON.stringify([{ key: "브랜드명", label: "브랜드명", type: "text", required: true }]),
        status,
        status,
      ],
    );
  }

  await insertUser(ownerUserId, `${ownerUserId}@wepick.local`, "고객 전용 검증 고객사");
  await insertUser(otherUserId, `${otherUserId}@wepick.local`, "다른 고객사");
  await insertTemplate(ownerTemplateId, ownerUserId, "고객 전용 검수 템플릿", "approved");
  await insertTemplate(otherTemplateId, otherUserId, "다른 고객 템플릿", "approved");
  await insertTemplate(draftTemplateId, ownerUserId, "아직 검수 전 템플릿", "draft");

  await pool.query(
    `insert into message_copy_requests (
       id, user_id, content, status, created_at, updated_at
     )
     values ($1, $2, '이 고객에게만 필요한 메시지 유형입니다.', 'reviewing', now(), now())
     on conflict (id) do update set
       user_id = excluded.user_id,
       content = excluded.content,
       status = excluded.status,
       template_id = null,
       updated_at = now()`,
    [requestId, ownerUserId],
  );

  const { rows: validOwnerTemplateRows } = await pool.query(
    `select t.id
     from templates t
     join message_copy_requests r on r.user_id = t.user_id
     where r.id = $1
       and t.id = $2
       and t.status = 'approved'
     limit 1`,
    [requestId, ownerTemplateId],
  );
  const { rows: invalidOtherTemplateRows } = await pool.query(
    `select t.id
     from templates t
     join message_copy_requests r on r.user_id = t.user_id
     where r.id = $1
       and t.id = $2
       and t.status = 'approved'
     limit 1`,
    [requestId, otherTemplateId],
  );
  const { rows: invalidDraftTemplateRows } = await pool.query(
    `select t.id
     from templates t
     join message_copy_requests r on r.user_id = t.user_id
     where r.id = $1
       and t.id = $2
       and t.status = 'approved'
     limit 1`,
    [requestId, draftTemplateId],
  );

  await pool.query(
    `update message_copy_requests
     set status = 'approved_private',
         admin_id = $1,
         admin_note = '로컬 고객 전용 템플릿 검증',
         template_id = $2,
         reviewed_at = now(),
         updated_at = now()
     where id = $3`,
    [LOCAL_ADMIN.id, ownerTemplateId, requestId],
  );

  const ownerRequests = await runLocalVerificationHandler(req, handleMessageCopyRequests, {
    headers: { "x-impersonate-user-id": ownerUserId } as any,
  });
  const otherRequests = await runLocalVerificationHandler(req, handleMessageCopyRequests, {
    headers: { "x-impersonate-user-id": otherUserId } as any,
  });
  const ownerTemplates = await runLocalVerificationHandler(req, handleRecommendedTemplates, {
    query: {},
    headers: { "x-impersonate-user-id": ownerUserId } as any,
  });
  const otherTemplates = await runLocalVerificationHandler(req, handleRecommendedTemplates, {
    query: {},
    headers: { "x-impersonate-user-id": otherUserId } as any,
  });

  const ownerRequest = ownerRequests.body?.requests?.find((item: any) => item.id === requestId);
  const otherRequest = otherRequests.body?.requests?.find((item: any) => item.id === requestId);
  const ownerPrivateTemplate = ownerTemplates.body?.templates?.find((item: any) => item.sourceTemplateId === ownerTemplateId);
  const ownerDraftTemplate = ownerTemplates.body?.templates?.find((item: any) => item.sourceTemplateId === draftTemplateId);
  const leakedTemplate = otherTemplates.body?.templates?.find((item: any) => item.sourceTemplateId === ownerTemplateId);

  const passed =
    validOwnerTemplateRows.length === 1 &&
    invalidOtherTemplateRows.length === 0 &&
    invalidDraftTemplateRows.length === 0 &&
    ownerRequests.statusCode === 200 &&
    otherRequests.statusCode === 200 &&
    ownerTemplates.statusCode === 200 &&
    otherTemplates.statusCode === 200 &&
    ownerRequest?.status === "approved_private" &&
    ownerRequest?.templateId === ownerTemplateId &&
    ownerRequest?.templateName === "고객 전용 검수 템플릿" &&
    !otherRequest &&
    ownerPrivateTemplate?.isPrivate === true &&
    ownerPrivateTemplate?.sourceTemplateId === ownerTemplateId &&
    ownerPrivateTemplate?.variableSchema?.[0]?.key === "브랜드명" &&
    !ownerDraftTemplate &&
    !leakedTemplate;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    ownerUserId,
    otherUserId,
    requestId,
    templateId: ownerTemplateId,
    guards: {
      ownerApprovedTemplateCanBeLinked: validOwnerTemplateRows.length === 1,
      otherUserTemplateCannotBeLinked: invalidOtherTemplateRows.length === 0,
      draftTemplateCannotBeLinked: invalidDraftTemplateRows.length === 0,
      ownerCanSeeRequestResult: Boolean(ownerRequest),
      otherUserCannotSeeRequestResult: !otherRequest,
      ownerCanSeePrivateTemplate: Boolean(ownerPrivateTemplate),
      privateTemplateKeepsVariableSchema: ownerPrivateTemplate?.variableSchema?.[0]?.key === "브랜드명",
      draftTemplateHidden: !ownerDraftTemplate,
      privateTemplateNotLeaked: !leakedTemplate,
    },
  });
}

async function handleLocalVerifyTemplateVariableCampaignFlow(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const runId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const userId = `local-variable-user-${runId}`;
  const templateId = `local-variable-template-${runId}`;
  const campaignId = `local-variable-campaign-${runId}`;
  const messageId = `local-variable-message-${runId}`;
  const variableSchema = [
    { key: "브랜드명", label: "브랜드명", type: "text", required: true },
    { key: "기간", label: "기간", type: "dateRange", required: true },
    { key: "혜택", label: "혜택", type: "text", required: false },
  ];
  const completeVariables = {
    브랜드명: "위픽테스트",
    기간: { start: "2026-06-12", end: "2026-06-30" },
    혜택: "방문 고객 특별 혜택",
  };

  await pool.query("alter table templates add column if not exists variable_schema jsonb");
  await pool.query("alter table campaigns add column if not exists creation_mode varchar(20)");
  await pool.query("alter table campaigns add column if not exists recommended_template_id varchar");
  await pool.query("alter table campaigns add column if not exists variable_values jsonb");

  await pool.query(
    `insert into users (
       id, email, first_name, last_name, company_name, phone, balance,
       is_verified, is_master, is_agency, created_at, updated_at
     )
     values ($1, $2, 'Variable', 'User', '변수 검증 고객사', '010-0000-0000', '1000000',
             true, false, false, now(), now())
     on conflict (id) do update set updated_at = now()`,
    [userId, `${userId}@wepick.local`],
  );

  await pool.query(
    `insert into templates (
       id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
       variable_schema, status, reviewed_at, created_at, updated_at
     )
     values ($1, $2, '변수 검증 템플릿', 'RCS', 4,
             '{브랜드명} 안내', '{브랜드명} 안내',
             '{브랜드명}의 {기간} 동안 {혜택}을 안내드립니다.',
             '{브랜드명}의 {기간} 동안 {혜택}을 안내드립니다.',
             $3::jsonb, 'approved', now(), now(), now())`,
    [templateId, userId, JSON.stringify(variableSchema)],
  );

  const missingBrand = getMissingLocalRequiredTemplateVariables(variableSchema, { 기간: completeVariables.기간 });
  const missingPeriod = getMissingLocalRequiredTemplateVariables(variableSchema, { 브랜드명: completeVariables.브랜드명 });
  const missingNone = getMissingLocalRequiredTemplateVariables(variableSchema, completeVariables);
  const partiallyResolvedContent = replaceLocalTemplateVariables("{브랜드명}의 {기간} 안내", {
    브랜드명: completeVariables.브랜드명,
  });
  const resolvedTitle = replaceLocalTemplateVariables("{브랜드명} 안내", completeVariables);
  const resolvedContent = replaceLocalTemplateVariables(
    "{브랜드명}의 {기간} 동안 {혜택}을 안내드립니다.",
    completeVariables,
  );
  const unresolvedGuardBlocksPartial = hasLocalUnresolvedTemplateVariables(partiallyResolvedContent);
  const completedHasNoUnresolvedVariables = !hasLocalUnresolvedTemplateVariables(resolvedTitle, resolvedContent);

  await pool.query(
    `insert into campaigns (
       id, user_id, name, template_id, message_type, snd_num, status_code, status,
       target_count, budget, cost_per_message, creation_mode, recommended_template_id,
       variable_values, created_at, updated_at
     )
     values ($1, $2, '변수 검증 캠페인', $3, 'RCS', '001001', $4, $5,
             1000, '100000', '100', 'recommended', $6,
             $7::jsonb, now(), now())`,
    [
      campaignId,
      userId,
      templateId,
      CAMPAIGN_STATUS.DRAFT.code,
      CAMPAIGN_STATUS.DRAFT.status,
      `private-${templateId}`,
      JSON.stringify(completeVariables),
    ],
  );

  await pool.query(
    `insert into messages (
       id, campaign_id, title, lms_title, content, lms_content, created_at
     )
     values ($1, $2, $3, $3, $4, $4, now())`,
    [messageId, campaignId, resolvedTitle, resolvedContent],
  );

  const { rows: storedRows } = await pool.query(
    `select c.variable_values, m.title, m.content
     from campaigns c
     join messages m on m.campaign_id = c.id
     where c.id = $1
     limit 1`,
    [campaignId],
  );
  const stored = storedRows[0];
  const storedVariables = stored?.variable_values || {};

  const passed =
    missingBrand.map((item: any) => item.key).includes("브랜드명") &&
    missingPeriod.map((item: any) => item.key).includes("기간") &&
    missingNone.length === 0 &&
    unresolvedGuardBlocksPartial &&
    completedHasNoUnresolvedVariables &&
    stored?.title === "위픽테스트 안내" &&
    stored?.content === "위픽테스트의 2026-06-12 ~ 2026-06-30 동안 방문 고객 특별 혜택을 안내드립니다." &&
    storedVariables["브랜드명"] === completeVariables.브랜드명 &&
    storedVariables["기간"]?.start === completeVariables.기간.start;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    templateId,
    campaignId,
    guards: {
      requiredBrandBlocked: missingBrand.map((item: any) => item.key).includes("브랜드명"),
      requiredPeriodBlocked: missingPeriod.map((item: any) => item.key).includes("기간"),
      completeVariablesAllowed: missingNone.length === 0,
      unresolvedVariablesBlocked: unresolvedGuardBlocksPartial,
      completedMessageHasNoPlaceholders: completedHasNoUnresolvedVariables,
      storedFinalMessage: stored?.content,
      storedVariableValues: storedVariables,
    },
  });
}

function getCreditUnitPrice(productType: string | null, originalCredits: number) {
  if (!productType || originalCredits <= 0) return 0;
  const price = CREDIT_PRODUCT_PRICES[productType] || 0;
  return price > 0 ? price / originalCredits : 0;
}

async function handleAdminRefundProcess(req: Request, res: Response, refundId: string) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const action = String(req.body?.action || "");
  const adminNote = req.body?.adminNote ? String(req.body.adminNote) : null;

  if (!["approve", "reject", "complete"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows: refundRows } = await client.query(
      "select * from refunds where id = $1 for update",
      [refundId],
    );
    const refund = refundRows[0];

    if (!refund) {
      await client.query("rollback");
      return res.status(404).json({ error: "환불 요청을 찾을 수 없습니다" });
    }

    if (refund.status === "completed") {
      await client.query("rollback");
      return res.status(400).json({ error: "이미 완료된 환불입니다" });
    }

    let newStatus = refund.status;

    if (action === "approve") {
      if (refund.status !== "pending") {
        await client.query("rollback");
        return res.status(400).json({ error: "대기 중인 환불만 승인할 수 있습니다" });
      }
      newStatus = "approved";
    }

    if (action === "reject") {
      if (!["pending", "approved"].includes(refund.status)) {
        await client.query("rollback");
        return res.status(400).json({ error: "처리 가능한 환불 상태가 아닙니다" });
      }
      newStatus = "rejected";
    }

    if (action === "complete") {
      if (refund.status !== "approved") {
        await client.query("rollback");
        return res.status(400).json({ error: "승인된 환불만 완료 처리할 수 있습니다" });
      }

      const idempotencyKey = `refund-complete:${refund.id}`;
      const { rows: existingLedger } = await client.query(
        "select id from credit_ledger where idempotency_key = $1 limit 1",
        [idempotencyKey],
      );

      if (existingLedger.length === 0) {
        const { rows: lots } = await client.query(
          `select id, product_type, original_credits, remaining_credits, expires_at
           from credit_grants
           where user_id = $1
             and remaining_credits > 0
             and expires_at > now()
           order by expires_at asc, created_at asc
           for update`,
          [refund.user_id],
        );
        const refundableValueKrw = lots.reduce((sum: number, lot: any) => {
          const unitPrice = getCreditUnitPrice(lot.product_type, Number(lot.original_credits || 0));
          return sum + Number(lot.remaining_credits || 0) * unitPrice;
        }, 0);
        const refundAmount = Number(refund.amount || 0);

        if (refundAmount <= 0 || refundableValueKrw < refundAmount) {
          await client.query("rollback");
          return res.status(400).json({
            error: `환불 가능한 크레딧 가치가 부족합니다. 환불 가능 약 ${Math.floor(refundableValueKrw).toLocaleString("ko-KR")}원`,
          });
        }

        let remainingKrwToRefund = refundAmount;
        let totalRefundedCredits = 0;
        let lastProductType: string | null = null;

        for (const lot of lots) {
          if (remainingKrwToRefund <= 0) break;

          const currentRemaining = Number(lot.remaining_credits || 0);
          const originalCredits = Number(lot.original_credits || 0);
          const unitPrice = getCreditUnitPrice(lot.product_type, originalCredits);
          if (currentRemaining <= 0 || unitPrice <= 0) continue;

          const lotValueKrw = currentRemaining * unitPrice;
          const valueToRefundFromLot = Math.min(lotValueKrw, remainingKrwToRefund);
          const refundedCredits = Math.min(
            currentRemaining,
            Math.ceil(valueToRefundFromLot / unitPrice),
          );
          const refundValueKrw = refundedCredits * unitPrice;

          await client.query(
            "update credit_grants set remaining_credits = remaining_credits - $1, updated_at = now() where id = $2",
            [refundedCredits, lot.id],
          );

          totalRefundedCredits += refundedCredits;
          remainingKrwToRefund = Math.max(0, remainingKrwToRefund - refundValueKrw);
          lastProductType = lot.product_type || lastProductType;
        }

        if (remainingKrwToRefund > 0 || totalRefundedCredits <= 0) {
          await client.query("rollback");
          return res.status(400).json({ error: "환불 크레딧 차감에 실패했습니다" });
        }

        const { rows: balanceRows } = await client.query(
          `select coalesce(sum(remaining_credits), 0)::int as balance
           from credit_grants
           where user_id = $1
             and remaining_credits > 0
             and expires_at > now()`,
          [refund.user_id],
        );
        const balanceAfterCredits = Number(balanceRows[0]?.balance || 0);

        await client.query(
          `insert into credit_ledger (
             user_id,
             type,
             amount_credits,
             balance_after_credits,
             product_type,
             idempotency_key,
             description,
             metadata,
             created_at
           )
           values ($1, 'refund', $2, $3, $4, $5, $6, $7::jsonb, now())`,
          [
            refund.user_id,
            -totalRefundedCredits,
            balanceAfterCredits,
            lastProductType,
            idempotencyKey,
            `환불 완료 (${refund.reason})`,
            JSON.stringify({
              refundId: refund.id,
              refundAmount,
              totalRefundedCredits,
            }),
          ],
        );
      }

      newStatus = "completed";
    }

    const { rows: updatedRows } = await client.query(
      `update refunds
       set status = $1,
           admin_id = $2,
           admin_note = coalesce($3, admin_note),
           processed_at = now(),
           updated_at = now()
       where id = $4
       returning *`,
      [newStatus, admin.id, adminNote, refund.id],
    );

    await client.query(
      `insert into admin_logs (admin_id, action, target_type, target_id, details, ip_address, created_at)
       values ($1, $2, 'refund', $3, $4::jsonb, $5, now())`,
      [
        admin.id,
        `refund_${action}`,
        refund.id,
        JSON.stringify({
          amount: refund.amount,
          previousStatus: refund.status,
          newStatus,
          adminNote,
        }),
        req.ip,
      ],
    );

    await client.query("commit");
    return res.status(200).json({
      success: true,
      refund: updatedRows[0],
      message: `환불이 ${newStatus === "approved" ? "승인" : newStatus === "rejected" ? "거절" : "완료"}되었습니다`,
    });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function mapCreditGrant(row: any) {
  return {
    id: row.id,
    productType: row.product_type,
    originalCredits: Number(row.original_credits || 0),
    remainingCredits: Number(row.remaining_credits || 0),
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    transactionId: row.transaction_id,
  };
}

function mapCreditLedger(row: any) {
  return {
    id: row.id,
    type: row.type,
    amountCredits: Number(row.amount_credits || 0),
    balanceAfterCredits: row.balance_after_credits == null ? null : Number(row.balance_after_credits),
    productType: row.product_type,
    description: row.description,
    campaignId: row.campaign_id,
    transactionId: row.transaction_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

async function handleAdminUserCredits(req: Request, res: Response, userId: string) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await getVerifiedAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();

  if (req.method === "POST") {
    const amountCredits = Number(req.body?.amountCredits);
    const reason = String(req.body?.reason || "").trim();
    const adjustmentKey = typeof req.body?.adjustmentKey === "string"
      ? req.body.adjustmentKey.trim()
      : "";
    const idempotencyKey = adjustmentKey
      ? `admin-adjust:${userId}:${adjustmentKey.slice(0, 80)}`
      : null;

    if (!Number.isInteger(amountCredits) || amountCredits === 0) {
      return res.status(400).json({ error: "조정 크레딧을 0이 아닌 정수로 입력해주세요" });
    }
    if (!reason) {
      return res.status(400).json({ error: "조정 사유를 입력해주세요" });
    }
    if (!adjustmentKey) {
      return res.status(400).json({ error: "조정 요청 키가 누락되었습니다" });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const { rows: userRows } = await client.query(
        "select id, email from users where id = $1 for update",
        [userId],
      );
      const user = userRows[0];
      if (!user) {
        await client.query("rollback");
        return res.status(404).json({ error: "User not found" });
      }

      const { rows: balanceRows } = await client.query(
        `select coalesce(sum(remaining_credits), 0)::int as credits
         from credit_grants
         where user_id = $1
           and remaining_credits > 0
           and expires_at > now()`,
        [userId],
      );
      const previousBalanceCredits = Number(balanceRows[0]?.credits || 0);

      if (idempotencyKey) {
        const { rows: existingRows } = await client.query(
          "select balance_after_credits from credit_ledger where idempotency_key = $1 limit 1",
          [idempotencyKey],
        );
        const existing = existingRows[0];
        if (existing) {
          await client.query("commit");
          return res.status(200).json({
            success: true,
            alreadyProcessed: true,
            previousBalanceCredits,
            newBalanceCredits: Number(existing.balance_after_credits ?? previousBalanceCredits),
            amountCredits,
          });
        }
      }

      if (amountCredits < 0 && previousBalanceCredits < Math.abs(amountCredits)) {
        await client.query("rollback");
        return res.status(400).json({ error: "차감할 수 있는 크레딧이 부족합니다" });
      }

      let creditGrantId: string | null = null;
      let productType: string | null = "adjustment";
      const allocations: Array<{
        creditGrantId: string;
        deductedCredits: number;
        remainingCreditsAfter: number;
      }> = [];

      if (amountCredits > 0) {
        const { rows: grantRows } = await client.query(
          `insert into credit_grants (
             user_id, product_type, original_credits, remaining_credits, expires_at, created_at, updated_at
           )
           values ($1, 'adjustment', $2, $2, now() + interval '12 months', now(), now())
           returning id`,
          [userId, amountCredits],
        );
        creditGrantId = grantRows[0]?.id || null;
      } else {
        let remainingToDeduct = Math.abs(amountCredits);
        const { rows: lots } = await client.query(
          `select id, product_type, remaining_credits, expires_at
           from credit_grants
           where user_id = $1
             and remaining_credits > 0
             and expires_at > now()
           order by expires_at asc, id asc
           for update`,
          [userId],
        );

        for (const lot of lots) {
          if (remainingToDeduct <= 0) break;
          const currentRemaining = Number(lot.remaining_credits || 0);
          const deductedCredits = Math.min(currentRemaining, remainingToDeduct);
          const remainingCreditsAfter = currentRemaining - deductedCredits;
          await client.query(
            "update credit_grants set remaining_credits = $1, updated_at = now() where id = $2",
            [remainingCreditsAfter, lot.id],
          );
          allocations.push({ creditGrantId: lot.id, deductedCredits, remainingCreditsAfter });
          remainingToDeduct -= deductedCredits;
          creditGrantId = creditGrantId || lot.id;
          productType = productType === "adjustment" ? lot.product_type : productType;
        }

        if (remainingToDeduct > 0) {
          await client.query("rollback");
          return res.status(400).json({ error: "크레딧 차감에 실패했습니다" });
        }
      }

      const { rows: afterRows } = await client.query(
        `select coalesce(sum(remaining_credits), 0)::int as credits
         from credit_grants
         where user_id = $1
           and remaining_credits > 0
           and expires_at > now()`,
        [userId],
      );
      const newBalanceCredits = Number(afterRows[0]?.credits || 0);

      await client.query(
        `insert into credit_ledger (
           user_id,
           credit_grant_id,
           type,
           amount_credits,
           balance_after_credits,
           product_type,
           idempotency_key,
           description,
           metadata,
           created_at
         )
         values ($1, $2, 'adjustment', $3, $4, $5, $6, $7, $8::jsonb, now())`,
        [
          userId,
          creditGrantId,
          amountCredits,
          newBalanceCredits,
          productType,
          idempotencyKey,
          `관리자 크레딧 조정: ${reason}`,
          JSON.stringify({
            reason,
            adminId: admin.id,
            direction: amountCredits > 0 ? "add" : "subtract",
            adjustmentKey: adjustmentKey || null,
            allocations,
          }),
        ],
      );

      await client.query(
        `insert into admin_logs (admin_id, action, target_type, target_id, details, ip_address, created_at)
         values ($1, 'credit_adjust', 'user', $2, $3::jsonb, $4, now())`,
        [
          admin.id,
          userId,
          JSON.stringify({
            amountCredits,
            reason,
            previousBalanceCredits,
            newBalanceCredits,
            userEmail: user.email,
          }),
          req.ip,
        ],
      );

      await client.query("commit");
      return res.status(200).json({
        success: true,
        previousBalanceCredits,
        newBalanceCredits,
        amountCredits,
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  const [{ rows: userRows }, { rows: grantRows }, { rows: ledgerRows }, { rows: recentLedgerRows }] = await Promise.all([
    pool.query(
      `select id, email, company_name, balance
       from users
       where id = $1
       limit 1`,
      [userId],
    ),
    pool.query(
      `select id, transaction_id, product_type, original_credits, remaining_credits, purchased_at, expires_at
       from credit_grants
       where user_id = $1
       order by expires_at asc, created_at asc`,
      [userId],
    ),
    pool.query(
      `select type, amount_credits, campaign_id
       from credit_ledger
       where user_id = $1`,
      [userId],
    ),
    pool.query(
      `select id, type, amount_credits, balance_after_credits, product_type, description,
              campaign_id, transaction_id, idempotency_key, created_at
       from credit_ledger
       where user_id = $1
       order by created_at desc
       limit 30`,
      [userId],
    ),
  ]);

  const user = userRows[0];
  if (!user) return res.status(404).json({ error: "User not found" });

  const now = new Date();
  const lots = grantRows.map(mapCreditGrant);
  const activeLots = lots.filter((lot: any) => Number(lot.remainingCredits) > 0 && new Date(lot.expiresAt) > now);
  const availableCredits = activeLots.reduce((sum: number, lot: any) => sum + Number(lot.remainingCredits || 0), 0);
  const totalGrantedCredits = lots.reduce((sum: number, lot: any) => sum + Number(lot.originalCredits || 0), 0);
  const totalUsedCredits = ledgerRows
    .filter((row: any) => row.type === "use")
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_credits || 0)), 0);
  const totalRefundCredits = ledgerRows
    .filter((row: any) => row.type === "refund")
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_credits || 0)), 0);
  const terminalCampaignIds = new Set(
    ledgerRows
      .filter((row: any) => row.type === "use" || row.type === "release")
      .map((row: any) => row.campaign_id)
      .filter(Boolean),
  );
  const reservedCredits = ledgerRows
    .filter((row: any) => row.type === "reserve" && row.campaign_id && !terminalCampaignIds.has(row.campaign_id))
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount_credits || 0)), 0);

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      companyName: user.company_name,
      legacyBalance: Number(user.balance || 0),
    },
    summary: {
      enabled: process.env.CREDIT_MODE_ENABLED === "true",
      hasLedger: lots.length > 0 || recentLedgerRows.length > 0,
      availableCredits,
      reservedCredits,
      totalGrantedCredits,
      totalUsedCredits,
      totalRefundCredits,
      activeLotCount: activeLots.length,
    },
    lots,
    recentLedger: recentLedgerRows.map(mapCreditLedger),
  });
}

async function handleLocalSeedCreditDemo(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const client = await pool.connect();
  const userId = "local-credit-demo-user";
  const txId = "local-credit-demo-tx-enterprise";
  const grantId = "local-credit-demo-grant-enterprise";
  const ledgerGrantId = "local-credit-demo-ledger-grant";
  const ledgerUseId = "local-credit-demo-ledger-use";
  const ledgerRefundId = "local-credit-demo-ledger-refund";

  try {
    await client.query("begin");

    await client.query(
      `insert into users (
         id, email, first_name, last_name, company_name, business_number, representative_name,
         phone, balance, is_verified, is_master, is_agency, created_at, updated_at
       )
       values (
         $1, 'credit-demo@wepick.co.kr', 'Credit', 'Demo', '위픽 크레딧 데모', '123-45-67890', '크레딧 데모',
         '010-0000-0000', '1000000', true, false, false, now(), now()
       )
       on conflict (id) do update set
         email = excluded.email,
         company_name = excluded.company_name,
         balance = excluded.balance,
         is_verified = true,
         updated_at = now()`,
      [userId],
    );

    await client.query(
      `insert into transactions (
         id, user_id, type, amount, balance_after, description, payment_method, stripe_session_id, created_at
       )
       values (
         $1, $2, 'charge', '1000000', '1000000', '로컬 크레딧 데모 충전', 'local_seed', 'local-credit-demo-enterprise', now()
       )
       on conflict (id) do update set
         amount = excluded.amount,
         balance_after = excluded.balance_after,
         description = excluded.description`,
      [txId, userId],
    );

    await client.query(
      `insert into credit_grants (
         id, user_id, transaction_id, product_type, original_credits, remaining_credits,
         purchased_at, expires_at, created_at, updated_at
       )
       values (
         $1, $2, $3, 'enterprise', 16000, 13840, now(), now() + interval '12 months', now(), now()
       )
       on conflict (id) do update set
         remaining_credits = excluded.remaining_credits,
         expires_at = excluded.expires_at,
         updated_at = now()`,
      [grantId, userId, txId],
    );

    await client.query(
      `insert into credit_ledger (
         id, user_id, credit_grant_id, transaction_id, type, amount_credits, balance_after_credits,
         product_type, idempotency_key, description, metadata, created_at
       )
       values
         ($1, $4, $5, $6, 'grant', 16000, 16000, 'enterprise', 'local-demo:grant', '엔터프라이즈 패키지 크레딧 지급', '{"source":"local-demo"}'::jsonb, now() - interval '2 day'),
         ($2, $4, $5, null, 'use', -2000, 14000, 'enterprise', 'local-demo:use', '캠페인 발송: 로컬 데모 캠페인', '{"targetCount":1000}'::jsonb, now() - interval '1 day'),
         ($3, $4, $5, null, 'refund', -160, 13840, 'enterprise', 'local-demo:refund', '환불 완료 (로컬 데모)', '{"refundAmount":10000,"totalRefundedCredits":160}'::jsonb, now())
       on conflict (id) do update set
         amount_credits = excluded.amount_credits,
         balance_after_credits = excluded.balance_after_credits,
         description = excluded.description,
         metadata = excluded.metadata,
         created_at = excluded.created_at`,
      [ledgerGrantId, ledgerUseId, ledgerRefundId, userId, grantId, txId],
    );

    const { rows } = await client.query(
      `select
         u.id,
         u.email,
         u.company_name as "companyName",
         coalesce((
           select sum(cg.remaining_credits)::int
           from credit_grants cg
           where cg.user_id = u.id
             and cg.remaining_credits > 0
             and cg.expires_at > now()
         ), 0) as "availableCredits",
         coalesce((
           select count(*)::int
           from credit_ledger cl
           where cl.user_id = u.id
         ), 0) as "ledgerCount"
       from users u
       where u.id = $1
       group by u.id`,
      [userId],
    );

    await client.query("commit");
    return res.status(200).json({ success: true, user: rows[0] });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function handleLocalSeedRecommendedTemplates(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const templateId = "local-recommended-commerce-review";
  const sourceTemplateId = "local-approved-template-commerce-review";
  const localUserId = "local-92063146aaba48a8d4ea5ee0";

  await pool.query(
    `insert into templates (
       id,
       user_id,
       name,
       message_type,
       rcs_type,
       title,
       lms_title,
       content,
       lms_content,
       url_links,
       buttons,
       status,
       submitted_at,
       reviewed_at,
       created_at,
       updated_at
     )
     values (
       $1,
       $2,
       '리뷰 이벤트 참여 유도',
       'RCS',
       4,
       '리뷰 이벤트 안내',
       '리뷰 이벤트 안내',
       '{{brandName}}에서 구매하신 고객님께 리뷰 이벤트를 안내드려요. 리뷰 작성 후 {{benefit}} 혜택을 받아보세요.',
       '{{brandName}} 리뷰 이벤트 안내. 리뷰 작성 후 {{benefit}} 혜택을 받아보세요.',
       $3::jsonb,
       $4::jsonb,
       'approved',
       now(),
       now(),
       now(),
       now()
     )
     on conflict (id) do update set
       user_id = excluded.user_id,
       name = excluded.name,
       message_type = excluded.message_type,
       rcs_type = excluded.rcs_type,
       title = excluded.title,
       lms_title = excluded.lms_title,
       content = excluded.content,
       lms_content = excluded.lms_content,
       url_links = excluded.url_links,
       buttons = excluded.buttons,
       status = 'approved',
       reviewed_at = now(),
       updated_at = now()`,
    [
      sourceTemplateId,
      localUserId,
      JSON.stringify({ list: ["https://wepick.kr"], reward: 0 }),
      JSON.stringify({ list: [{ type: "0", name: "리뷰 쓰기", val1: "https://wepick.kr" }] }),
    ],
  );

  const { rows } = await pool.query(
    `insert into recommended_templates (
       id,
       name,
       category,
       purpose,
       version,
       title_template,
       lms_title_template,
       content_template,
       lms_content_template,
       variable_schema,
       message_type,
       rcs_type,
       url_links,
       buttons,
       is_active,
       sort_order,
       source_template_id,
       targeting_config,
       created_at,
       updated_at
     )
     values (
       $1,
       '리뷰 이벤트 참여 유도',
       'commerce',
       'review_event',
       'local-v1',
       '리뷰 이벤트 안내',
       '리뷰 이벤트 안내',
       '{{brandName}}에서 구매하신 고객님께 리뷰 이벤트를 안내드려요. 리뷰 작성 후 {{benefit}} 혜택을 받아보세요.',
       '{{brandName}} 리뷰 이벤트 안내. 리뷰 작성 후 {{benefit}} 혜택을 받아보세요.',
       $2::jsonb,
       'RCS',
       4,
       $3::jsonb,
       $4::jsonb,
       true,
       1,
       $5,
       $6::jsonb,
       now(),
       now()
     )
     on conflict (id) do update set
       name = excluded.name,
       category = excluded.category,
       purpose = excluded.purpose,
       version = excluded.version,
       title_template = excluded.title_template,
       lms_title_template = excluded.lms_title_template,
       content_template = excluded.content_template,
       lms_content_template = excluded.lms_content_template,
       variable_schema = excluded.variable_schema,
       message_type = excluded.message_type,
       rcs_type = excluded.rcs_type,
       url_links = excluded.url_links,
       buttons = excluded.buttons,
       is_active = true,
       sort_order = excluded.sort_order,
       source_template_id = excluded.source_template_id,
       targeting_config = excluded.targeting_config,
       updated_at = now()
     returning *`,
    [
      templateId,
      JSON.stringify([
        { key: "brandName", label: "브랜드명", type: "text", required: true, placeholder: "위픽스토어" },
        { key: "benefit", label: "혜택", type: "text", required: true, placeholder: "3,000원 쿠폰" },
      ]),
      JSON.stringify({ list: ["https://wepick.kr"], reward: 0 }),
      JSON.stringify({ list: [{ type: "0", name: "리뷰 쓰기", val1: "https://wepick.kr" }] }),
      sourceTemplateId,
      JSON.stringify({
        mode: "ats-general",
        targetGender: "all",
        targetAgeStart: 25,
        targetAgeEnd: 49,
      }),
    ],
  );

  return res.status(200).json({
    success: true,
    template: mapTemplate(rows[0]),
  });
}

async function handleLocalVerifyCampaignCreditFlow(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const userId = "local-credit-demo-user";
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scheduledCampaignId = `local-credit-flow-reserve-${runId}`;
  const directCampaignId = `local-credit-flow-direct-${runId}`;
  const partialCampaignId = `local-credit-flow-partial-${runId}`;
  const targetCount = 1000;
  const neededCredits = 2000;
  const partialTargetCount = 3000;
  const partialNeededCredits = 6000;
  const partialChargeableCount = 2000;
  const partialRestoreCredits = 2000;
  const partialRemainingCleanupCredits = partialNeededCredits - partialRestoreCredits;
  const now = new Date();
  const scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  async function getAvailableCredits() {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function getCampaignLedger(campaignId: string) {
    const { rows } = await pool.query(
      `select type, amount_credits as "amountCredits", balance_after_credits as "balanceAfterCredits",
              idempotency_key as "idempotencyKey", description
       from credit_ledger
       where campaign_id = $1
       order by created_at asc`,
      [campaignId],
    );
    return rows.map((row: any) => ({
      ...row,
      amountCredits: Number(row.amountCredits || 0),
      balanceAfterCredits: row.balanceAfterCredits == null ? null : Number(row.balanceAfterCredits),
    }));
  }

  async function insertApprovedCampaign(input: {
    id: string;
    name: string;
    targetCount?: number;
    scheduledAt?: Date | null;
  }) {
    await pool.query(
      `insert into campaigns (
         id, user_id, name, status_code, status, message_type,
         target_count, budget, cost_per_message, scheduled_at, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, 'RCS', $6, '100000', '100', $7, now(), now())`,
      [
        input.id,
        userId,
        input.name,
        CAMPAIGN_STATUS.APPROVED.code,
        CAMPAIGN_STATUS.APPROVED.status,
        input.targetCount ?? targetCount,
        input.scheduledAt ?? null,
      ],
    );
  }

  const { rows: userRows } = await pool.query("select id from users where id = $1 limit 1", [userId]);
  if (!userRows[0]) {
    return res.status(400).json({
      error: "로컬 크레딧 데모 계정이 없습니다. 먼저 /api/local/seed-credit-demo를 실행해주세요.",
    });
  }

  const initialCredits = await getAvailableCredits();
  if (initialCredits < Math.max(neededCredits, partialNeededCredits)) {
    return res.status(400).json({
      error: `검증에 필요한 크레딧이 부족합니다. 최소 ${Math.max(neededCredits, partialNeededCredits).toLocaleString("ko-KR")}C가 필요합니다.`,
      initialCredits,
    });
  }

  await insertApprovedCampaign({
    id: scheduledCampaignId,
    name: "로컬 크레딧 예약-취소 검증",
    scheduledAt,
  });

  const reserveResult = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: scheduledCampaignId,
    neededCredits,
    description: "로컬 검증: 캠페인 예약",
  });
  const afterReserveCredits = await getAvailableCredits();

  const releaseResult = await storage.releaseCampaignReservedCreditsAtomically({
    userId,
    campaignId: scheduledCampaignId,
    description: "로컬 검증: 캠페인 예약 취소",
  });
  const afterReleaseCredits = await getAvailableCredits();

  await insertApprovedCampaign({
    id: directCampaignId,
    name: "로컬 크레딧 발송-복구 검증",
  });

  const startResult = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: directCampaignId,
    neededCredits,
    sentCount: targetCount,
    successCount: 950,
    description: "로컬 검증: 캠페인 발송",
  });
  const afterStartCredits = await getAvailableCredits();

  const restoreResult = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: directCampaignId,
    reason: "internal_failure",
    description: "로컬 검증: 내부 실패 복구",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const finalCredits = await getAvailableCredits();

  await insertApprovedCampaign({
    id: partialCampaignId,
    name: "로컬 크레딧 잔여분 복구 검증",
    targetCount: partialTargetCount,
  });

  const partialStartResult = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: partialCampaignId,
    neededCredits: partialNeededCredits,
    sentCount: partialTargetCount,
    successCount: partialChargeableCount,
    description: "로컬 검증: 부분 발송 크레딧 사용",
  });
  const afterPartialStartCredits = await getAvailableCredits();

  const partialRestoreResult = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: partialCampaignId,
    reason: "partial_delivery_failure",
    description: "로컬 검증: 잔여 발송분 복구",
    restoreCredits: partialRestoreCredits,
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const afterPartialRestoreCredits = await getAvailableCredits();

  const partialCleanupRestoreResult = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: partialCampaignId,
    reason: "internal_failure",
    description: "로컬 검증: 잔여분 복구 후 과복구 방지 정리",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const afterPartialCleanupCredits = await getAvailableCredits();

  const scheduledLedger = await getCampaignLedger(scheduledCampaignId);
  const directLedger = await getCampaignLedger(directCampaignId);
  const partialLedger = await getCampaignLedger(partialCampaignId);
  const passed =
    reserveResult.success &&
    releaseResult.success &&
    startResult.success &&
    restoreResult.success &&
    afterReserveCredits === initialCredits - neededCredits &&
    afterReleaseCredits === initialCredits &&
    afterStartCredits === initialCredits - neededCredits &&
    finalCredits === initialCredits &&
    partialStartResult.success &&
    partialRestoreResult.success &&
    partialCleanupRestoreResult.success &&
    afterPartialStartCredits === initialCredits - partialNeededCredits &&
    afterPartialRestoreCredits === initialCredits - partialNeededCredits + partialRestoreCredits &&
    afterPartialCleanupCredits === initialCredits &&
    scheduledLedger.some((entry: any) => entry.type === "reserve" && entry.amountCredits === -neededCredits) &&
    scheduledLedger.some((entry: any) => entry.type === "release" && entry.amountCredits === neededCredits) &&
    directLedger.some((entry: any) => entry.type === "use" && entry.amountCredits === -neededCredits) &&
    directLedger.some((entry: any) => entry.type === "adjustment" && entry.amountCredits === neededCredits) &&
    partialLedger.some((entry: any) => entry.type === "use" && entry.amountCredits === -partialNeededCredits) &&
    partialLedger.some((entry: any) => entry.type === "adjustment" && entry.amountCredits === partialRestoreCredits) &&
    partialLedger.some((entry: any) => entry.type === "adjustment" && entry.amountCredits === partialRemainingCleanupCredits);

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    targetCount,
    neededCredits,
    balances: {
      initialCredits,
      afterReserveCredits,
      afterReleaseCredits,
      afterStartCredits,
      finalCredits,
      afterPartialStartCredits,
      afterPartialRestoreCredits,
      afterPartialCleanupCredits,
    },
    scheduledScenario: {
      campaignId: scheduledCampaignId,
      reserve: {
        success: reserveResult.success,
        alreadyProcessed: reserveResult.alreadyProcessed,
        balanceAfterCredits: reserveResult.balanceAfterCredits,
        error: reserveResult.error,
      },
      release: {
        success: releaseResult.success,
        alreadyProcessed: releaseResult.alreadyProcessed,
        balanceAfterCredits: releaseResult.balanceAfterCredits,
        error: releaseResult.error,
      },
      ledger: scheduledLedger,
    },
    directScenario: {
      campaignId: directCampaignId,
      start: {
        success: startResult.success,
        alreadyProcessed: startResult.alreadyProcessed,
        balanceAfterCredits: startResult.balanceAfterCredits,
        error: startResult.error,
      },
      restore: {
        success: restoreResult.success,
        alreadyProcessed: restoreResult.alreadyProcessed,
        restoredCredits: restoreResult.restoredCredits,
        balanceAfterCredits: restoreResult.balanceAfterCredits,
        error: restoreResult.error,
      },
      ledger: directLedger,
    },
    partialScenario: {
      campaignId: partialCampaignId,
      targetCount: partialTargetCount,
      chargeableCount: partialChargeableCount,
      neededCredits: partialNeededCredits,
      partialRestoreCredits,
      cleanupRestoreCredits: partialRemainingCleanupCredits,
      start: {
        success: partialStartResult.success,
        alreadyProcessed: partialStartResult.alreadyProcessed,
        balanceAfterCredits: partialStartResult.balanceAfterCredits,
        error: partialStartResult.error,
      },
      partialRestore: {
        success: partialRestoreResult.success,
        alreadyProcessed: partialRestoreResult.alreadyProcessed,
        restoredCredits: partialRestoreResult.restoredCredits,
        balanceAfterCredits: partialRestoreResult.balanceAfterCredits,
        error: partialRestoreResult.error,
      },
      cleanupRestore: {
        success: partialCleanupRestoreResult.success,
        alreadyProcessed: partialCleanupRestoreResult.alreadyProcessed,
        restoredCredits: partialCleanupRestoreResult.restoredCredits,
        balanceAfterCredits: partialCleanupRestoreResult.balanceAfterCredits,
        error: partialCleanupRestoreResult.error,
      },
      ledger: partialLedger,
    },
  });
}

async function handleLocalVerifyCampaignCreditIdempotency(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const userId = "local-credit-demo-user";
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scheduledCampaignId = `local-credit-idem-reserve-${runId}`;
  const directCampaignId = `local-credit-idem-direct-${runId}`;
  const targetCount = 1000;
  const neededCredits = 2000;
  const now = new Date();
  const scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  async function getAvailableCredits() {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function insertApprovedCampaign(input: {
    id: string;
    name: string;
    scheduledAt?: Date | null;
  }) {
    await pool.query(
      `insert into campaigns (
         id, user_id, name, status_code, status, message_type,
         target_count, budget, cost_per_message, scheduled_at, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, 'RCS', $6, '100000', '100', $7, now(), now())`,
      [
        input.id,
        userId,
        input.name,
        CAMPAIGN_STATUS.APPROVED.code,
        CAMPAIGN_STATUS.APPROVED.status,
        targetCount,
        input.scheduledAt ?? null,
      ],
    );
  }

  async function getLedgerCounts(campaignId: string) {
    const { rows } = await pool.query(
      `select type, count(*)::int as count, coalesce(sum(amount_credits), 0)::int as "amountCredits"
       from credit_ledger
       where campaign_id = $1
       group by type
       order by type`,
      [campaignId],
    );
    return rows.reduce((acc: Record<string, { count: number; amountCredits: number }>, row: any) => {
      acc[row.type] = {
        count: Number(row.count || 0),
        amountCredits: Number(row.amountCredits || 0),
      };
      return acc;
    }, {});
  }

  const { rows: userRows } = await pool.query("select id from users where id = $1 limit 1", [userId]);
  if (!userRows[0]) {
    return res.status(400).json({
      error: "로컬 크레딧 데모 계정이 없습니다. 먼저 /api/local/seed-credit-demo를 실행해주세요.",
    });
  }

  const initialCredits = await getAvailableCredits();
  if (initialCredits < neededCredits) {
    return res.status(400).json({
      error: `검증에 필요한 크레딧이 부족합니다. 최소 ${neededCredits.toLocaleString("ko-KR")}C가 필요합니다.`,
      initialCredits,
    });
  }

  await insertApprovedCampaign({
    id: scheduledCampaignId,
    name: "로컬 크레딧 예약 중복 검증",
    scheduledAt,
  });

  const reserveFirst = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: scheduledCampaignId,
    neededCredits,
    description: "로컬 중복 검증: 캠페인 예약",
  });
  const afterReserveFirstCredits = await getAvailableCredits();

  const reserveSecond = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: scheduledCampaignId,
    neededCredits,
    description: "로컬 중복 검증: 캠페인 예약 재시도",
  });
  const afterReserveSecondCredits = await getAvailableCredits();

  const releaseFirst = await storage.releaseCampaignReservedCreditsAtomically({
    userId,
    campaignId: scheduledCampaignId,
    description: "로컬 중복 검증: 캠페인 예약 취소",
  });
  const afterReleaseFirstCredits = await getAvailableCredits();

  const releaseSecond = await storage.releaseCampaignReservedCreditsAtomically({
    userId,
    campaignId: scheduledCampaignId,
    description: "로컬 중복 검증: 캠페인 예약 취소 재시도",
  });
  const afterReleaseSecondCredits = await getAvailableCredits();

  await insertApprovedCampaign({
    id: directCampaignId,
    name: "로컬 크레딧 발송 중복 검증",
  });

  const startFirst = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: directCampaignId,
    neededCredits,
    sentCount: targetCount,
    successCount: 950,
    description: "로컬 중복 검증: 캠페인 발송",
  });
  const afterStartFirstCredits = await getAvailableCredits();

  const startSecond = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: directCampaignId,
    neededCredits,
    sentCount: targetCount,
    successCount: 950,
    description: "로컬 중복 검증: 캠페인 발송 재시도",
  });
  const afterStartSecondCredits = await getAvailableCredits();

  const restoreFirst = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: directCampaignId,
    reason: "internal_failure",
    description: "로컬 중복 검증: 내부 실패 복구",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const afterRestoreFirstCredits = await getAvailableCredits();

  const restoreSecond = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: directCampaignId,
    reason: "internal_failure",
    description: "로컬 중복 검증: 내부 실패 복구 재시도",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const afterRestoreSecondCredits = await getAvailableCredits();

  const scheduledLedgerCounts = await getLedgerCounts(scheduledCampaignId);
  const directLedgerCounts = await getLedgerCounts(directCampaignId);
  const passed =
    reserveFirst.success &&
    reserveSecond.success &&
    releaseFirst.success &&
    releaseSecond.success &&
    startFirst.success &&
    startSecond.success &&
    restoreFirst.success &&
    restoreSecond.success &&
    afterReserveFirstCredits === initialCredits - neededCredits &&
    afterReserveSecondCredits === afterReserveFirstCredits &&
    afterReleaseFirstCredits === initialCredits &&
    afterReleaseSecondCredits === initialCredits &&
    afterStartFirstCredits === initialCredits - neededCredits &&
    afterStartSecondCredits === afterStartFirstCredits &&
    afterRestoreFirstCredits === initialCredits &&
    afterRestoreSecondCredits === initialCredits &&
    scheduledLedgerCounts.reserve?.count === 1 &&
    scheduledLedgerCounts.reserve?.amountCredits === -neededCredits &&
    scheduledLedgerCounts.release?.count === 1 &&
    scheduledLedgerCounts.release?.amountCredits === neededCredits &&
    directLedgerCounts.use?.count === 1 &&
    directLedgerCounts.use?.amountCredits === -neededCredits &&
    directLedgerCounts.adjustment?.count === 1 &&
    directLedgerCounts.adjustment?.amountCredits === neededCredits;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    targetCount,
    neededCredits,
    balances: {
      initialCredits,
      afterReserveFirstCredits,
      afterReserveSecondCredits,
      afterReleaseFirstCredits,
      afterReleaseSecondCredits,
      afterStartFirstCredits,
      afterStartSecondCredits,
      afterRestoreFirstCredits,
      afterRestoreSecondCredits,
    },
    scheduledScenario: {
      campaignId: scheduledCampaignId,
      reserveFirst: {
        success: reserveFirst.success,
        alreadyProcessed: reserveFirst.alreadyProcessed,
        balanceAfterCredits: reserveFirst.balanceAfterCredits,
        error: reserveFirst.error,
      },
      reserveSecond: {
        success: reserveSecond.success,
        alreadyProcessed: reserveSecond.alreadyProcessed,
        balanceAfterCredits: reserveSecond.balanceAfterCredits,
        error: reserveSecond.error,
      },
      releaseFirst: {
        success: releaseFirst.success,
        alreadyProcessed: releaseFirst.alreadyProcessed,
        balanceAfterCredits: releaseFirst.balanceAfterCredits,
        error: releaseFirst.error,
      },
      releaseSecond: {
        success: releaseSecond.success,
        alreadyProcessed: releaseSecond.alreadyProcessed,
        balanceAfterCredits: releaseSecond.balanceAfterCredits,
        error: releaseSecond.error,
      },
      ledgerCounts: scheduledLedgerCounts,
    },
    directScenario: {
      campaignId: directCampaignId,
      startFirst: {
        success: startFirst.success,
        alreadyProcessed: startFirst.alreadyProcessed,
        balanceAfterCredits: startFirst.balanceAfterCredits,
        error: startFirst.error,
      },
      startSecond: {
        success: startSecond.success,
        alreadyProcessed: startSecond.alreadyProcessed,
        balanceAfterCredits: startSecond.balanceAfterCredits,
        error: startSecond.error,
      },
      restoreFirst: {
        success: restoreFirst.success,
        alreadyProcessed: restoreFirst.alreadyProcessed,
        restoredCredits: restoreFirst.restoredCredits,
        balanceAfterCredits: restoreFirst.balanceAfterCredits,
        error: restoreFirst.error,
      },
      restoreSecond: {
        success: restoreSecond.success,
        alreadyProcessed: restoreSecond.alreadyProcessed,
        restoredCredits: restoreSecond.restoredCredits,
        balanceAfterCredits: restoreSecond.balanceAfterCredits,
        error: restoreSecond.error,
      },
      ledgerCounts: directLedgerCounts,
    },
  });
}

async function handleLocalVerifyBizChatCallbackCredit(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const userId = "local-credit-demo-user";
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const releaseCampaignId = `local-callback-release-${runId}`;
  const noCountCampaignId = `local-callback-no-count-${runId}`;
  const partialCampaignId = `local-callback-partial-${runId}`;
  const releaseBizchatId = `BZ-CALLBACK-RELEASE-${runId}`;
  const noCountBizchatId = `BZ-CALLBACK-NOCOUNT-${runId}`;
  const partialBizchatId = `BZ-CALLBACK-PARTIAL-${runId}`;
  const releaseTargetCount = 1000;
  const partialTargetCount = 3000;
  const neededCredits = calculateCampaignCredits({ targetCount: releaseTargetCount }).neededCredits;
  const partialNeededCredits = calculateCampaignCredits({ targetCount: partialTargetCount }).neededCredits;
  const partialChargeableCount = 2000;
  const partialRestoreCredits = calculateCampaignCredits({
    targetCount: partialTargetCount - partialChargeableCount,
  }).neededCredits;

  async function getAvailableCredits() {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function getCampaignLedger(campaignId: string) {
    const { rows } = await pool.query(
      `select type, amount_credits as "amountCredits", balance_after_credits as "balanceAfterCredits",
              idempotency_key as "idempotencyKey", description
       from credit_ledger
       where campaign_id = $1
       order by created_at asc`,
      [campaignId],
    );
    return rows.map((row: any) => ({
      ...row,
      amountCredits: Number(row.amountCredits || 0),
      balanceAfterCredits: row.balanceAfterCredits == null ? null : Number(row.balanceAfterCredits),
    }));
  }

  async function insertApprovedCampaign(input: {
    id: string;
    bizchatCampaignId: string;
    name: string;
    targetCount: number;
  }) {
    await pool.query(
      `insert into campaigns (
         id, user_id, name, bizchat_campaign_id, status_code, status, message_type,
         target_count, budget, cost_per_message, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, 'RCS', $7, '100000', '100', now(), now())`,
      [
        input.id,
        userId,
        input.name,
        input.bizchatCampaignId,
        CAMPAIGN_STATUS.APPROVED.code,
        CAMPAIGN_STATUS.APPROVED.status,
        input.targetCount,
      ],
    );
  }

  async function applyCallback(input: {
    campaignId: string;
    bizchatCampaignId: string;
    campaignName: string;
    payload: Record<string, any>;
    targetCount: number;
  }) {
    const observedCounts = readBizChatCallbackCounts(input.payload);
    const creditPlan = getBizChatCallbackCreditPlan({
      state: Number(input.payload.state),
      targetCount: input.targetCount,
      observedCounts,
    });

    const updateData: Record<string, any> = {
      status_code: input.payload.state,
      status:
        input.payload.state === CAMPAIGN_STATUS.CANCELLED.code
          ? CAMPAIGN_STATUS.CANCELLED.status
          : input.payload.state === CAMPAIGN_STATUS.STOPPED.code
            ? CAMPAIGN_STATUS.STOPPED.status
            : input.payload.state === CAMPAIGN_STATUS.COMPLETED.code
              ? CAMPAIGN_STATUS.COMPLETED.status
              : "unknown",
      updated_at: new Date(),
    };

    if (observedCounts.sendCnt !== undefined) updateData.sent_count = observedCounts.sendCnt;
    if (observedCounts.successCnt !== undefined) updateData.success_count = observedCounts.successCnt;
    if (observedCounts.settleCnt !== undefined) updateData.settle_cnt = observedCounts.settleCnt;

    await pool.query(
      `update campaigns
       set status_code = $1,
           status = $2,
           sent_count = coalesce($3, sent_count),
           success_count = coalesce($4, success_count),
           settle_cnt = coalesce($5, settle_cnt),
           updated_at = now()
       where id = $6`,
      [
        updateData.status_code,
        updateData.status,
        observedCounts.sendCnt ?? null,
        observedCounts.successCnt ?? null,
        observedCounts.settleCnt ?? null,
        input.campaignId,
      ],
    );

    let creditAction: Record<string, any> = { type: "none" };
    if (creditPlan.type === "release") {
      const releaseResult = await storage.releaseCampaignReservedCreditsAtomically({
        userId,
        campaignId: input.campaignId,
        description: `로컬 콜백 검증: BizChat ${input.payload.state} 예약 해제`,
      });
      const releasedCredits = Number(releaseResult.ledgerEntry?.amountCredits || 0);
      creditAction = {
        type: releaseResult.alreadyProcessed
          ? "release_already_processed"
          : releaseResult.success && releasedCredits > 0
            ? "release"
            : "release_noop",
        releasedCredits,
        alreadyProcessed: releaseResult.alreadyProcessed,
        balanceAfterCredits: releaseResult.balanceAfterCredits,
        error: releaseResult.error,
      };
    } else if (creditPlan.type === "restore") {
      const restoreResult = await storage.restoreCampaignUsedCreditsAtomically({
        userId,
        campaignId: input.campaignId,
        reason: creditPlan.reason,
        description:
          creditPlan.chargeableCount === 0
            ? `SKT 접수 실패 복구: ${input.campaignName}`
            : `잔여 발송분 복구: ${input.campaignName}`,
        restoreCredits: creditPlan.restoreCredits,
        statusCode: input.payload.state,
        status: updateData.status,
      });
      creditAction = {
        type: restoreResult.alreadyProcessed ? "restore_already_processed" : "restore",
        reason: creditPlan.reason,
        targetCount: creditPlan.targetCount,
        chargeableCount: creditPlan.chargeableCount,
        restoreCredits: creditPlan.restoreCredits,
        restoredCredits: restoreResult.restoredCredits,
        alreadyProcessed: restoreResult.alreadyProcessed,
        balanceAfterCredits: restoreResult.balanceAfterCredits,
        error: restoreResult.error,
      };
    } else {
      creditAction = creditPlan;
    }

    return {
      payload: input.payload,
      observedCounts,
      creditPlan,
      creditAction,
    };
  }

  const { rows: userRows } = await pool.query("select id from users where id = $1 limit 1", [userId]);
  if (!userRows[0]) {
    return res.status(400).json({
      error: "로컬 크레딧 데모 계정이 없습니다. 먼저 /api/local/seed-credit-demo를 실행해주세요.",
    });
  }

  const initialCredits = await getAvailableCredits();
  if (initialCredits < partialNeededCredits) {
    return res.status(400).json({
      error: `검증에 필요한 크레딧이 부족합니다. 최소 ${partialNeededCredits.toLocaleString("ko-KR")}C가 필요합니다.`,
      initialCredits,
    });
  }

  await insertApprovedCampaign({
    id: releaseCampaignId,
    bizchatCampaignId: releaseBizchatId,
    name: "로컬 BizChat 콜백 예약 해제 검증",
    targetCount: releaseTargetCount,
  });
  const releaseReserve = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: releaseCampaignId,
    neededCredits,
    description: "로컬 콜백 검증: 승인요청 예약",
  });
  const afterReleaseReserveCredits = await getAvailableCredits();
  const releaseCallback = await applyCallback({
    campaignId: releaseCampaignId,
    bizchatCampaignId: releaseBizchatId,
    campaignName: "로컬 BizChat 콜백 예약 해제 검증",
    targetCount: releaseTargetCount,
    payload: { id: releaseBizchatId, state: CAMPAIGN_STATUS.CANCELLED.code, stateReason: "local cancelled" },
  });
  const afterReleaseCallbackCredits = await getAvailableCredits();
  const releaseCallbackRetry = await applyCallback({
    campaignId: releaseCampaignId,
    bizchatCampaignId: releaseBizchatId,
    campaignName: "로컬 BizChat 콜백 예약 해제 검증",
    targetCount: releaseTargetCount,
    payload: { id: releaseBizchatId, state: CAMPAIGN_STATUS.CANCELLED.code, stateReason: "local cancelled retry" },
  });
  const afterReleaseCallbackRetryCredits = await getAvailableCredits();

  await insertApprovedCampaign({
    id: noCountCampaignId,
    bizchatCampaignId: noCountBizchatId,
    name: "로컬 BizChat 콜백 count 없음 검증",
    targetCount: releaseTargetCount,
  });
  const noCountStart = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: noCountCampaignId,
    neededCredits,
    sentCount: releaseTargetCount,
    successCount: releaseTargetCount,
    description: "로컬 콜백 검증: count 없음 발송 사용",
  });
  const afterNoCountStartCredits = await getAvailableCredits();
  const noCountCallback = await applyCallback({
    campaignId: noCountCampaignId,
    bizchatCampaignId: noCountBizchatId,
    campaignName: "로컬 BizChat 콜백 count 없음 검증",
    targetCount: releaseTargetCount,
    payload: { id: noCountBizchatId, state: CAMPAIGN_STATUS.COMPLETED.code },
  });
  const afterNoCountCallbackCredits = await getAvailableCredits();
  const noCountCallbackRetry = await applyCallback({
    campaignId: noCountCampaignId,
    bizchatCampaignId: noCountBizchatId,
    campaignName: "로컬 BizChat 콜백 count 없음 검증",
    targetCount: releaseTargetCount,
    payload: { id: noCountBizchatId, state: CAMPAIGN_STATUS.COMPLETED.code },
  });
  const afterNoCountCallbackRetryCredits = await getAvailableCredits();
  const noCountCleanup = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: noCountCampaignId,
    reason: "internal_failure",
    description: "로컬 콜백 검증: count 없음 시나리오 정리 복구",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const afterNoCountCleanupCredits = await getAvailableCredits();

  await insertApprovedCampaign({
    id: partialCampaignId,
    bizchatCampaignId: partialBizchatId,
    name: "로컬 BizChat 콜백 잔여분 복구 검증",
    targetCount: partialTargetCount,
  });
  const partialStart = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: partialCampaignId,
    neededCredits: partialNeededCredits,
    sentCount: partialTargetCount,
    successCount: partialTargetCount,
    description: "로컬 콜백 검증: 부분 발송 사용",
  });
  const afterPartialStartCredits = await getAvailableCredits();
  const partialCallback = await applyCallback({
    campaignId: partialCampaignId,
    bizchatCampaignId: partialBizchatId,
    campaignName: "로컬 BizChat 콜백 잔여분 복구 검증",
    targetCount: partialTargetCount,
    payload: {
      id: partialBizchatId,
      state: CAMPAIGN_STATUS.COMPLETED.code,
      data: { successCount: partialChargeableCount },
    },
  });
  const afterPartialCallbackCredits = await getAvailableCredits();
  const partialCallbackRetry = await applyCallback({
    campaignId: partialCampaignId,
    bizchatCampaignId: partialBizchatId,
    campaignName: "로컬 BizChat 콜백 잔여분 복구 검증",
    targetCount: partialTargetCount,
    payload: {
      id: partialBizchatId,
      state: CAMPAIGN_STATUS.COMPLETED.code,
      data: { successCount: partialChargeableCount },
    },
  });
  const afterPartialCallbackRetryCredits = await getAvailableCredits();
  const partialCleanup = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: partialCampaignId,
    reason: "internal_failure",
    description: "로컬 콜백 검증: 잔여분 복구 후 정리",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const afterPartialCleanupCredits = await getAvailableCredits();

  const releaseLedger = await getCampaignLedger(releaseCampaignId);
  const noCountLedger = await getCampaignLedger(noCountCampaignId);
  const partialLedger = await getCampaignLedger(partialCampaignId);
  const releaseLedgerCount = releaseLedger.filter((entry: any) => entry.type === "release").length;
  const partialRestoreLedgerCount = partialLedger.filter(
    (entry: any) =>
      entry.type === "adjustment" &&
      String(entry.idempotencyKey || "").endsWith(":partial_delivery_failure"),
  ).length;

  const passed =
    releaseReserve.success &&
    releaseCallback.creditAction.type === "release" &&
    releaseCallbackRetry.creditAction.type === "release_already_processed" &&
    afterReleaseReserveCredits === initialCredits - neededCredits &&
    afterReleaseCallbackCredits === initialCredits &&
    afterReleaseCallbackRetryCredits === initialCredits &&
    releaseLedgerCount === 1 &&
    noCountStart.success &&
    noCountCallback.creditAction.type === "restore_skipped_no_count" &&
    noCountCallbackRetry.creditAction.type === "restore_skipped_no_count" &&
    afterNoCountStartCredits === initialCredits - neededCredits &&
    afterNoCountCallbackCredits === afterNoCountStartCredits &&
    afterNoCountCallbackRetryCredits === afterNoCountCallbackCredits &&
    noCountCleanup.success &&
    afterNoCountCleanupCredits === initialCredits &&
    partialStart.success &&
    partialCallback.observedCounts.sources.successCnt === "data.successCount" &&
    partialCallback.creditAction.type === "restore" &&
    partialCallbackRetry.creditAction.type === "restore_already_processed" &&
    partialCallback.creditAction.reason === "partial_delivery_failure" &&
    partialCallback.creditAction.restoredCredits === partialRestoreCredits &&
    partialCallbackRetry.creditAction.restoredCredits === partialRestoreCredits &&
    afterPartialStartCredits === initialCredits - partialNeededCredits &&
    afterPartialCallbackCredits === initialCredits - partialNeededCredits + partialRestoreCredits &&
    afterPartialCallbackRetryCredits === afterPartialCallbackCredits &&
    partialRestoreLedgerCount === 1 &&
    partialCleanup.success &&
    afterPartialCleanupCredits === initialCredits;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    balances: {
      initialCredits,
      afterReleaseReserveCredits,
      afterReleaseCallbackCredits,
      afterReleaseCallbackRetryCredits,
      afterNoCountStartCredits,
      afterNoCountCallbackCredits,
      afterNoCountCallbackRetryCredits,
      afterNoCountCleanupCredits,
      afterPartialStartCredits,
      afterPartialCallbackCredits,
      afterPartialCallbackRetryCredits,
      afterPartialCleanupCredits,
    },
    releaseScenario: {
      campaignId: releaseCampaignId,
      bizchatCampaignId: releaseBizchatId,
      reserve: releaseReserve,
      callback: releaseCallback,
      callbackRetry: releaseCallbackRetry,
      ledger: releaseLedger,
    },
    noCountScenario: {
      campaignId: noCountCampaignId,
      bizchatCampaignId: noCountBizchatId,
      start: noCountStart,
      callback: noCountCallback,
      callbackRetry: noCountCallbackRetry,
      cleanup: noCountCleanup,
      ledger: noCountLedger,
    },
    partialScenario: {
      campaignId: partialCampaignId,
      bizchatCampaignId: partialBizchatId,
      targetCount: partialTargetCount,
      chargeableCount: partialChargeableCount,
      partialRestoreCredits,
      start: partialStart,
      callback: partialCallback,
      callbackRetry: partialCallbackRetry,
      cleanup: partialCleanup,
      ledger: partialLedger,
    },
  });
}

async function handleLocalVerifyCreditPurchaseGuards(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = `local-credit-purchase-${runId}`;
  const lightPaymentRef = `local-light-${runId}`;
  const secondLightPaymentRef = `local-light-second-${runId}`;
  const topupPaymentRefA = `local-topup-a-${runId}`;
  const topupPaymentRefB = `local-topup-b-${runId}`;
  const expiresAt = getCreditExpiryDate(new Date());

  async function insertUser() {
    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Purchase', 'Guard', '로컬 충전 검증', '010-0000-0000', '0', true, false, false, now(), now())`,
      [userId, `${userId}@wepick.test`],
    );
  }

  async function getAvailableCredits() {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function getGrantSummary() {
    const { rows } = await pool.query(
      `select product_type as "productType",
              count(*)::int as count,
              coalesce(sum(original_credits), 0)::int as "originalCredits",
              coalesce(sum(remaining_credits), 0)::int as "remainingCredits",
              min(expires_at) as "firstExpiresAt"
       from credit_grants
       where user_id = $1
       group by product_type
       order by product_type`,
      [userId],
    );
    return rows.reduce((acc: Record<string, any>, row: any) => {
      acc[row.productType] = {
        count: Number(row.count || 0),
        originalCredits: Number(row.originalCredits || 0),
        remainingCredits: Number(row.remainingCredits || 0),
        firstExpiresAt: row.firstExpiresAt,
      };
      return acc;
    }, {});
  }

  async function getLedgerSummary() {
    const { rows } = await pool.query(
      `select product_type as "productType",
              idempotency_key as "idempotencyKey",
              count(*)::int as count,
              coalesce(sum(amount_credits), 0)::int as "amountCredits"
       from credit_ledger
       where user_id = $1
         and type = 'grant'
       group by product_type, idempotency_key
       order by product_type, idempotency_key`,
      [userId],
    );
    return rows.map((row: any) => ({
      productType: row.productType,
      idempotencyKey: row.idempotencyKey,
      count: Number(row.count || 0),
      amountCredits: Number(row.amountCredits || 0),
    }));
  }

  await insertUser();
  const initialCredits = await getAvailableCredits();

  const lightProduct = CREDIT_PRODUCTS.light;
  const topupProduct = CREDIT_PRODUCTS.topup;

  const firstLight = await storage.grantPurchasedCreditsAtomically({
    userId,
    transactionId: null,
    productType: lightProduct.productType,
    credits: lightProduct.credits,
    expiresAt,
    paymentReference: lightPaymentRef,
    description: "로컬 충전 검증: 라이트 첫 구매",
  });
  const afterFirstLightCredits = await getAvailableCredits();

  const duplicateLight = await storage.grantPurchasedCreditsAtomically({
    userId,
    transactionId: null,
    productType: lightProduct.productType,
    credits: lightProduct.credits,
    expiresAt,
    paymentReference: lightPaymentRef,
    description: "로컬 충전 검증: 라이트 중복 콜백",
  });
  const afterDuplicateLightCredits = await getAvailableCredits();

  const secondLight = await storage.grantPurchasedCreditsAtomically({
    userId,
    transactionId: null,
    productType: lightProduct.productType,
    credits: lightProduct.credits,
    expiresAt,
    paymentReference: secondLightPaymentRef,
    description: "로컬 충전 검증: 라이트 월 2회 시도",
  });
  const afterSecondLightCredits = await getAvailableCredits();

  const topupFirst = await storage.grantPurchasedCreditsAtomically({
    userId,
    transactionId: null,
    productType: topupProduct.productType,
    credits: topupProduct.credits,
    expiresAt,
    paymentReference: topupPaymentRefA,
    description: "로컬 충전 검증: 추가 충전 첫 구매",
  });
  const afterTopupFirstCredits = await getAvailableCredits();

  const topupSecond = await storage.grantPurchasedCreditsAtomically({
    userId,
    transactionId: null,
    productType: topupProduct.productType,
    credits: topupProduct.credits,
    expiresAt,
    paymentReference: topupPaymentRefB,
    description: "로컬 충전 검증: 추가 충전 두 번째 구매",
  });
  const finalCredits = await getAvailableCredits();

  const grants = await getGrantSummary();
  const ledgers: Array<{
    productType: string;
    idempotencyKey: string;
    count: number;
    amountCredits: number;
  }> = await getLedgerSummary();
  const lightLedgerCount = ledgers.filter((entry) => entry.productType === "light").length;
  const duplicateLightLedgerCount = ledgers.filter(
    (entry) => entry.idempotencyKey === `credit-grant:${lightPaymentRef}`,
  ).length;
  const topupLedgerCount = ledgers.filter((entry) => entry.productType === "topup").length;
  const roughlyTwelveMonths =
    expiresAt.getTime() - Date.now() > 360 * 24 * 60 * 60 * 1000 &&
    expiresAt.getTime() - Date.now() < 370 * 24 * 60 * 60 * 1000;

  const passed =
    initialCredits === 0 &&
    firstLight.success === true &&
    afterFirstLightCredits === lightProduct.credits &&
    duplicateLight.success === false &&
    duplicateLight.alreadyProcessed === true &&
    afterDuplicateLightCredits === afterFirstLightCredits &&
    secondLight.success === false &&
    secondLight.error === "라이트 충전은 매월 1회만 구매할 수 있습니다" &&
    afterSecondLightCredits === afterFirstLightCredits &&
    topupFirst.success === true &&
    afterTopupFirstCredits === lightProduct.credits + topupProduct.credits &&
    topupSecond.success === true &&
    finalCredits === lightProduct.credits + topupProduct.credits * 2 &&
    grants.light?.count === 1 &&
    grants.light?.remainingCredits === lightProduct.credits &&
    grants.topup?.count === 2 &&
    grants.topup?.remainingCredits === topupProduct.credits * 2 &&
    lightLedgerCount === 1 &&
    duplicateLightLedgerCount === 1 &&
    topupLedgerCount === 2 &&
    roughlyTwelveMonths;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    balances: {
      initialCredits,
      afterFirstLightCredits,
      afterDuplicateLightCredits,
      afterSecondLightCredits,
      afterTopupFirstCredits,
      finalCredits,
    },
    lightMonthlyGuard: {
      first: {
        success: firstLight.success,
        alreadyProcessed: firstLight.alreadyProcessed,
        error: firstLight.error,
      },
      duplicate: {
        success: duplicateLight.success,
        alreadyProcessed: duplicateLight.alreadyProcessed,
        error: duplicateLight.error,
      },
      secondThisMonth: {
        success: secondLight.success,
        alreadyProcessed: secondLight.alreadyProcessed,
        error: secondLight.error,
      },
    },
    topupUnlimitedGuard: {
      first: {
        success: topupFirst.success,
        alreadyProcessed: topupFirst.alreadyProcessed,
        error: topupFirst.error,
      },
      second: {
        success: topupSecond.success,
        alreadyProcessed: topupSecond.alreadyProcessed,
        error: topupSecond.error,
      },
    },
    expiry: {
      expiresAt,
      roughlyTwelveMonths,
    },
    grants,
    ledgers,
  });
}

async function callLocalJsonHandler(
  req: Request,
  handler: (req: Request, res: Response) => Promise<unknown>,
  overrides: Partial<Request>,
) {
  return await new Promise<{ statusCode: number; body: any }>((resolve) => {
    const mockReq = {
      ...req,
      ...overrides,
      headers: {
        ...(req.headers || {}),
        ...((overrides as any).headers || {}),
      },
    } as Request;
    let statusCode = 200;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        resolve({ statusCode, body });
        return this;
      },
      end() {
        resolve({ statusCode, body: null });
        return this;
      },
    } as Response;

    handler(mockReq, mockRes).catch((error) => {
      resolve({
        statusCode: 500,
        body: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });
  });
}

async function handleLocalVerifyAdminCreditOps(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  await ensureLocalAdmin(pool);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminToken = generateAdminToken(LOCAL_ADMIN.id);
  const authHeaders = { authorization: `Bearer ${adminToken}` };
  const refundUserId = `local-admin-refund-${runId}`;
  const refundGrantId = `local-admin-refund-grant-${runId}`;
  const refundId = `local-admin-refund-request-${runId}`;
  const insufficientRefundUserId = `local-admin-refund-low-${runId}`;
  const insufficientRefundId = `local-admin-refund-low-request-${runId}`;
  const adjustmentUserId = `local-admin-adjust-${runId}`;
  const adjustmentGrantId = `local-admin-adjust-grant-${runId}`;

  async function insertUser(id: string, email: string) {
    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Admin', 'Credit', '로컬 관리자 검증', '010-0000-0000', '0',
               true, false, false, now(), now())
       on conflict (id) do update set updated_at = now()`,
      [id, email],
    );
  }

  async function insertGrant(input: {
    id: string;
    userId: string;
    productType: string;
    originalCredits: number;
    remainingCredits: number;
  }) {
    await pool.query(
      `insert into credit_grants (
         id, user_id, product_type, original_credits, remaining_credits,
         purchased_at, expires_at, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, now(), now() + interval '12 months', now(), now())`,
      [input.id, input.userId, input.productType, input.originalCredits, input.remainingCredits],
    );
  }

  async function insertRefund(id: string, userId: string, amount: number) {
    await pool.query(
      `insert into refunds (
         id, user_id, amount, reason, status, bank_name, account_number, account_holder,
         created_at, updated_at
       )
       values ($1, $2, $3, '로컬 관리자 환불 검증', 'approved', '테스트은행', '000-0000', '테스터', now(), now())`,
      [id, userId, amount],
    );
  }

  async function getAvailableCredits(userId: string) {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function getLedgerCounts(userId: string) {
    const { rows } = await pool.query(
      `select type, count(*)::int as count, coalesce(sum(amount_credits), 0)::int as "amountCredits"
       from credit_ledger
       where user_id = $1
       group by type`,
      [userId],
    );
    return rows.reduce((acc: Record<string, { count: number; amountCredits: number }>, row: any) => {
      acc[row.type] = {
        count: Number(row.count || 0),
        amountCredits: Number(row.amountCredits || 0),
      };
      return acc;
    }, {});
  }

  async function getAdminLogCount(targetId: string, action: string) {
    const { rows } = await pool.query(
      `select count(*)::int as count
       from admin_logs
       where target_id = $1
         and action = $2`,
      [targetId, action],
    );
    return Number(rows[0]?.count || 0);
  }

  await insertUser(refundUserId, `${refundUserId}@wepick.test`);
  await insertGrant({
    id: refundGrantId,
    userId: refundUserId,
    productType: "light",
    originalCredits: 2000,
    remainingCredits: 2000,
  });
  await insertRefund(refundId, refundUserId, 50_000);

  await insertUser(insufficientRefundUserId, `${insufficientRefundUserId}@wepick.test`);
  await insertRefund(insufficientRefundId, insufficientRefundUserId, 10_000);

  await insertUser(adjustmentUserId, `${adjustmentUserId}@wepick.test`);
  await insertGrant({
    id: adjustmentGrantId,
    userId: adjustmentUserId,
    productType: "topup",
    originalCredits: 2000,
    remainingCredits: 2000,
  });

  const refundInitialCredits = await getAvailableCredits(refundUserId);
  const refundComplete = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminRefundProcess(mockReq, mockRes, refundId),
    {
      method: "POST",
      headers: authHeaders,
      body: { action: "complete", adminNote: "로컬 환불 완료 검증" },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const refundAfterCompleteCredits = await getAvailableCredits(refundUserId);
  const refundDuplicate = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminRefundProcess(mockReq, mockRes, refundId),
    {
      method: "POST",
      headers: authHeaders,
      body: { action: "complete", adminNote: "로컬 환불 중복 검증" },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const refundAfterDuplicateCredits = await getAvailableCredits(refundUserId);
  const refundLedgerCounts = await getLedgerCounts(refundUserId);
  const refundAdminLogCount = await getAdminLogCount(refundId, "refund_complete");

  const insufficientRefund = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminRefundProcess(mockReq, mockRes, insufficientRefundId),
    {
      method: "POST",
      headers: authHeaders,
      body: { action: "complete", adminNote: "로컬 환불 부족 검증" },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const insufficientRefundCredits = await getAvailableCredits(insufficientRefundUserId);

  const adjustmentInitialCredits = await getAvailableCredits(adjustmentUserId);
  const missingAdjustmentKey = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminUserCredits(mockReq, mockRes, adjustmentUserId),
    {
      method: "POST",
      headers: authHeaders,
      body: { amountCredits: 100, reason: "키 누락 검증" },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const addAdjustmentKey = `add-${runId}`;
  const addAdjustment = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminUserCredits(mockReq, mockRes, adjustmentUserId),
    {
      method: "POST",
      headers: authHeaders,
      body: { amountCredits: 500, reason: "로컬 수동 지급 검증", adjustmentKey: addAdjustmentKey },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const afterAddAdjustmentCredits = await getAvailableCredits(adjustmentUserId);
  const duplicateAddAdjustment = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminUserCredits(mockReq, mockRes, adjustmentUserId),
    {
      method: "POST",
      headers: authHeaders,
      body: { amountCredits: 500, reason: "로컬 수동 지급 중복 검증", adjustmentKey: addAdjustmentKey },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const afterDuplicateAddAdjustmentCredits = await getAvailableCredits(adjustmentUserId);
  const subtractAdjustment = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminUserCredits(mockReq, mockRes, adjustmentUserId),
    {
      method: "POST",
      headers: authHeaders,
      body: { amountCredits: -700, reason: "로컬 수동 차감 검증", adjustmentKey: `sub-${runId}` },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const afterSubtractAdjustmentCredits = await getAvailableCredits(adjustmentUserId);
  const overSubtractAdjustment = await callLocalJsonHandler(
    req,
    (mockReq, mockRes) => handleAdminUserCredits(mockReq, mockRes, adjustmentUserId),
    {
      method: "POST",
      headers: authHeaders,
      body: { amountCredits: -9999, reason: "로컬 수동 초과 차감 검증", adjustmentKey: `over-${runId}` },
      ip: "127.0.0.1",
    } as Partial<Request>,
  );
  const afterOverSubtractAdjustmentCredits = await getAvailableCredits(adjustmentUserId);
  const adjustmentLedgerCounts = await getLedgerCounts(adjustmentUserId);
  const adjustmentAdminLogCount = await getAdminLogCount(adjustmentUserId, "credit_adjust");

  const passed =
    refundInitialCredits === 2000 &&
    refundComplete.statusCode === 200 &&
    refundAfterCompleteCredits === 1000 &&
    refundDuplicate.statusCode === 400 &&
    refundAfterDuplicateCredits === refundAfterCompleteCredits &&
    refundLedgerCounts.refund?.count === 1 &&
    refundLedgerCounts.refund?.amountCredits === -1000 &&
    refundAdminLogCount === 1 &&
    insufficientRefund.statusCode === 400 &&
    insufficientRefundCredits === 0 &&
    adjustmentInitialCredits === 2000 &&
    missingAdjustmentKey.statusCode === 400 &&
    addAdjustment.statusCode === 200 &&
    afterAddAdjustmentCredits === 2500 &&
    duplicateAddAdjustment.statusCode === 200 &&
    duplicateAddAdjustment.body?.alreadyProcessed === true &&
    afterDuplicateAddAdjustmentCredits === afterAddAdjustmentCredits &&
    subtractAdjustment.statusCode === 200 &&
    afterSubtractAdjustmentCredits === 1800 &&
    overSubtractAdjustment.statusCode === 400 &&
    afterOverSubtractAdjustmentCredits === afterSubtractAdjustmentCredits &&
    adjustmentLedgerCounts.adjustment?.count === 2 &&
    adjustmentLedgerCounts.adjustment?.amountCredits === -200 &&
    adjustmentAdminLogCount === 2;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    refundScenario: {
      userId: refundUserId,
      refundId,
      initialCredits: refundInitialCredits,
      afterCompleteCredits: refundAfterCompleteCredits,
      afterDuplicateCredits: refundAfterDuplicateCredits,
      complete: { statusCode: refundComplete.statusCode, body: refundComplete.body },
      duplicate: { statusCode: refundDuplicate.statusCode, body: refundDuplicate.body },
      ledgerCounts: refundLedgerCounts,
      adminLogCount: refundAdminLogCount,
    },
    insufficientRefundScenario: {
      userId: insufficientRefundUserId,
      refundId: insufficientRefundId,
      credits: insufficientRefundCredits,
      complete: { statusCode: insufficientRefund.statusCode, body: insufficientRefund.body },
    },
    adjustmentScenario: {
      userId: adjustmentUserId,
      initialCredits: adjustmentInitialCredits,
      afterAddCredits: afterAddAdjustmentCredits,
      afterDuplicateAddCredits: afterDuplicateAddAdjustmentCredits,
      afterSubtractCredits: afterSubtractAdjustmentCredits,
      afterOverSubtractCredits: afterOverSubtractAdjustmentCredits,
      missingKey: { statusCode: missingAdjustmentKey.statusCode, body: missingAdjustmentKey.body },
      add: { statusCode: addAdjustment.statusCode, body: addAdjustment.body },
      duplicateAdd: { statusCode: duplicateAddAdjustment.statusCode, body: duplicateAddAdjustment.body },
      subtract: { statusCode: subtractAdjustment.statusCode, body: subtractAdjustment.body },
      overSubtract: { statusCode: overSubtractAdjustment.statusCode, body: overSubtractAdjustment.body },
      ledgerCounts: adjustmentLedgerCounts,
      adminLogCount: adjustmentAdminLogCount,
    },
  });
}

async function handleLocalVerifyTemplateSenderPreflight(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerUserId = `local-template-owner-${runId}`;
  const otherUserId = `local-template-other-${runId}`;
  const ownerApprovedTemplateId = `local-template-approved-${runId}`;
  const ownerDraftTemplateId = `local-template-draft-${runId}`;
  const systemApprovedTemplateId = `local-template-system-${runId}`;
  const otherApprovedTemplateId = `local-template-other-approved-${runId}`;

  async function insertUser(id: string, email: string) {
    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Template', 'Policy', '로컬 템플릿 검증', '010-0000-0000', '0',
               true, false, false, now(), now())
       on conflict (id) do update set updated_at = now()`,
      [id, email],
    );
  }

  async function insertTemplate(input: {
    id: string;
    userId: string;
    status: string;
    messageType?: string;
    content?: string;
    lmsContent?: string | null;
  }) {
    await pool.query(
      `insert into templates (
         id, user_id, name, message_type, rcs_type, title, lms_title,
         content, lms_content, status, created_at, updated_at
       )
       values ($1, $2, $3, $4, 4, '검증 템플릿', '검증 템플릿',
               $5, $6, $7, now(), now())
       on conflict (id) do update set
         user_id = excluded.user_id,
         message_type = excluded.message_type,
         content = excluded.content,
         lms_content = excluded.lms_content,
         status = excluded.status,
         updated_at = now()`,
      [
        input.id,
        input.userId,
        `로컬 템플릿 검증 ${input.id}`,
        input.messageType || "RCS",
        input.content || "로컬 템플릿 검증 RCS 메시지입니다.",
        input.lmsContent === undefined ? "로컬 템플릿 검증 LMS 메시지입니다." : input.lmsContent,
        input.status,
      ],
    );
  }

  function validateTemplatePayload(data: {
    name?: string;
    messageType?: string;
    title?: string;
    lmsTitle?: string;
    content?: string;
    lmsContent?: string | null;
    buttons?: { list?: Array<{ type?: string; name?: string; val1?: string }> };
  }) {
    if (!data.name || data.name.length > 200) return { valid: false, error: "name" };
    if (!["LMS", "MMS", "RCS"].includes(String(data.messageType || ""))) return { valid: false, error: "messageType" };
    if ((data.title || "").length > 30 || (data.lmsTitle || "").length > 30) return { valid: false, error: "title" };
    if (!data.content || data.content.trim().length === 0 || data.content.length > 2000) return { valid: false, error: "content" };
    if (data.messageType === "RCS" && (!data.lmsContent || data.lmsContent.trim().length === 0)) {
      return { valid: false, error: "lmsContent" };
    }
    const invalidButton = data.buttons?.list?.some((button) => !["0", "1", "2"].includes(String(button.type || "")));
    if (invalidButton) return { valid: false, error: "buttonType" };
    return { valid: true, error: null };
  }

  function canUseTemplateForCampaign(template: { user_id: string; status: string } | undefined, userId: string) {
    if (!template) return { allowed: false, error: "Template not found" };
    if (template.user_id !== userId && template.user_id !== "system") {
      return { allowed: false, error: "Access denied to template" };
    }
    if (template.status !== "approved") {
      return { allowed: false, error: "Template must be approved before creating campaign" };
    }
    return { allowed: true, error: null };
  }

  function canUseTemplateForTestSend(template: { user_id: string; status: string } | undefined, userId: string) {
    if (!template) return { allowed: false, error: "Template not found" };
    if (template.user_id !== userId && template.user_id !== "system") {
      return { allowed: false, error: "Access denied to template" };
    }
    if (template.status !== "approved") {
      return { allowed: false, error: "Template must be approved before sending test message" };
    }
    return { allowed: true, error: null };
  }

  function normalizeApprovedSenders(senderNumbers: Array<Record<string, any>>) {
    return senderNumbers
      .filter((sender) => sender.state === 1)
      .map((sender) => ({
        id: sender.id,
        code: sender.id || sender.code,
        num: sender.num || sender.number,
        campaignValue: sender.id || sender.code,
      }));
  }

  await insertUser(ownerUserId, `${ownerUserId}@wepick.test`);
  await insertUser(otherUserId, `${otherUserId}@wepick.test`);
  await insertUser("system", "system@wepick.test");
  await insertTemplate({ id: ownerApprovedTemplateId, userId: ownerUserId, status: "approved" });
  await insertTemplate({ id: ownerDraftTemplateId, userId: ownerUserId, status: "draft" });
  await insertTemplate({ id: systemApprovedTemplateId, userId: "system", status: "approved" });
  await insertTemplate({ id: otherApprovedTemplateId, userId: otherUserId, status: "approved" });

  const { rows: approvedRows } = await pool.query(
    `select id, user_id, status
     from templates
     where status = 'approved'
       and (user_id = $1 or user_id = 'system')
       and id = any($2::text[])
     order by id`,
    [ownerUserId, [ownerApprovedTemplateId, ownerDraftTemplateId, systemApprovedTemplateId, otherApprovedTemplateId]],
  );
  const approvedIds = approvedRows.map((row: any) => row.id);

  const { rows: templateRows } = await pool.query(
    `select id, user_id, status
     from templates
     where id = any($1::text[])`,
    [[ownerApprovedTemplateId, ownerDraftTemplateId, systemApprovedTemplateId, otherApprovedTemplateId]],
  );
  const templatesById = new Map<string, { user_id: string; status: string }>(
    templateRows.map((row: any) => [row.id, { user_id: row.user_id, status: row.status }]),
  );

  const validRcs = validateTemplatePayload({
    name: "검증 RCS",
    messageType: "RCS",
    title: "검증",
    lmsTitle: "검증",
    content: "RCS 본문",
    lmsContent: "LMS 본문",
    buttons: { list: [{ type: "0", name: "바로가기", val1: "https://wepick.kr" }] },
  });
  const invalidRcsMissingLms = validateTemplatePayload({
    name: "검증 RCS",
    messageType: "RCS",
    content: "RCS 본문",
    lmsContent: "",
  });
  const invalidLongTitle = validateTemplatePayload({
    name: "검증 LMS",
    messageType: "LMS",
    title: "제목이 30자를 넘으면 BizChat 규격과 맞지 않아서 차단해야 합니다",
    content: "LMS 본문",
  });
  const invalidButtonType = validateTemplatePayload({
    name: "검증 RCS",
    messageType: "RCS",
    content: "RCS 본문",
    lmsContent: "LMS 본문",
    buttons: { list: [{ type: "9", name: "잘못된 버튼", val1: "https://wepick.kr" }] },
  });

  const ownerApprovedAccess = canUseTemplateForCampaign(templatesById.get(ownerApprovedTemplateId), ownerUserId);
  const ownerDraftAccess = canUseTemplateForCampaign(templatesById.get(ownerDraftTemplateId), ownerUserId);
  const systemApprovedAccess = canUseTemplateForCampaign(templatesById.get(systemApprovedTemplateId), ownerUserId);
  const otherApprovedAccess = canUseTemplateForCampaign(templatesById.get(otherApprovedTemplateId), ownerUserId);
  const ownerApprovedTestSendAccess = canUseTemplateForTestSend(templatesById.get(ownerApprovedTemplateId), ownerUserId);
  const ownerDraftTestSendAccess = canUseTemplateForTestSend(templatesById.get(ownerDraftTemplateId), ownerUserId);
  const systemApprovedTestSendAccess = canUseTemplateForTestSend(templatesById.get(systemApprovedTemplateId), ownerUserId);
  const otherApprovedTestSendAccess = canUseTemplateForTestSend(templatesById.get(otherApprovedTemplateId), ownerUserId);

  const approvedSenders = normalizeApprovedSenders([
    { id: "001001", num: "16700823", name: "승인 발신번호", state: 1 },
    { id: "001002", num: "0212345678", name: "미승인 발신번호", state: 0 },
  ]);

  const passed =
    validRcs.valid === true &&
    invalidRcsMissingLms.valid === false &&
    invalidRcsMissingLms.error === "lmsContent" &&
    invalidLongTitle.valid === false &&
    invalidLongTitle.error === "title" &&
    invalidButtonType.valid === false &&
    invalidButtonType.error === "buttonType" &&
    approvedIds.includes(ownerApprovedTemplateId) &&
    approvedIds.includes(systemApprovedTemplateId) &&
    !approvedIds.includes(ownerDraftTemplateId) &&
    !approvedIds.includes(otherApprovedTemplateId) &&
    ownerApprovedAccess.allowed === true &&
    ownerDraftAccess.allowed === false &&
    systemApprovedAccess.allowed === true &&
    otherApprovedAccess.allowed === false &&
    ownerApprovedTestSendAccess.allowed === true &&
    ownerDraftTestSendAccess.allowed === false &&
    systemApprovedTestSendAccess.allowed === true &&
    otherApprovedTestSendAccess.allowed === false &&
    approvedSenders.length === 1 &&
    approvedSenders[0]?.campaignValue === "001001" &&
    approvedSenders[0]?.campaignValue !== approvedSenders[0]?.num;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId: ownerUserId,
    templateValidation: {
      validRcs,
      invalidRcsMissingLms,
      invalidLongTitle,
      invalidButtonType,
    },
    approvedTemplateIds: approvedIds,
    campaignTemplateAccess: {
      ownerApproved: ownerApprovedAccess,
      ownerDraft: ownerDraftAccess,
      systemApproved: systemApprovedAccess,
      otherApproved: otherApprovedAccess,
    },
    testSendTemplateAccess: {
      ownerApproved: ownerApprovedTestSendAccess,
      ownerDraft: ownerDraftTestSendAccess,
      systemApproved: systemApprovedTestSendAccess,
      otherApproved: otherApprovedTestSendAccess,
    },
    senderNumberPolicy: {
      approvedSenders,
      note: "캠페인 sndNum에는 실제 전화번호(num)가 아니라 BizChat 발신번호 코드(id/code)를 사용한다.",
    },
  });
}

async function handleLocalVerifyDbSchema(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const requiredTables = [
    "users",
    "campaigns",
    "transactions",
    "refunds",
    "credit_grants",
    "credit_ledger",
  ];
  const requiredColumns: Record<string, string[]> = {
    users: ["id", "email", "balance", "created_at", "updated_at"],
    templates: ["id", "user_id", "content", "variable_schema", "status", "created_at", "updated_at"],
    campaigns: [
      "id",
      "user_id",
      "status_code",
      "status",
      "target_count",
      "sent_count",
      "success_count",
      "settle_cnt",
      "bizchat_campaign_id",
      "scheduled_at",
      "completed_at",
    ],
    transactions: ["id", "user_id", "type", "amount", "balance_after", "stripe_session_id", "created_at"],
    refunds: ["id", "user_id", "amount", "reason", "status", "admin_id", "processed_at", "created_at", "updated_at"],
    credit_grants: [
      "id",
      "user_id",
      "transaction_id",
      "product_type",
      "original_credits",
      "remaining_credits",
      "purchased_at",
      "expires_at",
      "created_at",
      "updated_at",
    ],
    credit_ledger: [
      "id",
      "user_id",
      "credit_grant_id",
      "transaction_id",
      "campaign_id",
      "type",
      "amount_credits",
      "balance_after_credits",
      "product_type",
      "idempotency_key",
      "description",
      "metadata",
      "created_at",
    ],
  };
  const requiredIndexes = [
    { table: "credit_ledger", name: "uidx_credit_ledger_idempotency", unique: true },
    { table: "credit_ledger", name: "idx_credit_ledger_user_created", unique: false },
    { table: "credit_ledger", name: "idx_credit_ledger_campaign", unique: false },
    { table: "credit_grants", name: "idx_credit_grants_user_expires", unique: false },
    { table: "credit_grants", name: "idx_credit_grants_user_remaining", unique: false },
  ];

  const { rows: tableRows } = await pool.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [requiredTables],
  );
  const existingTables = new Set(tableRows.map((row: any) => row.table_name));

  const allRequiredColumns = Object.entries(requiredColumns).flatMap(([tableName, columns]) =>
    columns.map((columnName) => ({ tableName, columnName })),
  );
  const { rows: columnRows } = await pool.query(
    `select table_name, column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [Object.keys(requiredColumns)],
  );
  const existingColumns = new Set(columnRows.map((row: any) => `${row.table_name}.${row.column_name}`));

  const indexTableNames = Array.from(new Set(requiredIndexes.map((index) => index.table)));
  const { rows: indexRows } = await pool.query(
    `select tablename, indexname, indexdef
     from pg_indexes
     where schemaname = 'public'
       and tablename = any($1::text[])`,
    [indexTableNames],
  );
  const existingIndexes = new Map<string, string>(
    indexRows.map((row: any) => [`${row.tablename}.${row.indexname}`, String(row.indexdef || "")]),
  );

  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
  const missingColumns = allRequiredColumns
    .filter(({ tableName, columnName }) => !existingColumns.has(`${tableName}.${columnName}`))
    .map(({ tableName, columnName }) => `${tableName}.${columnName}`);
  const missingIndexes = requiredIndexes
    .filter((index) => !existingIndexes.has(`${index.table}.${index.name}`))
    .map((index) => `${index.table}.${index.name}`);
  const nonUniqueIndexes = requiredIndexes
    .filter((index) => index.unique)
    .filter((index) => {
      const indexDef = existingIndexes.get(`${index.table}.${index.name}`) || "";
      return Boolean(indexDef) && !/\bUNIQUE\b/i.test(indexDef);
    })
    .map((index) => `${index.table}.${index.name}`);

  const success =
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    missingIndexes.length === 0 &&
    nonUniqueIndexes.length === 0;

  return res.status(success ? 200 : 500).json({
    success,
    missingTables,
    missingColumns,
    missingIndexes,
    nonUniqueIndexes,
    inspected: {
      tables: requiredTables,
      columnCount: allRequiredColumns.length,
      indexes: requiredIndexes.map((index) => index.name),
    },
  });
}

async function handleLocalVerifyCampaignCreatePolicy(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerUserId = `local-create-policy-owner-${runId}`;
  const otherUserId = `local-create-policy-other-${runId}`;
  const approvedTemplateId = `local-create-policy-approved-${runId}`;
  const draftTemplateId = `local-create-policy-draft-${runId}`;
  const systemTemplateId = `local-create-policy-system-${runId}`;
  const otherTemplateId = `local-create-policy-other-template-${runId}`;

  async function insertUser(id: string, email: string) {
    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Create', 'Policy', '로컬 생성 정책 검증', '010-0000-0000', '0',
               true, false, false, now(), now())
       on conflict (id) do update set updated_at = now()`,
      [id, email],
    );
  }

  async function insertTemplate(id: string, userId: string, status: string) {
    await pool.query(
      `insert into templates (
         id, user_id, name, message_type, rcs_type, title, lms_title,
         content, lms_content, status, created_at, updated_at
       )
       values ($1, $2, $3, 'RCS', 4, '로컬 정책 검증', '로컬 정책 검증',
               '로컬 캠페인 생성 정책 검증 메시지입니다.', '로컬 캠페인 생성 정책 검증 메시지입니다.',
               $4, now(), now())
       on conflict (id) do update set
         user_id = excluded.user_id,
         status = excluded.status,
         updated_at = now()`,
      [id, userId, `로컬 생성 정책 검증 ${id}`, status],
    );
  }

  function canUseTemplate(template: { user_id: string; status: string } | undefined, userId: string) {
    if (!template) {
      return { allowed: false, error: "Template not found" };
    }

    const SYSTEM_USER_ID = "system";
    if (template.user_id !== userId && template.user_id !== SYSTEM_USER_ID) {
      return { allowed: false, error: "Access denied to template" };
    }
    if (template.status !== "approved") {
      return { allowed: false, error: "Template must be approved before creating campaign" };
    }
    return { allowed: true, error: null };
  }

  await insertUser(ownerUserId, `${ownerUserId}@wepick.test`);
  await insertUser(otherUserId, `${otherUserId}@wepick.test`);
  await insertUser("system", "system@wepick.test");
  await insertTemplate(approvedTemplateId, ownerUserId, "approved");
  await insertTemplate(draftTemplateId, ownerUserId, "draft");
  await insertTemplate(systemTemplateId, "system", "approved");
  await insertTemplate(otherTemplateId, otherUserId, "approved");

  const { rows } = await pool.query(
    `select id, user_id, status
     from templates
     where id = any($1::text[])`,
    [[approvedTemplateId, draftTemplateId, systemTemplateId, otherTemplateId]],
  );
  const templatesById = new Map<string, { user_id: string; status: string }>(
    rows.map((row: any) => [row.id, { user_id: String(row.user_id), status: String(row.status) }]),
  );

  const belowMinimumEstimate = calculateCampaignCredits({ targetCount: 999, templateCount: 1 });
  const exactMinimumEstimate = calculateCampaignCredits({ targetCount: 1000, templateCount: 1 });
  const multiTemplateEstimate = calculateCampaignCredits({ targetCount: 3000, templateCount: 3 });

  const approvedAccess = canUseTemplate(templatesById.get(approvedTemplateId), ownerUserId);
  const draftAccess = canUseTemplate(templatesById.get(draftTemplateId), ownerUserId);
  const systemAccess = canUseTemplate(templatesById.get(systemTemplateId), ownerUserId);
  const otherAccess = canUseTemplate(templatesById.get(otherTemplateId), ownerUserId);

  const passed =
    belowMinimumEstimate.isBelowMinimum &&
    belowMinimumEstimate.neededCredits === 1998 &&
    exactMinimumEstimate.isBelowMinimum === false &&
    exactMinimumEstimate.neededCredits === 2000 &&
    multiTemplateEstimate.minTargetCount === 3000 &&
    multiTemplateEstimate.neededCredits === 6000 &&
    approvedAccess.allowed === true &&
    draftAccess.allowed === false &&
    draftAccess.error === "Template must be approved before creating campaign" &&
    systemAccess.allowed === true &&
    otherAccess.allowed === false &&
    otherAccess.error === "Access denied to template";

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId: ownerUserId,
    policyGuards: {
      belowMinimum: belowMinimumEstimate,
      exactMinimum: exactMinimumEstimate,
      multiTemplate: multiTemplateEstimate,
    },
    templateGuards: {
      approvedOwnerTemplate: approvedAccess,
      draftOwnerTemplate: draftAccess,
      approvedSystemTemplate: systemAccess,
      approvedOtherUserTemplate: otherAccess,
    },
    senderNumberPolicy: {
      unchanged: true,
      note: "캠페인 생성 시 sndNum은 기존 BizChat 발신번호 목록에서 선택한 발신번호 코드(id/code)를 사용한다.",
    },
  });
}

async function runLocalVerificationHandler(
  req: Request,
  handler: (req: Request, res: Response) => Promise<unknown>,
  overrides: Partial<Request> = {},
) {
  return await new Promise<{ statusCode: number; body: any }>((resolve) => {
    const mockReq = {
      ...req,
      method: "GET",
      query: {},
      body: {},
      ...overrides,
      headers: {
        ...req.headers,
        ...(overrides.headers || {}),
      },
    } as Request;
    let statusCode = 200;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        resolve({ statusCode, body });
        return this;
      },
      end() {
        resolve({ statusCode, body: null });
        return this;
      },
    } as Response;

    handler(mockReq, mockRes).catch((error) => {
      resolve({
        statusCode: 500,
        body: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });
  });
}

async function handleLocalVerifyCreditAll(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const checks = [
    { name: "Database schema", path: "/api/local/verify-db-schema", handler: handleLocalVerifyDbSchema },
    { name: "Seed credit demo data", path: "/api/local/seed-credit-demo", handler: handleLocalSeedCreditDemo },
    { name: "Campaign create policy", path: "/api/local/verify-campaign-create-policy", handler: handleLocalVerifyCampaignCreatePolicy },
    { name: "Campaign submit policy", path: "/api/local/verify-campaign-submit-policy", handler: handleLocalVerifyCampaignSubmitPolicy },
    { name: "Campaign credit flow", path: "/api/local/verify-campaign-credit-flow", handler: handleLocalVerifyCampaignCreditFlow },
    { name: "Campaign credit idempotency", path: "/api/local/verify-campaign-credit-idempotency", handler: handleLocalVerifyCampaignCreditIdempotency },
    { name: "Campaign credit guards", path: "/api/local/verify-campaign-credit-guards", handler: handleLocalVerifyCampaignCreditGuards },
    { name: "BizChat callback credit handling", path: "/api/local/verify-bizchat-callback-credit", handler: handleLocalVerifyBizChatCallbackCredit },
    { name: "Credit purchase guards", path: "/api/local/verify-credit-purchase-guards", handler: handleLocalVerifyCreditPurchaseGuards },
    { name: "Admin credit operations", path: "/api/local/verify-admin-credit-ops", handler: handleLocalVerifyAdminCreditOps },
    { name: "Template sender preflight", path: "/api/local/verify-template-sender-preflight", handler: handleLocalVerifyTemplateSenderPreflight },
    { name: "Message type private template flow", path: "/api/local/verify-message-copy-private-template-flow", handler: handleLocalVerifyMessageCopyPrivateTemplateFlow },
    { name: "Template variable campaign flow", path: "/api/local/verify-template-variable-campaign-flow", handler: handleLocalVerifyTemplateVariableCampaignFlow },
  ];

  const results = [];
  for (const check of checks) {
    const startedAt = Date.now();
    const result = await runLocalVerificationHandler(req, check.handler);
    const bodySuccess = result.body?.success;
    const passed = result.statusCode >= 200 && result.statusCode < 300 && (bodySuccess === undefined || bodySuccess === true);
    results.push({
      name: check.name,
      path: check.path,
      success: passed,
      statusCode: result.statusCode,
      durationMs: Date.now() - startedAt,
      error: passed ? undefined : result.body?.error || result.body?.details || "Verification failed",
      summary: passed
        ? {
            userId: result.body?.userId,
            balances: result.body?.balances,
          }
        : undefined,
    });

    if (!passed) break;
  }

  const passedCount = results.filter((result) => result.success).length;
  const success = passedCount === checks.length;

  return res.status(success ? 200 : 500).json({
    success,
    passed: passedCount,
    total: checks.length,
    results,
  });
}

async function handleLocalVerifyCampaignSubmitPolicy(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const userId = "local-credit-demo-user";
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const noSenderCampaignId = `local-submit-policy-no-sender-${runId}`;
  const belowMinimumCampaignId = `local-submit-policy-below-min-${runId}`;
  const resubmitBelowMinimumCampaignId = `local-submit-policy-resubmit-below-min-${runId}`;
  const validCampaignId = `local-submit-policy-valid-${runId}`;

  const { rows: userRows } = await pool.query("select id from users where id = $1 limit 1", [userId]);
  if (!userRows[0]) {
    return res.status(400).json({
      error: "로컬 크레딧 데모 계정이 없습니다. 먼저 /api/local/seed-credit-demo를 실행해주세요.",
    });
  }

  async function getAvailableCredits() {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function insertCampaign(input: {
    id: string;
    name: string;
    statusCode: number;
    status: string;
    targetCount: number;
    sndNum?: string | null;
  }) {
    await pool.query(
      `insert into campaigns (
         id, user_id, name, status_code, status, message_type, snd_num,
         target_count, budget, cost_per_message, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, 'RCS', $6, $7, '100000', '100', now(), now())`,
      [input.id, userId, input.name, input.statusCode, input.status, input.sndNum ?? null, input.targetCount],
    );
  }

  function getSubmitPolicy(campaign: { sndNum?: string | null; targetCount: number; statusCode: number }) {
    if (!campaign.sndNum) {
      return { allowed: false, reason: "sender_required" };
    }

    const creditEstimate = calculateCampaignCredits({ targetCount: campaign.targetCount || 0, templateCount: 1 });
    if (creditEstimate.isBelowMinimum) {
      return { allowed: false, reason: "below_minimum", creditEstimate };
    }

    if (
      campaign.statusCode !== CAMPAIGN_STATUS.DRAFT.code &&
      campaign.statusCode !== CAMPAIGN_STATUS.APPROVAL_REQUESTED.code
    ) {
      return { allowed: false, reason: "invalid_status", creditEstimate };
    }

    return { allowed: true, reason: null, creditEstimate };
  }

  await insertCampaign({
    id: noSenderCampaignId,
    name: "로컬 검수 요청 정책: 발신번호 없음",
    statusCode: CAMPAIGN_STATUS.DRAFT.code,
    status: CAMPAIGN_STATUS.DRAFT.status,
    targetCount: 1000,
  });
  await insertCampaign({
    id: belowMinimumCampaignId,
    name: "로컬 검수 요청 정책: 최소수량 미달",
    statusCode: CAMPAIGN_STATUS.DRAFT.code,
    status: CAMPAIGN_STATUS.DRAFT.status,
    targetCount: 999,
    sndNum: "001001",
  });
  await insertCampaign({
    id: resubmitBelowMinimumCampaignId,
    name: "로컬 검수 요청 정책: 재요청 최소수량 미달",
    statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
    status: CAMPAIGN_STATUS.APPROVAL_REQUESTED.status,
    targetCount: 999,
    sndNum: "001001",
  });
  await insertCampaign({
    id: validCampaignId,
    name: "로컬 검수 요청 정책: 정상 예약",
    statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
    status: CAMPAIGN_STATUS.APPROVAL_REQUESTED.status,
    targetCount: 1000,
    sndNum: "001001",
  });

  const noSenderPolicy = getSubmitPolicy({ sndNum: null, targetCount: 1000, statusCode: CAMPAIGN_STATUS.DRAFT.code });
  const belowMinimumPolicy = getSubmitPolicy({
    sndNum: "001001",
    targetCount: 999,
    statusCode: CAMPAIGN_STATUS.DRAFT.code,
  });
  const resubmitBelowMinimumPolicy = getSubmitPolicy({
    sndNum: "001001",
    targetCount: 999,
    statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
  });
  const validPolicy = getSubmitPolicy({
    sndNum: "001001",
    targetCount: 1000,
    statusCode: CAMPAIGN_STATUS.APPROVAL_REQUESTED.code,
  });

  const initialCredits = await getAvailableCredits();
  const validReserve = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: validCampaignId,
    neededCredits: validPolicy.creditEstimate?.neededCredits || 0,
    description: "로컬 검수 요청 정책: 정상 예약",
  });
  const afterReserveCredits = await getAvailableCredits();
  const duplicateReserve = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: validCampaignId,
    neededCredits: validPolicy.creditEstimate?.neededCredits || 0,
    description: "로컬 검수 요청 정책: 중복 예약 방지",
  });
  const afterDuplicateCredits = await getAvailableCredits();
  const releaseReserve = await storage.releaseCampaignReservedCreditsAtomically({
    userId,
    campaignId: validCampaignId,
    description: "로컬 검수 요청 정책: 예약 정리",
  });
  const finalCredits = await getAvailableCredits();

  const passed =
    noSenderPolicy.allowed === false &&
    noSenderPolicy.reason === "sender_required" &&
    belowMinimumPolicy.allowed === false &&
    belowMinimumPolicy.reason === "below_minimum" &&
    resubmitBelowMinimumPolicy.allowed === false &&
    resubmitBelowMinimumPolicy.reason === "below_minimum" &&
    validPolicy.allowed === true &&
    validPolicy.creditEstimate?.neededCredits === 2000 &&
    validReserve.success === true &&
    duplicateReserve.success === true &&
    duplicateReserve.alreadyProcessed === true &&
    releaseReserve.success === true &&
    afterReserveCredits === initialCredits - 2000 &&
    afterDuplicateCredits === afterReserveCredits &&
    finalCredits === initialCredits;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    campaigns: {
      noSenderCampaignId,
      belowMinimumCampaignId,
      resubmitBelowMinimumCampaignId,
      validCampaignId,
    },
    guards: {
      noSenderBlocked: noSenderPolicy,
      belowMinimumBlocked: belowMinimumPolicy,
      resubmitBelowMinimumBlocked: resubmitBelowMinimumPolicy,
      validAllowed: validPolicy,
      reserve: {
        success: validReserve.success,
        alreadyProcessed: validReserve.alreadyProcessed,
        error: validReserve.error,
      },
      duplicateReserve: {
        success: duplicateReserve.success,
        alreadyProcessed: duplicateReserve.alreadyProcessed,
        error: duplicateReserve.error,
      },
      release: {
        success: releaseReserve.success,
        error: releaseReserve.error,
      },
    },
    balances: {
      initialCredits,
      afterReserveCredits,
      afterDuplicateCredits,
      finalCredits,
    },
  });
}

async function handleLocalVerifyCampaignCreditGuards(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = await getPool();
  const userId = "local-credit-demo-user";
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lowCreditUserId = `local-credit-guard-low-${runId}`;
  const insufficientReserveCampaignId = `local-credit-guard-insufficient-reserve-${runId}`;
  const insufficientStartCampaignId = `local-credit-guard-insufficient-start-${runId}`;
  const mismatchCampaignId = `local-credit-guard-mismatch-${runId}`;
  const releaseAfterStartCampaignId = `local-credit-guard-release-after-start-${runId}`;
  const targetCount = 1000;
  const neededCredits = 2000;
  const mismatchNeededCredits = 4000;
  const now = new Date();
  const scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  async function getAvailableCredits(targetUserId = userId) {
    const { rows } = await pool.query(
      `select coalesce(sum(remaining_credits), 0)::int as credits
       from credit_grants
       where user_id = $1
         and remaining_credits > 0
         and expires_at > now()`,
      [targetUserId],
    );
    return Number(rows[0]?.credits || 0);
  }

  async function insertUser(id: string, email: string) {
    await pool.query(
      `insert into users (
         id, email, first_name, last_name, company_name, phone, balance,
         is_verified, is_master, is_agency, created_at, updated_at
       )
       values ($1, $2, 'Guard', 'User', '로컬 방어 검증', '010-0000-0000', '0', true, false, false, now(), now())
       on conflict (id) do update set updated_at = now()`,
      [id, email],
    );
  }

  async function insertApprovedCampaign(input: {
    id: string;
    ownerUserId: string;
    name: string;
    scheduledAt?: Date | null;
    count?: number;
  }) {
    await pool.query(
      `insert into campaigns (
         id, user_id, name, status_code, status, message_type,
         target_count, budget, cost_per_message, scheduled_at, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, 'RCS', $6, '100000', '100', $7, now(), now())`,
      [
        input.id,
        input.ownerUserId,
        input.name,
        CAMPAIGN_STATUS.APPROVED.code,
        CAMPAIGN_STATUS.APPROVED.status,
        input.count ?? targetCount,
        input.scheduledAt ?? null,
      ],
    );
  }

  async function getLedgerCounts(campaignId: string) {
    const { rows } = await pool.query(
      `select type, count(*)::int as count, coalesce(sum(amount_credits), 0)::int as "amountCredits"
       from credit_ledger
       where campaign_id = $1
       group by type
       order by type`,
      [campaignId],
    );
    return rows.reduce((acc: Record<string, { count: number; amountCredits: number }>, row: any) => {
      acc[row.type] = {
        count: Number(row.count || 0),
        amountCredits: Number(row.amountCredits || 0),
      };
      return acc;
    }, {});
  }

  const { rows: userRows } = await pool.query("select id from users where id = $1 limit 1", [userId]);
  if (!userRows[0]) {
    return res.status(400).json({
      error: "로컬 크레딧 데모 계정이 없습니다. 먼저 /api/local/seed-credit-demo를 실행해주세요.",
    });
  }

  await insertUser(lowCreditUserId, `${lowCreditUserId}@wepick.test`);

  const belowMinimumEstimate = calculateCampaignCredits({ targetCount: 999, templateCount: 1 });
  const exactMinimumEstimate = calculateCampaignCredits({ targetCount, templateCount: 1 });
  const initialCredits = await getAvailableCredits();
  const lowInitialCredits = await getAvailableCredits(lowCreditUserId);

  await insertApprovedCampaign({
    id: insufficientReserveCampaignId,
    ownerUserId: lowCreditUserId,
    name: "로컬 방어 검증: 예약 크레딧 부족",
    scheduledAt,
  });
  const insufficientReserve = await storage.reserveCampaignCreditsAtomically({
    userId: lowCreditUserId,
    campaignId: insufficientReserveCampaignId,
    neededCredits,
    description: "로컬 방어 검증: 부족 예약",
  });
  const lowAfterInsufficientReserve = await getAvailableCredits(lowCreditUserId);

  await insertApprovedCampaign({
    id: insufficientStartCampaignId,
    ownerUserId: lowCreditUserId,
    name: "로컬 방어 검증: 발송 크레딧 부족",
  });
  const insufficientStart = await storage.startCampaignWithCreditUseAtomically({
    userId: lowCreditUserId,
    campaignId: insufficientStartCampaignId,
    neededCredits,
    sentCount: targetCount,
    successCount: 900,
    description: "로컬 방어 검증: 부족 발송",
  });
  const lowAfterInsufficientStart = await getAvailableCredits(lowCreditUserId);

  await insertApprovedCampaign({
    id: mismatchCampaignId,
    ownerUserId: userId,
    name: "로컬 방어 검증: 예약/발송 크레딧 불일치",
    scheduledAt,
  });
  const mismatchReserve = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: mismatchCampaignId,
    neededCredits,
    description: "로컬 방어 검증: 불일치 예약",
  });
  const afterMismatchReserveCredits = await getAvailableCredits();
  const mismatchStart = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: mismatchCampaignId,
    neededCredits: mismatchNeededCredits,
    sentCount: 2000,
    successCount: 1800,
    description: "로컬 방어 검증: 불일치 발송",
  });
  const afterMismatchStartCredits = await getAvailableCredits();
  const mismatchRelease = await storage.releaseCampaignReservedCreditsAtomically({
    userId,
    campaignId: mismatchCampaignId,
    description: "로컬 방어 검증: 불일치 예약 정리",
  });
  const afterMismatchCleanupCredits = await getAvailableCredits();

  await insertApprovedCampaign({
    id: releaseAfterStartCampaignId,
    ownerUserId: userId,
    name: "로컬 방어 검증: 발송 후 예약 취소 불가",
    scheduledAt,
  });
  const releaseAfterStartReserve = await storage.reserveCampaignCreditsAtomically({
    userId,
    campaignId: releaseAfterStartCampaignId,
    neededCredits,
    description: "로컬 방어 검증: 발송 후 취소 예약",
  });
  const afterReleaseAfterStartReserveCredits = await getAvailableCredits();
  const releaseAfterStartStart = await storage.startCampaignWithCreditUseAtomically({
    userId,
    campaignId: releaseAfterStartCampaignId,
    neededCredits,
    sentCount: targetCount,
    successCount: 900,
    description: "로컬 방어 검증: 발송 후 취소 발송",
  });
  const afterReleaseAfterStartStartCredits = await getAvailableCredits();
  const releaseAfterStartRelease = await storage.releaseCampaignReservedCreditsAtomically({
    userId,
    campaignId: releaseAfterStartCampaignId,
    description: "로컬 방어 검증: 발송 후 예약 취소 시도",
  });
  const afterBlockedReleaseCredits = await getAvailableCredits();
  const releaseAfterStartRestore = await storage.restoreCampaignUsedCreditsAtomically({
    userId,
    campaignId: releaseAfterStartCampaignId,
    reason: "internal_failure",
    description: "로컬 방어 검증: 발송 후 취소 검증 정리",
    statusCode: CAMPAIGN_STATUS.STOPPED.code,
    status: CAMPAIGN_STATUS.STOPPED.status,
  });
  const finalCredits = await getAvailableCredits();

  const insufficientReserveLedgerCounts = await getLedgerCounts(insufficientReserveCampaignId);
  const insufficientStartLedgerCounts = await getLedgerCounts(insufficientStartCampaignId);
  const mismatchLedgerCounts = await getLedgerCounts(mismatchCampaignId);
  const releaseAfterStartLedgerCounts = await getLedgerCounts(releaseAfterStartCampaignId);
  const passed =
    belowMinimumEstimate.isBelowMinimum &&
    belowMinimumEstimate.neededCredits === 1998 &&
    exactMinimumEstimate.isBelowMinimum === false &&
    exactMinimumEstimate.neededCredits === neededCredits &&
    insufficientReserve.success === false &&
    insufficientReserve.error === "크레딧이 부족합니다" &&
    lowAfterInsufficientReserve === lowInitialCredits &&
    Object.keys(insufficientReserveLedgerCounts).length === 0 &&
    insufficientStart.success === false &&
    insufficientStart.error === "크레딧이 부족합니다" &&
    lowAfterInsufficientStart === lowInitialCredits &&
    Object.keys(insufficientStartLedgerCounts).length === 0 &&
    mismatchReserve.success === true &&
    mismatchStart.success === false &&
    mismatchStart.error === "예약된 크레딧과 필요한 크레딧이 일치하지 않습니다" &&
    afterMismatchReserveCredits === initialCredits - neededCredits &&
    afterMismatchStartCredits === afterMismatchReserveCredits &&
    mismatchRelease.success === true &&
    afterMismatchCleanupCredits === initialCredits &&
    mismatchLedgerCounts.reserve?.count === 1 &&
    mismatchLedgerCounts.release?.count === 1 &&
    !mismatchLedgerCounts.use &&
    releaseAfterStartReserve.success === true &&
    releaseAfterStartStart.success === true &&
    releaseAfterStartRelease.success === false &&
    releaseAfterStartRelease.error === "이미 발송이 시작된 캠페인은 예약 크레딧을 해제할 수 없습니다" &&
    afterReleaseAfterStartReserveCredits === initialCredits - neededCredits &&
    afterReleaseAfterStartStartCredits === initialCredits - neededCredits &&
    afterBlockedReleaseCredits === initialCredits - neededCredits &&
    releaseAfterStartRestore.success === true &&
    finalCredits === initialCredits &&
    releaseAfterStartLedgerCounts.reserve?.count === 1 &&
    releaseAfterStartLedgerCounts.use?.count === 1 &&
    !releaseAfterStartLedgerCounts.release &&
    releaseAfterStartLedgerCounts.adjustment?.count === 1;

  return res.status(passed ? 200 : 500).json({
    success: passed,
    userId,
    lowCreditUserId,
    policyGuards: {
      belowMinimum: belowMinimumEstimate,
      exactMinimum: exactMinimumEstimate,
    },
    balances: {
      initialCredits,
      lowInitialCredits,
      lowAfterInsufficientReserve,
      lowAfterInsufficientStart,
      afterMismatchReserveCredits,
      afterMismatchStartCredits,
      afterMismatchCleanupCredits,
      afterReleaseAfterStartReserveCredits,
      afterReleaseAfterStartStartCredits,
      afterBlockedReleaseCredits,
      finalCredits,
    },
    insufficientGuards: {
      reserve: {
        success: insufficientReserve.success,
        error: insufficientReserve.error,
        balanceAfterCredits: insufficientReserve.balanceAfterCredits,
        ledgerCounts: insufficientReserveLedgerCounts,
      },
      start: {
        success: insufficientStart.success,
        error: insufficientStart.error,
        balanceAfterCredits: insufficientStart.balanceAfterCredits,
        ledgerCounts: insufficientStartLedgerCounts,
      },
    },
    mismatchGuard: {
      campaignId: mismatchCampaignId,
      reserve: {
        success: mismatchReserve.success,
        error: mismatchReserve.error,
        balanceAfterCredits: mismatchReserve.balanceAfterCredits,
      },
      start: {
        success: mismatchStart.success,
        error: mismatchStart.error,
        balanceAfterCredits: mismatchStart.balanceAfterCredits,
      },
      cleanupRelease: {
        success: mismatchRelease.success,
        error: mismatchRelease.error,
        balanceAfterCredits: mismatchRelease.balanceAfterCredits,
      },
      ledgerCounts: mismatchLedgerCounts,
    },
    releaseAfterStartGuard: {
      campaignId: releaseAfterStartCampaignId,
      reserve: {
        success: releaseAfterStartReserve.success,
        error: releaseAfterStartReserve.error,
        balanceAfterCredits: releaseAfterStartReserve.balanceAfterCredits,
      },
      start: {
        success: releaseAfterStartStart.success,
        error: releaseAfterStartStart.error,
        balanceAfterCredits: releaseAfterStartStart.balanceAfterCredits,
      },
      blockedRelease: {
        success: releaseAfterStartRelease.success,
        error: releaseAfterStartRelease.error,
        balanceAfterCredits: releaseAfterStartRelease.balanceAfterCredits,
      },
      cleanupRestore: {
        success: releaseAfterStartRestore.success,
        error: releaseAfterStartRestore.error,
        restoredCredits: releaseAfterStartRestore.restoredCredits,
        balanceAfterCredits: releaseAfterStartRestore.balanceAfterCredits,
      },
      ledgerCounts: releaseAfterStartLedgerCounts,
    },
  });
}

async function handleRecommendedTemplates(req: Request, res: Response) {
  const pool = await getPool();

  if (req.method === "GET") {
    const userId = getRequestUserId(req);
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (req.query.category && req.query.category !== "all") {
      values.push(String(req.query.category));
      conditions.push(`category = $${values.length}`);
    }
    if (req.query.purpose && req.query.purpose !== "all") {
      values.push(String(req.query.purpose));
      conditions.push(`purpose = $${values.length}`);
    }
    if (req.query.active !== "false") {
      values.push(true);
      conditions.push(`is_active = $${values.length}`);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await pool.query(
      `select * from recommended_templates ${where} order by sort_order asc, created_at desc`,
      values,
    );
    const { rows: privateRows } = await pool.query(
      `select id, name, message_type, rcs_type, title, lms_title, content, lms_content,
              variable_schema, image_url, url_links, buttons, created_at, updated_at
       from templates
       where user_id = $1
         and status = 'approved'
       order by reviewed_at desc nulls last, created_at desc
       limit 50`,
      [userId],
    );
    const privateTemplates = privateRows.map((row: any) => ({
      id: `private-${row.id}`,
      name: row.name,
      category: "private",
      purpose: "private",
      titleTemplate: row.title,
      lmsTitleTemplate: row.lms_title,
      contentTemplate: row.content,
      lmsContentTemplate: row.lms_content,
      variableSchema: row.variable_schema || [],
      defaultImageUrl: row.image_url,
      messageType: row.message_type,
      rcsType: row.rcs_type,
      urlLinks: row.url_links,
      buttons: row.buttons,
      isActive: true,
      sortOrder: -1,
      sourceTemplateId: row.id,
      isPrivate: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.status(200).json({
      success: true,
      templates: [...privateTemplates, ...rows.map(mapTemplate)],
      categories: CATEGORIES,
      purposes: PURPOSES,
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.name || !body.category || !body.purpose || !body.contentTemplate) {
      return res.status(400).json({ success: false, error: "필수 필드가 누락되었습니다" });
    }

    const columns: string[] = [];
    const placeholders: string[] = [];
    const values: unknown[] = [];

    for (const [key, field] of Object.entries(TEMPLATE_FIELDS)) {
      if (body[key] === undefined) continue;
      values.push(dbValue(field, body[key]));
      columns.push(field.column);
      placeholders.push(`$${values.length}${field.json ? "::jsonb" : ""}`);
    }

    const { rows } = await pool.query(
      `insert into recommended_templates (${columns.join(", ")}) values (${placeholders.join(", ")}) returning *`,
      values,
    );

    return res.status(201).json({ success: true, template: mapTemplate(rows[0]) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function handleRecommendedTemplateById(req: Request, res: Response, id: string) {
  const pool = await getPool();

  if (req.method === "GET") {
    const { rows } = await pool.query("select * from recommended_templates where id = $1 limit 1", [id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: "Template not found" });
    return res.status(200).json({ success: true, template: mapTemplate(rows[0]) });
  }

  if (req.method === "PATCH") {
    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const [key, field] of Object.entries(TEMPLATE_FIELDS)) {
      if (req.body?.[key] === undefined) continue;
      values.push(dbValue(field, req.body[key]));
      assignments.push(`${field.column} = $${values.length}${field.json ? "::jsonb" : ""}`);
    }

    if (!assignments.length) {
      return res.status(400).json({ success: false, error: "No update fields" });
    }

    values.push(id);
    const { rows } = await pool.query(
      `update recommended_templates set ${assignments.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values,
    );

    if (!rows[0]) return res.status(404).json({ success: false, error: "Template not found" });
    return res.status(200).json({ success: true, template: mapTemplate(rows[0]) });
  }

  if (req.method === "DELETE") {
    const { rows } = await pool.query("delete from recommended_templates where id = $1 returning id", [id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: "Template not found" });
    return res.status(200).json({ success: true, message: "Template deleted" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function handleAtsMeta(req: Request, res: Response, metaType: string) {
  if (metaType === "loc" && req.method === "POST") {
    const query = String(req.body?.addr || "").trim();
    const normalized = query.replace(/\s/g, "");
    const list = ATS_LOCATIONS.filter((loc) => {
      const label = `${loc.ado}${loc.sigu}${loc.dong}`;
      return !normalized || label.includes(normalized);
    });

    return res.status(200).json({
      list: list.length ? list : ATS_LOCATIONS,
      listR: [],
    });
  }

  if (metaType === "filter" && req.method === "GET") {
    return res.status(200).json({
      metaType,
      list: ATS_FILTERS,
    });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cateid = String(req.query.cateid || "");
  const baseList = ATS_CATEGORIES[metaType] || [];
  const list = cateid
    ? baseList.map((item, index) => ({
        id: `${cateid}_${index + 1}`,
        cateid: `${cateid}_${index + 1}`,
        name: `${item.name} ${index + 1}`,
      }))
    : baseList;

  return res.status(200).json({
    metaType,
    dataType: "local",
    list,
  });
}

async function handleAgenciesList(_req: Request, res: Response) {
  return res.status(200).json({
    success: true,
    agencies: [],
  });
}

async function handleTargetingEstimate(req: Request, res: Response) {
  const locations = req.body?.advancedTargeting?.locations || req.body?.locations || [];
  const categories =
    (req.body?.advancedTargeting?.shopping11stCategories?.length || 0) +
    (req.body?.advancedTargeting?.webappCategories?.length || 0) +
    (req.body?.advancedTargeting?.callCategories?.length || 0);

  return res.status(200).json({
    success: true,
    estimatedCount: Math.max(1000, 12000 - locations.length * 700 - categories * 500),
    source: "local-dev",
  });
}

export async function localApiRouter(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();

  try {
    if (req.path === "/api/admin/login") return await handleAdminLogin(req, res);
    if (req.path === "/api/admin/me") return await handleAdminMe(req, res);
    if (req.path === "/api/admin/users") return await handleAdminUsers(req, res);
    if (req.path === "/api/admin/funnel") return await handleAdminFunnel(req, res);
    if (req.path === "/api/admin/logs") return await handleAdminLogs(req, res);
    if (req.path === "/api/admin/refunds") return await handleAdminRefunds(req, res);
    if (req.path === "/api/admin/message-copy-requests") return await handleAdminMessageCopyRequests(req, res);
    if (req.path === "/api/message-copy-requests") return await handleMessageCopyRequests(req, res);
    if (req.path === "/api/local/seed-credit-demo") return await handleLocalSeedCreditDemo(req, res);
    if (req.path === "/api/local/seed-recommended-templates") return await handleLocalSeedRecommendedTemplates(req, res);
    if (req.path === "/api/local/verify-campaign-credit-flow") return await handleLocalVerifyCampaignCreditFlow(req, res);
    if (req.path === "/api/local/verify-campaign-create-policy") return await handleLocalVerifyCampaignCreatePolicy(req, res);
    if (req.path === "/api/local/verify-campaign-submit-policy") return await handleLocalVerifyCampaignSubmitPolicy(req, res);
    if (req.path === "/api/local/verify-campaign-credit-idempotency") return await handleLocalVerifyCampaignCreditIdempotency(req, res);
    if (req.path === "/api/local/verify-campaign-credit-guards") return await handleLocalVerifyCampaignCreditGuards(req, res);
    if (req.path === "/api/local/verify-bizchat-callback-credit") return await handleLocalVerifyBizChatCallbackCredit(req, res);
    if (req.path === "/api/local/verify-credit-purchase-guards") return await handleLocalVerifyCreditPurchaseGuards(req, res);
    if (req.path === "/api/local/verify-admin-credit-ops") return await handleLocalVerifyAdminCreditOps(req, res);
    if (req.path === "/api/local/verify-template-sender-preflight") return await handleLocalVerifyTemplateSenderPreflight(req, res);
    if (req.path === "/api/local/verify-message-copy-requests") return await handleLocalVerifyMessageCopyRequests(req, res);
    if (req.path === "/api/local/verify-message-copy-private-template-flow") return await handleLocalVerifyMessageCopyPrivateTemplateFlow(req, res);
    if (req.path === "/api/local/verify-template-variable-campaign-flow") return await handleLocalVerifyTemplateVariableCampaignFlow(req, res);
    if (req.path === "/api/local/verify-db-schema") return await handleLocalVerifyDbSchema(req, res);
    if (req.path === "/api/local/verify-credit-all") return await handleLocalVerifyCreditAll(req, res);
    if (req.path === "/api/recommended-templates") return await handleRecommendedTemplates(req, res);
    if (req.path === "/api/agencies/list") return await handleAgenciesList(req, res);
    if (req.path === "/api/targeting/estimate") return await handleTargetingEstimate(req, res);

    const templateMatch = req.path.match(/^\/api\/recommended-templates\/([^/]+)$/);
    if (templateMatch) {
      return await handleRecommendedTemplateById(req, res, decodeURIComponent(templateMatch[1]));
    }

    const adminRefundProcessMatch = req.path.match(/^\/api\/admin\/refunds\/([^/]+)\/process$/);
    if (adminRefundProcessMatch) {
      return await handleAdminRefundProcess(req, res, decodeURIComponent(adminRefundProcessMatch[1]));
    }

    const adminMessageCopyRequestProcessMatch = req.path.match(/^\/api\/admin\/message-copy-requests\/([^/]+)\/process$/);
    if (adminMessageCopyRequestProcessMatch) {
      return await handleAdminMessageCopyRequestProcess(req, res, decodeURIComponent(adminMessageCopyRequestProcessMatch[1]));
    }

    const adminMessageCopyRequestTemplatesMatch = req.path.match(/^\/api\/admin\/message-copy-requests\/([^/]+)\/templates$/);
    if (adminMessageCopyRequestTemplatesMatch) {
      return await handleAdminMessageCopyRequestTemplates(req, res, decodeURIComponent(adminMessageCopyRequestTemplatesMatch[1]));
    }

    const adminUserCreditsMatch = req.path.match(/^\/api\/admin\/users\/([^/]+)\/credits$/);
    if (adminUserCreditsMatch) {
      return await handleAdminUserCredits(req, res, decodeURIComponent(adminUserCreditsMatch[1]));
    }

    const atsMetaMatch = req.path.match(/^\/api\/ats\/meta\/([^/]+)$/);
    if (atsMetaMatch) {
      return await handleAtsMeta(req, res, decodeURIComponent(atsMetaMatch[1]));
    }

    return next();
  } catch (error) {
    console.error("[Local API Router]", error);
    return res.status(500).json({
      success: false,
      error: "Local API error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
