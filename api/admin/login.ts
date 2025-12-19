import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { admins, adminLogs } from './lib/schema';
import crypto from 'crypto';

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not configured');
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema: { admins, adminLogs } });
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + (process.env.ADMIN_SALT || 'wepick-admin-salt')).digest('hex');
}

function generateToken(adminId: string): string {
  const payload = {
    adminId,
    exp: Date.now() + (2 * 60 * 60 * 1000),
  };
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', process.env.ADMIN_JWT_SECRET || 'wepick-admin-secret').update(data).digest('hex');
  return Buffer.from(JSON.stringify({ data, signature })).toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요' });
  }

  try {
    const db = getDb();
    
    const admin = await db.select()
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);

    if (admin.length === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const adminUser = admin[0];

    if (!adminUser.isActive) {
      return res.status(401).json({ error: '비활성화된 계정입니다' });
    }

    const hashedPassword = hashPassword(password);
    if (adminUser.passwordHash !== hashedPassword) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    await db.update(admins)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(admins.id, adminUser.id));

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                      req.headers['x-real-ip'] as string || 
                      'unknown';

    await db.insert(adminLogs).values({
      adminId: adminUser.id,
      action: 'login',
      targetType: 'admin',
      targetId: adminUser.id,
      details: { email: adminUser.email },
      ipAddress,
    });

    const token = generateToken(adminUser.id);

    return res.status(200).json({
      success: true,
      token,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return res.status(500).json({ error: '로그인 중 오류가 발생했습니다' });
  }
}
