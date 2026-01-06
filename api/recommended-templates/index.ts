import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, asc, desc } from 'drizzle-orm';

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
  contentTemplate: text("content_template").notNull(),
  variableSchema: jsonb("variable_schema").$type<VariableSchemaItem[]>(),
  defaultImageUrl: text("default_image_url"),
  messageType: varchar("message_type", { length: 10 }).default("RCS"),
  rcsType: integer("rcs_type").default(4),
  urlLinks: jsonb("url_links").$type<UrlLinkConfig>(),
  buttons: jsonb("buttons").$type<RcsButtonsConfig>(),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  sourceTemplateId: varchar("source_template_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 업종 분류
const RECOMMENDED_CATEGORIES = [
  { value: 'commerce', label: '커머스/쇼핑' },
  { value: 'cafe_food', label: '카페/외식/프랜차이즈' },
  { value: 'travel_culture', label: '여행/문화' },
  { value: 'sports_health', label: '스포츠/건강' },
  { value: 'education_life', label: '교육/라이프' },
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
];

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const client = neon(databaseUrl);
  return drizzle(client);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();

  try {
    if (req.method === 'GET') {
      const { category, purpose, active } = req.query;

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

      return res.status(200).json({
        success: true,
        templates: results,
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
        contentTemplate,
        variableSchema,
        defaultImageUrl,
        messageType,
        rcsType,
        urlLinks,
        buttons,
        isActive,
        sortOrder,
        sourceTemplateId,
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
        contentTemplate,
        variableSchema,
        defaultImageUrl,
        messageType: messageType || 'RCS',
        rcsType: rcsType ?? 4,
        urlLinks,
        buttons,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
        sourceTemplateId,
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
