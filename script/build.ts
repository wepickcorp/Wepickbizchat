import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { rm, mkdir, copyFile, readdir, unlink, stat } from "fs/promises";
import path from "path";

async function copyDir(src: string, dest: string) {
  try {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  } catch (err) {
    console.warn(`Could not copy ${src}:`, err);
  }
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("build complete!");

  const result = await esbuild({
    entryPoints: ["api/router.ts"],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: "api/router.js",
    external: [],
    minify: false,
    metafile: true,
  });

  const outputSize = Object.values(result.metafile!.outputs)
    .reduce((sum, o) => sum + o.bytes, 0);
  console.log(`API router bundled: ${Math.round(outputSize / 1024)} KB`);

  async function deleteTsFiles(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await deleteTsFiles(fullPath);
        const remaining = await readdir(fullPath);
        if (remaining.length === 0) await rm(fullPath, { recursive: true });
      } else if (entry.name.endsWith('.ts') && fullPath !== 'api/router.ts') {
        await unlink(fullPath);
      }
    }
  }

  await deleteTsFiles('api');
  console.log('Cleaned .ts files from api/ (keeping only router.js bundle)');
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
