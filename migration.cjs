// migration.cjs - 전체 마이그레이션 자동화 스크립트
// 실행: node migration.cjs
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, 'api');
const HANDLERS_DIR = path.join(ROOT, 'src', 'handlers');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

function mkdirSafe(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getAllTsFiles(dir, base) {
  base = base || dir;
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllTsFiles(full, base));
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      results.push(path.relative(base, full));
    }
  }
  return results;
}

function pathToIdentifier(relPath) {
  let p = relPath.replace(/\.ts$/, '');
  p = p.replace(/\/index$/, '');
  if (p === 'index') p = 'root';
  p = p.replace(/\[([^\]]+)\]/g, '$1');
  const parts = p.split(/[\/\-]/);
  return parts.map((part, i) => {
    if (i === 0) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('');
}

function pathToSegments(relPath) {
  let p = relPath.replace(/\.ts$/, '');
  p = p.replace(/\/index$/, '');
  if (p === 'index') return [];
  const parts = p.split('/');
  return parts.map(part => {
    const match = part.match(/^\[([^\]]+)\]$/);
    if (match) return ':' + match[1];
    return part;
  });
}

// === Step 1: api/ 스캔 ===
console.log('=== Step 1: api/ 파일 스캔 ===');
const skipFiles = ['router.ts', 'router.js', '.gitkeep'];
const tsFiles = getAllTsFiles(API_DIR).filter(f => !skipFiles.includes(path.basename(f)));
console.log('발견: ' + tsFiles.length + '개');
if (tsFiles.length === 0) {
  console.error('ERROR: api/에 .ts 파일 없음!');
  process.exit(1);
}

// === Step 2: export default 확인 ===
console.log('\n=== Step 2: export default 확인 ===');
const handlers = [];
const utilities = [];
for (const file of tsFiles) {
  const content = fs.readFileSync(path.join(API_DIR, file), 'utf8');
  if (content.includes('export default')) {
    handlers.push(file);
  } else {
    utilities.push(file);
  }
}
console.log('핸들러: ' + handlers.length + '개, 유틸리티: ' + utilities.length + '개');
utilities.forEach(f => console.log('  [유틸리티] ' + f));

// === Step 3: src/handlers/로 복사 ===
console.log('\n=== Step 3: src/handlers/로 복사 ===');
mkdirSafe(HANDLERS_DIR);
for (const file of tsFiles) {
  const dst = path.join(HANDLERS_DIR, file);
  mkdirSafe(path.dirname(dst));
  fs.copyFileSync(path.join(API_DIR, file), dst);
}
console.log(tsFiles.length + '개 파일 복사 완료');

// === Step 4: src/api-router.ts 생성 ===
console.log('\n=== Step 4: src/api-router.ts 생성 ===');
const sorted = [...handlers].sort((a, b) => pathToSegments(b).length - pathToSegments(a).length);

