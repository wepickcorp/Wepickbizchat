import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

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

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const client = neon(databaseUrl);
  return drizzle(client);
}

// 변수 치환 함수
function replaceVariables(template: string, variables: Record<string, any>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    let displayValue = value;
    
    // 날짜 범위 처리
    if (value && typeof value === 'object' && value.start && value.end) {
      displayValue = `${value.start} ~ ${value.end}`;
    }
    
    result = result.split(placeholder).join(displayValue ?? '');
  }
  
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid template ID' });
  }

  const db = getDb();

  try {
    if (req.method === 'GET') {
      const [template] = await db.select().from(recommendedTemplates).where(eq(recommendedTemplates.id, id));
      
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      return res.status(200).json({
        success: true,
        template,
      });
    }

    if (req.method === 'POST') {
      // Preview with variable substitution
      const { variableValues } = req.body;
      
      const [template] = await db.select().from(recommendedTemplates).where(eq(recommendedTemplates.id, id));
      
      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      const title = template.titleTemplate 
        ? replaceVariables(template.titleTemplate, variableValues || {})
        : '';
      const lmsTitle = template.lmsTitleTemplate
        ? replaceVariables(template.lmsTitleTemplate, variableValues || {})
        : '';
      const content = replaceVariables(template.contentTemplate, variableValues || {});
      const lmsContent = template.lmsContentTemplate 
        ? replaceVariables(template.lmsContentTemplate, variableValues || {})
        : '';

      return res.status(200).json({
        success: true,
        preview: {
          title,
          lmsTitle,
          content,
          lmsContent,
          estimatedLength: content.length,
          imageUrl: template.defaultImageUrl,
        },
      });
    }

    if (req.method === 'PATCH') {
      const updateData = req.body;
      
      delete updateData.id;
      delete updateData.createdAt;
      delete updateData.advancedTargetingState;
      delete updateData.basicTargetingState;
      updateData.updatedAt = new Date();

      const [updated] = await db.update(recommendedTemplates)
        .set(updateData)
        .where(eq(recommendedTemplates.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      return res.status(200).json({
        success: true,
        template: updated,
      });
    }

    if (req.method === 'DELETE') {
      const [deleted] = await db.delete(recommendedTemplates)
        .where(eq(recommendedTemplates.id, id))
        .returning();

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Template not found',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Template deleted',
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
