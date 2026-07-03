const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = "D:/shuatiwangzhan/1";
const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

http.createServer((req, res) => {
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";
  try { url = decodeURIComponent(url); } catch(e) {}
  const fp = path.join(ROOT, url);
  try {
    const data = fs.readFileSync(fp);
    var ct = MIME[path.extname(fp)] || "application/octet-stream";
    if (ct.startsWith("text/") || ct === "application/javascript") ct += "; charset=utf-8";
    res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(3000, () => console.log("Server: http://localhost:3000"));