const L = [];
L.push("import type { VercelRequest, VercelResponse } from '@vercel/node';");
L.push('');
for (const f of sorted) {
  L.push("import * as " + pathToIdentifier(f) + " from './handlers/" + f.replace(/\.ts$/, '') + "';");
}
L.push('');
L.push('type RouteEntry = { segments: string[]; handler: any };');
L.push('');
L.push('const routes: RouteEntry[] = [');
for (const f of sorted) {
  const segs = pathToSegments(f).map(s => "'" + s + "'").join(', ');
  L.push("  { segments: [" + segs + "], handler: " + pathToIdentifier(f) + " },");
}
L.push('];');
L.push('');
L.push('function matchRoute(ps: string[]): { route: RouteEntry; params: Record<string, string> } | null {');
L.push('  for (const r of routes) {');
L.push('    if (r.segments.length !== ps.length) continue;');
L.push('    const params: Record<string, string> = {};');
L.push('    let ok = true;');
L.push('    for (let i = 0; i < r.segments.length; i++) {');
L.push("      if (r.segments[i].startsWith(':')) params[r.segments[i].slice(1)] = ps[i];");
L.push('      else if (r.segments[i] !== ps[i]) { ok = false; break; }');
L.push('    }');
L.push('    if (ok) return { route: r, params };');
L.push('  }');
L.push('  return null;');
L.push('}');
L.push('');
L.push('function getPath(req: VercelRequest): string[] {');
L.push('  const rp = req.query.path;');
L.push("  if (rp) return Array.isArray(rp) ? rp.filter(Boolean) : String(rp).split('/').filter(Boolean);");
L.push("  const u = req.url || '', i = u.indexOf('/api/');");
L.push("  if (i !== -1) return u.substring(i + 5).split('?')[0].split('/').filter(Boolean);");
L.push('  return [];');
L.push('}');
L.push('');
L.push('export default async function handler(req: VercelRequest, res: VercelResponse) {');
L.push('  const ps = getPath(req);');
L.push('  const m = matchRoute(ps);');
L.push("  if (!m) return res.status(404).json({ error: 'Not found', path: ps.join('/') });");
L.push('  for (const [k, v] of Object.entries(m.params)) (req.query as any)[k] = v;');
L.push('  try {');
L.push('    const mod = m.route.handler;');
L.push('    const fn = mod.default || mod.handler || mod;');
L.push("    if (typeof fn !== 'function') return res.status(500).json({ error: 'No handler: ' + ps.join('/') });");
L.push('    return fn(req, res);');
L.push('  } catch (e) {');
L.push("    console.error('[Router]', e);");
L.push("    return res.status(500).json({ error: 'Internal error' });");
L.push('  }');
L.push('}');

fs.writeFileSync(path.join(ROOT, 'src', 'api-router.ts'), L.join('\n') + '\n');
console.log('src/api-router.ts 생성 (' + sorted.length + '개 라우트)');

// === Step 5: api/ 정리 & placeholder ===
console.log('\n=== Step 5: api/ 정리 ===');
for (const item of fs.readdirSync(API_DIR)) {
  const p = path.join(API_DIR, item);
  if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true });
  else fs.unlinkSync(p);
}
fs.writeFileSync(path.join(API_DIR, 'router.js'),
  '// Placeholder - overwritten by esbuild during build\n' +
  'export default function handler(req, res) {\n' +
  "  res.status(503).json({ error: 'Build in progress' });\n" +
  '}\n'
);
console.log('api/ 정리 완료, router.js placeholder 생성');

// === Step 6: vercel.json ===
console.log('\n=== Step 6: vercel.json ===');
fs.writeFileSync(path.join(ROOT, 'vercel.json'), JSON.stringify({
  version: 2,
  buildCommand: "npm run build && node scripts/build-api.cjs",
  outputDirectory: "dist/public",
  framework: "vite",
  installCommand: "npm install",
  crons: [{ path: "/api/internal/master/reset-balance", schedule: "0 0 * * *" }],
  rewrites: [
    { source: "/api/(.*)", destination: "/api/router" },
    { source: "/((?!api/).*)", destination: "/index.html" }
  ],
  headers: [{
    source: "/api/(.*)",
    headers: [
      { key: "Access-Control-Allow-Credentials", value: "true" },
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
      { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" }
    ]
  }]
}, null, 2) + '\n');
console.log('vercel.json 업데이트 완료');

// === Step 7: .gitignore 정리 ===
console.log('\n=== Step 7: .gitignore 정리 ===');
const gip = path.join(ROOT, '.gitignore');
if (fs.existsSync(gip)) {
  const lines = fs.readFileSync(gip, 'utf8').split('\n').filter(l => !l.includes('api/router'));
  fs.writeFileSync(gip, lines.join('\n'));
}
console.log('.gitignore 정리 완료');

// === 완료 ===
console.log('\n========================================');
console.log('마이그레이션 완료!');
console.log('========================================');
console.log('핸들러: ' + handlers.length + ', 유틸리티: ' + utilities.length);
console.log('');
console.log('*** scripts/build-api.cjs 파일을 별도로 생성해야 합니다! ***');
console.log('*** (별도 다운로드 파일 참고) ***');
console.log('');
console.log('그 후 실행:');
console.log('  git add .');
console.log('  git commit -m "Consolidate API routes into single serverless function"');
console.log('  git push');
