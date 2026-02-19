const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

function resolveFile(basePath) {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
  if (fs.existsSync(basePath) && !fs.statSync(basePath).isDirectory()) return basePath;
  for (const ext of extensions) {
    const full = basePath + ext;
    if (fs.existsSync(full)) return full;
  }
  return null;
}

esbuild.build({
  entryPoints: [path.join(projectRoot, 'src/api-router.ts')],
  bundle: true,
  outfile: path.join(projectRoot, 'api/router.js'),
  platform: 'node',
  format: 'esm',
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: [
      "import { createRequire as __cr } from 'module';",
      "import { fileURLToPath as __fu } from 'url';",
      "import { dirname as __dn } from 'path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __fu(import.meta.url);",
      "const __dirname = __dn(__filename);"
    ].join('\n')
  },
  tsconfig: path.join(projectRoot, 'tsconfig.json'),
  plugins: [{
    name: 'resolve-handler-paths',
    setup(build) {
      // src/handlers/ 내 파일의 상대경로 import를 원래 api/ 위치 기준으로 해석
      const dotdotRe = /^\.\./;
      build.onResolve({ filter: dotdotRe }, (args) => {
        const handlerPrefix = path.join(projectRoot, 'src', 'handlers') + path.sep;
        if (!args.importer.startsWith(handlerPrefix)) return undefined;

        // src/handlers/admin/me.ts → 원래 api/admin/me.ts 기준으로 해석
        const relFromHandlers = path.relative(handlerPrefix, path.dirname(args.importer));
        const originalDir = path.join(projectRoot, 'api', relFromHandlers);
        const resolved = path.resolve(originalDir, args.path);
        const found = resolveFile(resolved);
        if (found) return { path: found };

        // api/ 기준 실패 시 프로젝트 루트에서 시도
        const segments = args.path.split('/');
        for (let i = 0; i < segments.length; i++) {
          if (segments[i] !== '..') {
            const rest = segments.slice(i).join('/');
            const rootResolved = path.join(projectRoot, rest);
            const rootFound = resolveFile(rootResolved);
            if (rootFound) return { path: rootFound };
            break;
          }
        }
        return undefined;
      });
    }
  }]
}).then(() => {
  const outfile = path.join(projectRoot, 'api/router.js');
  if (!fs.existsSync(outfile)) {
    console.error('ERROR: api/router.js not created!');
    process.exit(1);
  }
  const size = Math.round(fs.statSync(outfile).size / 1024);
  console.log('API router bundled: ' + size + ' KB');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
