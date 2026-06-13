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
}

function mapRequest(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    status: row.status,
    adminId: row.admin_id,
    adminNote: row.admin_note,
    rejectionReason: row.rejection_reason,
    templateId: row.template_id,
    promotedTemplateId: row.promoted_template_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  const requestId = String(req.query.id || '');
  const action = String(req.body?.action || '');
  const adminNote = req.body?.adminNote ? String(req.body.adminNote) : null;
  const templateId = req.body?.templateId ? String(req.body.templateId) : null;
  const rejectionReason = req.body?.rejectionReason ? String(req.body.rejectionReason) : null;
  const statusByAction: Record<string, string> = {
    approve_private: 'approved_private',
    reject: 'rejected',
    promote: 'promoted',
    review: 'reviewing',
  };
  const nextStatus = statusByAction[action];

  if (!requestId) return res.status(400).json({ error: '메시지 유형 요청 ID가 필요합니다' });
  if (!nextStatus) return res.status(400).json({ error: 'Invalid action' });
  if (action === 'approve_private' && !templateId) {
    return res.status(400).json({ error: '고객 전용으로 반영할 템플릿을 선택해주세요' });
  }
  if (action === 'reject' && !rejectionReason) {
    return res.status(400).json({ error: '보완 요청 내용을 입력해주세요' });
  }

  try {
    const db = getDb();
    await ensureMessageCopyRequestsTable(db);
    if (templateId) {
      const templateResult = await db.execute(sql`
        SELECT t.id
        FROM templates t
        JOIN message_copy_requests r ON r.user_id = t.user_id
        WHERE r.id = ${requestId}
          AND t.id = ${templateId}
          AND t.status = 'approved'
        LIMIT 1
      `);
      if (!templateResult.rows?.[0]) {
        return res.status(400).json({ error: '요청 고객에게 승인된 템플릿만 연결할 수 있습니다' });
      }
    }

    const result = await db.execute(sql`
      UPDATE message_copy_requests
      SET
        status = ${nextStatus},
        admin_id = ${admin.id},
        admin_note = ${adminNote},
        template_id = COALESCE(${templateId}, template_id),
        rejection_reason = ${rejectionReason},
        reviewed_at = CASE WHEN ${nextStatus} = 'reviewing' THEN NULL ELSE now() END,
        updated_at = now()
      WHERE id = ${requestId}
      RETURNING *
    `);

    if (!result.rows?.[0]) {
      return res.status(404).json({ error: '메시지 유형 요청을 찾을 수 없습니다' });
    }

    return res.status(200).json({
      success: true,
      request: mapRequest(result.rows[0]),
    });
  } catch (error) {
    console.error('[Admin Message Copy Request Process] Error:', error);
    return res.status(500).json({ error: '메시지 유형 요청 처리 중 오류가 발생했습니다' });
  }
}
