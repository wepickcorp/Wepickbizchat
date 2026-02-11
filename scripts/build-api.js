const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['src/api-router.ts'],
  bundle: true,
  outfile: 'api/router.js',
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  logLevel: 'info',
  plugins: [{
    name: 'resolve-project-paths',
    setup(build) {
      // 상대경로 중 shared/ 포함된 import를 프로젝트 루트 shared/로 해석
      build.onResolve({ filter: /\.\.\/.*shared/ }, (args) => {
        const idx = args.path.indexOf('shared/');
        if (idx !== -1) {
          const rest = args.path.substring(idx);
          return { path: path.resolve(rest) };
        }
      });
      // 상대경로 중 server/ 포함된 import도 프로젝트 루트로 해석
      build.onResolve({ filter: /\.\.\/.*server/ }, (args) => {
        const idx = args.path.indexOf('server/');
        if (idx !== -1) {
          const rest = args.path.substring(idx);
          return { path: path.resolve(rest) };
        }
      });
    }
  }]
}).catch(() => process.exit(1));
