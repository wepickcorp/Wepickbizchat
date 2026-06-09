import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

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
    .createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret")
    .update(data)
    .digest("hex");

  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

function verifyAdminToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const expectedSignature = crypto
      .createHmac("sha256", process.env.ADMIN_JWT_SECRET || "wepick-admin-secret")
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

async function handleRecommendedTemplates(req: Request, res: Response) {
  const pool = await getPool();

  if (req.method === "GET") {
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

    return res.status(200).json({
      success: true,
      templates: rows.map(mapTemplate),
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
    if (req.path === "/api/recommended-templates") return await handleRecommendedTemplates(req, res);
    if (req.path === "/api/agencies/list") return await handleAgenciesList(req, res);
    if (req.path === "/api/targeting/estimate") return await handleTargetingEstimate(req, res);

    const templateMatch = req.path.match(/^\/api\/recommended-templates\/([^/]+)$/);
    if (templateMatch) {
      return await handleRecommendedTemplateById(req, res, decodeURIComponent(templateMatch[1]));
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
