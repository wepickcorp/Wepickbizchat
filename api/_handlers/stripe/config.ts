import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    return res.status(200).json({ publishableKey });
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    return res.status(500).json({ error: 'Failed to get Stripe config' });
  }
}
