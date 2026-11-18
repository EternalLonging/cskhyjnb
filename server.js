const http = require("http");
const fs = require("fs");
const path = require("path");
const { resolveStaticPath } = require("./static-path");

const ROOT = path.resolve(__dirname);
const PORT = 3000;
const HOST = "127.0.0.1";
const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
};

function createServer(rootDir = ROOT) {
  return http.createServer((req, res) => {
    const resolved = resolveStaticPath(rootDir, req.url);
    if (!resolved.ok) {
      res.writeHead(resolved.statusCode);
      res.end(resolved.message);
      return;
    }

    const fp = resolved.filePath;
    try {
      const stat = fs.statSync(fp);
      const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let ct = MIME[path.extname(fp).toLowerCase()] || "application/octet-stream";
      if (range && stat.isFile()) {
        const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2] || 0));
        const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${stat.size}`, "Accept-Ranges": "bytes" });
          res.end();
          return;
        }
        res.writeHead(206, { "Content-Type": ct, "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
        fs.createReadStream(fp, { start, end }).pipe(res);
        return;
      }
      var data = fs.readFileSync(fp);
      if (ct.startsWith("text/") || ct === "application/javascript") ct += "; charset=utf-8";
      res.writeHead(200, { "Content-Type": ct, "Content-Length": data.length,
        "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

function startServer({ rootDir = ROOT, port = PORT, logger = console.log } = {}) {
  const server = createServer(rootDir);
  return server.listen(port, HOST, () => logger(`Server: http://${HOST}:${server.address().port}`));
}

if (require.main === module) startServer();

module.exports = { createServer, startServer, HOST, PORT, ROOT };
