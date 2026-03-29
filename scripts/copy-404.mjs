import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = join(root, "dist", "index.html");
const notFound = join(root, "dist", "404.html");

if (existsSync(indexHtml)) {
  copyFileSync(indexHtml, notFound);
  console.log("Wrote dist/404.html (GitHub Pages SPA fallback)");
} else {
  console.warn("copy-404: dist/index.html missing — run vite build first");
  process.exitCode = 1;
}
