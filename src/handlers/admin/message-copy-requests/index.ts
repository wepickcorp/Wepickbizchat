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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = getDb();
    await ensureMessageCopyRequestsTable(db);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const whereParts = [];

    if (status && status !== 'all') {
      whereParts.push(sql`r.status = ${status}`);
    }
    if (search) {
      const pattern = `%${search}%`;
      whereParts.push(sql`(u.email ILIKE ${pattern} OR u.company_name ILIKE ${pattern} OR r.content ILIKE ${pattern})`);
    }

    const whereSql = whereParts.length
      ? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
      : sql``;

    const [requestsResult, countsResult] = await Promise.all([
      db.execute(sql`
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
        ${whereSql}
        ORDER BY
          CASE WHEN r.status = 'reviewing' THEN 0 ELSE 1 END,
          r.created_at DESC
        LIMIT 100
      `),
      db.execute(sql`
        SELECT status, count(*)::int AS count
        FROM message_copy_requests
        GROUP BY status
      `),
    ]);

    return res.status(200).json({
      requests: (requestsResult.rows || []).map(mapRequest),
      counts: (countsResult.rows || []).reduce((acc: Record<string, number>, row: any) => {
        acc[row.status] = Number(row.count || 0);
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('[Admin Message Copy Requests] Error:', error);
    return res.status(500).json({ error: '메시지 유형 요청함 조회 중 오류가 발생했습니다' });
  }
}
