// Minimal dependency-free static server for local testing of ./public.
// Usage: node scripts/serve.js [port]   (default 8080)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(root, normalize(path));
    if (!file.startsWith(root)) throw Object.assign(new Error("forbidden"), { code: 403 });
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(err.code === 403 ? 403 : 404, { "Content-Type": "text/plain" });
    res.end(err.code === 403 ? "Forbidden" : "Not found");
  }
}).listen(port, () => console.log(`Serving ${root}\n  http://localhost:${port}/case-studies-playground.html`));
