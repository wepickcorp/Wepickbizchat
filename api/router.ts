// This file is overwritten by esbuild during build
export default function handler(req: any, res: any) {
  res.status(500).json({ error: 'Build not completed' });
}
