import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "site");
const port = Number(process.env.PORT || 4180);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    const target = path.join(root, file);
    if (!target.startsWith(root + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("forbidden");
      return;
    }
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        "Content-Type": types[path.extname(target).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`agent-loop server http://127.0.0.1:${port}`);
  });
