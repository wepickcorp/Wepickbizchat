import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { rm, mkdir, copyFile, readdir, unlink, stat } from "fs/promises";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function resolveFile(basePath: string): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
  try {
    if (fs.existsSync(basePath) && !fs.statSync(basePath).isDirectory()) return basePath;
  } catch {}
  for (const ext of extensions) {
    const full = basePath + ext;
    if (fs.existsSync(full)) return full;
  }
  return null;
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();
  console.log("build complete!");

  // API 라우터 번들링
  const result = await esbuild({
    entryPoints: [path.join(projectRoot, "src/api-router.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: path.join(projectRoot, "api/router.js"),
    packages: "external",
    minify: false,
    metafile: true,
    banner: {
      js: [
        "import { createRequire as __cr } from 'module';",
        "import { fileURLToPath as __fu } from 'url';",
        "import { dirname as __dn } from 'path';",
        "const require = __cr(import.meta.url);",
        "const __filename = __fu(import.meta.url);",
        "const __dirname = __dn(__filename);",
      ].join("\n"),
    },
    plugins: [
      {
        name: "resolve-handler-paths",
        setup(build) {
          // src/handlers/ 내 파일의 상대경로를 원래 api/ 위치 기준으로 해석
          build.onResolve({ filter: /^\.\./ }, (args) => {
            const handlerPrefix = path.join(projectRoot, "src", "handlers") + path.sep;
            if (!args.importer.startsWith(handlerPrefix)) return undefined;

            const relFromHandlers = path.relative(handlerPrefix, path.dirname(args.importer));
            const originalDir = path.join(projectRoot, "api", relFromHandlers);
            const resolved = path.resolve(originalDir, args.path);
            const found = resolveFile(resolved);
            if (found) return { path: found };

            // api/ 기준 실패 시 프로젝트 루트에서 시도
            const segments = args.path.split("/");
            for (let i = 0; i < segments.length; i++) {
              if (segments[i] !== "..") {
                const rest = segments.slice(i).join("/");
                const rootResolved = path.join(projectRoot, rest);
                const rootFound = resolveFile(rootResolved);
                if (rootFound) return { path: rootFound };
                break;
              }
            }
            return undefined;
          });
        },
      },
    ],
  });

  const outputSize = Object.values(result.metafile!.outputs).reduce(
    (sum, o) => sum + o.bytes,
    0
  );
  console.log(`API router bundled: ${Math.round(outputSize / 1024)} KB`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
