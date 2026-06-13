import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
}

function verifyToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const expectedSignature = crypto
      .createHmac('sha256', process.env.ADMIN_JWT_SECRET!)
      .update(decoded.data)
      .digest('hex');
    if (decoded.signature !== expectedSignature) return null;
    const payload = JSON.parse(decoded.data);
    if (payload.exp < Date.now()) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

async function verifyAdmin(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const verified = verifyToken(authHeader.replace('Bearer ', ''));
  if (!verified) return null;

  const db = getDb();
  const result = await db.execute(sql`
    SELECT id, email, name, role, is_active
    FROM admins
    WHERE id = ${verified.adminId}
    LIMIT 1
  `);
  const admin = result.rows?.[0];
  return admin?.is_active ? admin : null;
}

async function ensureMessageCopyRequestsTable(db: ReturnType<typeof getDb>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS message_copy_requests (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id),
      content text NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'reviewing',
      admin_id varchar,
      admin_note text,
      rejection_reason text,
      template_id varchar,
      promoted_template_id varchar,
      reviewed_at timestamp,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE templates ADD COLUMN IF NOT EXISTS variable_schema jsonb`);
}

function mapTemplate(row: any) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  const requestId = String(req.query.id || '');
  if (!requestId) return res.status(400).json({ error: '메시지 유형 요청 ID가 필요합니다' });

  try {
    const db = getDb();
    await ensureMessageCopyRequestsTable(db);

    const requestResult = await db.execute(sql`
      SELECT r.id, r.user_id, u.email AS user_email, u.company_name
      FROM message_copy_requests r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = ${requestId}
      LIMIT 1
    `);
    const request = requestResult.rows?.[0];
    if (!request) return res.status(404).json({ error: '메시지 유형 요청을 찾을 수 없습니다' });

    if (req.method === 'POST') {
      const name = String(req.body?.name || '').trim();
      const messageType = String(req.body?.messageType || 'RCS').trim();
      const title = req.body?.title ? String(req.body.title).trim() : null;
      const lmsTitle = req.body?.lmsTitle ? String(req.body.lmsTitle).trim() : null;
      const content = String(req.body?.content || '').trim();
      const lmsContent = req.body?.lmsContent ? String(req.body.lmsContent).trim() : null;
      const variableSchema = Array.isArray(req.body?.variableSchema) ? req.body.variableSchema : [];
      const allowedTypes = new Set(['LMS', 'MMS', 'RCS']);

      if (!name) return res.status(400).json({ error: '템플릿 이름을 입력해주세요' });
      if (!allowedTypes.has(messageType)) return res.status(400).json({ error: '지원하지 않는 메시지 유형입니다' });
      if (!content) return res.status(400).json({ error: 'SKT 검수 완료 본문을 입력해주세요' });
      if (messageType === 'RCS' && !lmsContent) {
        return res.status(400).json({ error: 'RCS 템플릿은 LMS 대체 문구도 필요합니다' });
      }

      const templateId = crypto.randomUUID();
      const created = await db.execute(sql`
        INSERT INTO templates (
          id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
          variable_schema, status, reviewed_at, created_at, updated_at
        )
        VALUES (
          ${templateId},
          ${request.user_id},
          ${name},
          ${messageType},
          ${messageType === 'RCS' ? 4 : null},
          ${title},
          ${messageType === 'RCS' ? lmsTitle : null},
          ${content},
          ${messageType === 'RCS' ? lmsContent : null},
          ${JSON.stringify(variableSchema)}::jsonb,
          'approved',
          now(),
          now(),
          now()
        )
        RETURNING id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
                  variable_schema, image_url, status, reviewed_at, created_at, updated_at
      `);

      return res.status(201).json({
        success: true,
        template: mapTemplate(created.rows?.[0]),
      });
    }

    const templatesResult = await db.execute(sql`
      SELECT id, user_id, name, message_type, rcs_type, title, lms_title, content, lms_content,
             variable_schema, image_url, status, reviewed_at, created_at, updated_at
      FROM templates
      WHERE user_id = ${request.user_id}
        AND status = 'approved'
      ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
      LIMIT 100
    `);

    return res.status(200).json({
      request: {
        id: request.id,
        userId: request.user_id,
        userEmail: request.user_email,
        companyName: request.company_name,
      },
      templates: (templatesResult.rows || []).map(mapTemplate),
    });
  } catch (error) {
    console.error('[Admin Message Copy Request Templates] Error:', error);
    return res.status(500).json({ error: '고객 전용 템플릿 조회 중 오류가 발생했습니다' });
  }
}
