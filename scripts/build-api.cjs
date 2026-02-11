const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

// 확장자 없는 경로에 .ts 등을 붙여서 실제 파일 찾기
function resolveFile(basePath) {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
  if (fs.existsSync(basePath)) return basePath;
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
  format: 'cjs',
  packages: 'external',
  logLevel: 'info',
  tsconfig: path.join(projectRoot, 'tsconfig.json'),
  plugins: [{
    name: 'resolve-relative-paths',
    setup(build) {
      // src/handlers/ 내 파일에서의 상대경로 import를 프로젝트 루트 기준으로 해석
      build.onResolve({ filter: /^\.\./ }, (args) => {
        // 원래 api/ 폴더에 있었으므로, 원래 위치 기준으로 경로 계산
        // src/handlers/admin/me.ts → 원래 api/admin/me.ts
        const handlerPrefix = path.join(projectRoot, 'src', 'handlers') + path.sep;
        if (args.importer.startsWith(handlerPrefix)) {
          // src/handlers/X → api/X 로 원래 위치 복원
          const relFromHandlers = path.relative(handlerPrefix, path.dirname(args.importer));
          const originalDir = path.join(projectRoot, 'api', relFromHandlers);
          const resolved = path.resolve(originalDir, args.path);
          const found = resolveFile(resolved);
          if (found) {
            return { path: found };
          }
        }
        return undefined;
      });
    }
  }]
}).catch(() => process.exit(1));
