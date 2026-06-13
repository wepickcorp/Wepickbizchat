import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { admins } from '../../shared/schema';
import crypto from 'crypto';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema: { admins } });
}

function verifyToken(token: string): { adminId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const { data, signature } = decoded;

    const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET!).update(data).digest('hex');
    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) {
      return null;
    }

    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const verified = verifyToken(token);

  if (!verified) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const db = getDb();

    const admin = await db.select()
      .from(admins)
      .where(eq(admins.id, verified.adminId))
      .limit(1);

    if (admin.length === 0 || !admin[0].isActive) {
      return res.status(401).json({ error: 'Admin not found or inactive' });
    }

    const adminUser = admin[0];

    return res.status(200).json({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    });
  } catch (error) {
    console.error('[Admin Me] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch admin info' });
  }
}
