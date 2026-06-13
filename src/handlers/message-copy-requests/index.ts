import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { verifyUserAuth } from '../_shared/auth';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  return drizzle(neon(databaseUrl));
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
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_message_copy_requests_user ON message_copy_requests(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_message_copy_requests_status ON message_copy_requests(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_message_copy_requests_created ON message_copy_requests(created_at DESC)`);
}

function mapRequest(row: any) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyUserAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = getDb();
    await ensureMessageCopyRequestsTable(db);

    if (req.method === 'GET') {
      const result = await db.execute(sql`
        SELECT
          r.*,
          u.email AS user_email,
          u.company_name,
          a.name AS admin_name,
          t.name AS template_name
        FROM message_copy_requests r
        LEFT JOIN users u ON u.id = r.user_id
        LEFT JOIN admins a ON a.id = r.admin_id
        LEFT JOIN templates t ON t.id = r.template_id
        WHERE r.user_id = ${auth.userId}
        ORDER BY r.created_at DESC
        LIMIT 20
      `);
      const rows = result.rows || [];

      return res.status(200).json({
        requests: rows.map(mapRequest),
        pendingCount: rows.filter((row: any) => row.status === 'reviewing').length,
      });
    }

    const content = String(req.body?.content || '').trim();
    if (content.length < 5) {
      return res.status(400).json({ error: '요청 내용을 5자 이상 입력해주세요' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: '요청 내용은 2,000자 이하로 입력해주세요' });
    }

    const inserted = await db.execute(sql`
      INSERT INTO message_copy_requests (user_id, content, status, created_at, updated_at)
      VALUES (${auth.userId}, ${content}, 'reviewing', now(), now())
      RETURNING *
    `);

    return res.status(201).json({
      success: true,
      request: mapRequest(inserted.rows?.[0]),
      notification: {
        screen: true,
        sms: false,
        message: '운영자 화면의 메시지 유형 요청함에 알림이 표시됩니다.',
      },
    });
  } catch (error) {
    console.error('[Message Copy Requests] Error:', error);
    return res.status(500).json({ error: '메시지 유형 요청 처리 중 오류가 발생했습니다' });
  }
}
