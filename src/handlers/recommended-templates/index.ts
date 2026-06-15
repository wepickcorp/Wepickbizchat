import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, asc, desc } from 'drizzle-orm';
import { createHmac } from 'crypto';

// Inline schema definitions for Vercel serverless
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

interface UrlLinkConfig {
  list: string[];
  reward?: number;
}

interface RcsButton {
  type: "0" | "1" | "2";
  name: string;
  val1: string;
  val2?: string;
  reward?: "1";
}

interface RcsButtonsConfig {
  list: RcsButton[];
}

interface VariableSchemaItem {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dateRange' | 'tel' | 'url';
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

const recommendedTemplates = pgTable("recommended_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  purpose: varchar("purpose", { length: 50 }).notNull(),
  version: varchar("version", { length: 20 }),
  titleTemplate: varchar("title_template", { length: 60 }),
  lmsTitleTemplate: varchar("lms_title_template", { length: 60 }),
  contentTemplate: text("content_template").notNull(),
  lmsContentTemplate: text("lms_content_template"), // RCS 메시지의 안드로이드용 LMS 대체 텍스트 템플릿
  variableSchema: jsonb("variable_schema").$type<VariableSchemaItem[]>(),
  defaultImageUrl: text("default_image_url"),
  messageType: varchar("message_type", { length: 10 }).default("RCS"),
  rcsType: integer("rcs_type").default(4),
  urlLinks: jsonb("url_links").$type<UrlLinkConfig>(),
  buttons: jsonb("buttons").$type<RcsButtonsConfig>(),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  targetingConfig: jsonb("targeting_config"),
  sourceTemplateId: varchar("source_template_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  messageType: text('message_type').notNull(),
  rcsType: integer('rcs_type'),
  title: text('title'),
  lmsTitle: text('lms_title'),
  content: text('content').notNull(),
  lmsContent: text('lms_content'),
  variableSchema: jsonb('variable_schema').$type<VariableSchemaItem[]>(),
  imageUrl: text('image_url'),
  urlLinks: jsonb('url_links'),
  buttons: jsonb('buttons'),
  status: text('status').default('draft'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 업종 분류
const RECOMMENDED_CATEGORIES = [
  { value: 'commerce', label: '커머스/쇼핑' },
  { value: 'cafe_food', label: '카페/외식/프랜차이즈' },
  { value: 'travel_culture', label: '여행/문화' },
  { value: 'sports_health', label: '스포츠/건강' },
  { value: 'education_life', label: '교육/라이프' },
  { value: 'medical', label: '병의원' },
];

// 목적 분류
const RECOMMENDED_PURPOSES = [
  { value: 'signup', label: '회원가입 유도' },
  { value: 'review_event', label: '리뷰 이벤트' },
  { value: 'holiday_discount', label: '명절 특별 할인' },
  { value: 'product_discount', label: '상품 할인 안내' },
  { value: 'new_product', label: '신규 상품 안내' },
  { value: 'new_product_discount', label: '신제품 할인 안내' },
  { value: 'app_download', label: '앱 다운로드 이벤트' },
  { value: 'offline_product_discount', label: '오프라인 행사 상품 할인 안내' },
  { value: 'offline_event', label: '오프라인 행사 안내' },
  { value: 'event', label: '이벤트 안내' },
  { value: 'timedeal', label: '타임딜 이벤트' },
  { value: 'special_product', label: '특가상품 안내' },
  { value: 'consultation', label: '상담신청유도' },
];

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const client = neon(databaseUrl);
  return drizzle(client);
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function verifyImpersonateToken(token: string): { userId: string; adminId: string } | null {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) return null;
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;
    const expectedSignature = createHmac('sha256', secret).update(data).digest('hex');
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    if (payload.type !== 'impersonate') return null;
    return { userId: payload.userId, adminId: payload.adminId };
  } catch {
    return null;
  }
}

async function getOptionalUserId(req: VercelRequest) {
  const impersonateUserId = req.headers['x-impersonate-user-id'];
  const impersonateToken = req.headers['x-impersonate-token'];
  if (typeof impersonateUserId === 'string' && impersonateUserId.trim()) {
    if (typeof impersonateToken !== 'string') return null;
    const verified = verifyImpersonateToken(impersonateToken);
    return verified?.userId === impersonateUserId.trim() ? verified.userId : null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

function mapPrivateTemplate(row: typeof templates.$inferSelect) {
  return {
    id: `private-${row.id}`,
    name: row.name,
    category: 'private',
    purpose: 'private',
    titleTemplate: row.title,
    lmsTitleTemplate: row.lmsTitle,
    contentTemplate: row.content,
    lmsContentTemplate: row.lmsContent,
    variableSchema: row.variableSchema || [],
    defaultImageUrl: row.imageUrl,
    messageType: row.messageType,
    rcsType: row.rcsType,
    urlLinks: row.urlLinks,
    buttons: row.buttons,
    isActive: true,
    sortOrder: -1,
    sourceTemplateId: row.id,
    isPrivate: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Impersonate-Token, X-Impersonate-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();

  try {
    if (req.method === 'GET') {
      const { category, purpose, active } = req.query;
      const userId = await getOptionalUserId(req);

      let query = db.select().from(recommendedTemplates);

      // 필터 조건 구성
      const conditions = [];

      if (category && category !== 'all') {
        conditions.push(eq(recommendedTemplates.category, String(category)));
      }

      if (purpose && purpose !== 'all') {
        conditions.push(eq(recommendedTemplates.purpose, String(purpose)));
      }

      // 기본적으로 활성화된 템플릿만 조회
      if (active !== 'false') {
        conditions.push(eq(recommendedTemplates.isActive, true));
      }

      const results = conditions.length > 0
        ? await db.select().from(recommendedTemplates)
            .where(and(...conditions))
            .orderBy(asc(recommendedTemplates.sortOrder), desc(recommendedTemplates.createdAt))
        : await db.select().from(recommendedTemplates)
            .orderBy(asc(recommendedTemplates.sortOrder), desc(recommendedTemplates.createdAt));
      const privateTemplates = userId
        ? await db.select().from(templates)
            .where(and(eq(templates.userId, userId), eq(templates.status, 'approved')))
            .orderBy(desc(templates.reviewedAt), desc(templates.createdAt))
        : [];

      return res.status(200).json({
        success: true,
        templates: [...privateTemplates.map(mapPrivateTemplate), ...results],
        categories: RECOMMENDED_CATEGORIES,
        purposes: RECOMMENDED_PURPOSES,
      });
    }

    if (req.method === 'POST') {
      // 새 추천 템플릿 생성
      const {
        name,
        category,
        purpose,
        version,
        titleTemplate,
        lmsTitleTemplate,
        contentTemplate,
        lmsContentTemplate,
        variableSchema,
        defaultImageUrl,
        messageType,
        rcsType,
        urlLinks,
        buttons,
        isActive,
        sortOrder,
        sourceTemplateId,
        targetingConfig,
      } = req.body;

      if (!name || !category || !purpose || !contentTemplate) {
        return res.status(400).json({
          success: false,
          error: '필수 필드가 누락되었습니다 (name, category, purpose, contentTemplate)',
        });
      }

      const [newTemplate] = await db.insert(recommendedTemplates).values({
        name,
        category,
        purpose,
        version,
        titleTemplate,
        lmsTitleTemplate,
        contentTemplate,
        lmsContentTemplate,
        variableSchema,
        defaultImageUrl,
        messageType: messageType || 'RCS',
        rcsType: rcsType ?? 4,
        urlLinks,
        buttons,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
        sourceTemplateId,
        targetingConfig,
      }).returning();

      return res.status(201).json({
        success: true,
        template: newTemplate,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Recommended Templates API] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
