const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PORT = 3000;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
};

// ── Cloudflare Tunnel ──
let tunnelProcess = null;
let tunnelUrl = '';
let tunnelEnabled = false;

function findCloudflared() {
  const candidates = [
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(__dirname, 'cloudflared.exe'),
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" version`, { timeout: 5000, stdio: 'pipe' });
      return c;
    } catch (_) {}
  }
  return null;
}

function startTunnel(port) {
  if (tunnelProcess) return;
  const bin = findCloudflared();
  if (!bin) { console.log('cloudflared not found — tunnel disabled'); return; }
  console.log(`Starting tunnel: ${bin} tunnel --url http://localhost:${port}`);
  tunnelProcess = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  const checkUrl = (data) => {
    const text = data.toString();
    console.log('[tunnel]', text.trim());
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { tunnelUrl = m[0]; tunnelEnabled = true; console.log('[tunnel] URL detected:', tunnelUrl); }
  };
  tunnelProcess.stdout.on('data', checkUrl);
  tunnelProcess.stderr.on('data', (data) => {
    stderr += data.toString();
    checkUrl(data);
  });
  tunnelProcess.on('close', (code) => {
    console.log(`Tunnel exited (code ${code})`);
    tunnelProcess = null;
    if (code !== 0) { tunnelEnabled = false; tunnelUrl = ''; }
    if (code !== 0) setTimeout(() => { if (!tunnelProcess) startTunnel(port); }, 3000);
  });
}
const AI_PROXY_PORT = Number(process.env.AI_PROXY_PORT || 8787);
const AI_PROXY_TOKEN = process.env.AI_PROXY_TOKEN || '';
const AI_PROXY_UPSTREAM = process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434/api/chat';
const AI_PROXY_RATE_MAX = Number(process.env.AI_PROXY_RATE_MAX || 30);
const buckets = new Map();

// 尝试从 ai-proxy-config.json 读取配置（多重路径查找：EXE 同目录、资源目录、项目目录）
function findProxyConfigPath() {
  const candidates = [
    // 便携版 EXE 所在目录（electron-builder portable 设此环境变量）
    process.env.PORTABLE_EXECUTABLE_DIR,
    // 打包后 EXE 所在目录
    app.isPackaged ? path.dirname(app.getPath('exe')) : null,
    // 打包后的 resources 目录
    app.isPackaged ? process.resourcesPath : null,
    // 当前工作目录
    process.cwd(),
    // 开发时的项目目录
    __dirname,
  ].filter(Boolean);
  for (const dir of candidates) {
    const p = path.join(dir, 'ai-proxy-config.json');
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  // fallback: 返回 EXE 目录路径（即使文件不存在，方便用户放）
  const fallbackDir = process.env.PORTABLE_EXECUTABLE_DIR
    || (app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname);
  return path.join(fallbackDir, 'ai-proxy-config.json');
}

function loadProxyConfig() {
  try {
    const cfgPath = findProxyConfigPath();
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      return {
        port: Number(cfg.port || 8787),
        token: String(cfg.token || ''),
        upstream: String(cfg.upstream || 'http://127.0.0.1:11434/api/chat'),
        rateMax: Number(cfg.rateMax || 30),
      };
    }
  } catch (_) {}
  return { port: AI_PROXY_PORT, token: AI_PROXY_TOKEN, upstream: AI_PROXY_UPSTREAM, rateMax: AI_PROXY_RATE_MAX };
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function allowedByRateLimit(req, rateMax) {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = buckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count <= rateMax;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) { req.destroy(); reject(new Error('Payload too large')); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── AI 代理服务器（对外）──
function createAiProxyServer(proxyCfg) {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST' || req.url.split('?')[0] !== '/api/chat') {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (proxyCfg.token) {
      const auth = String(req.headers.authorization || '');
      if (auth !== `Bearer ${proxyCfg.token}`) {
        res.writeHead(401, { 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }
    if (!allowedByRateLimit(req, proxyCfg.rateMax)) {
      res.writeHead(429, { 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }
    try {
      const body = await readBody(req);
      const upstream = await fetch(proxyCfg.upstream, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      res.writeHead(upstream.status, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': upstream.headers.get('content-type') || 'application/x-ndjson',
      });
      if (upstream.body) {
        for await (const chunk of upstream.body) res.write(chunk);
        res.end();
      } else {
        res.end(await upstream.text());
      }
    } catch (err) {
      const msg = err.message || String(err) || 'unknown';
      console.error('[ai-proxy] upstream error:', msg);
      console.error('[ai-proxy] stack:', err.stack || '');
      res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: msg, stack: String(err.stack || '') }));
    }
  });
}

function sendJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ── 静态文件服务器 ──
function createServer(rootDir) {
  return http.createServer((req, res) => {
    // 公网隧道状态查询
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/tunnel-status') {
      sendJson(res, { enabled: tunnelEnabled, url: tunnelUrl, running: !!tunnelProcess });
      return;
    }

    // 本机 AI 代理：127.0.0.1:3000/api/chat → 转发到 Ollama
    if (req.method === 'POST' && req.url.split('?')[0] === '/api/chat') {
      handleLocalAiProxy(req, res);
      return;
    }

    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    const filePath = path.join(rootDir, url);
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

// 本机代理：把 /api/chat 转发到 Ollama（无鉴权，仅 127.0.0.1 可用）
function handleLocalAiProxy(req, res) {
  const headers = { 'Content-Type': 'application/json' };
  (async () => {
    try {
      const body = await readBody(req);
      const upstream = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST', headers, body,
      });
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
      if (upstream.body) {
        for await (const chunk of upstream.body) res.write(chunk);
        res.end();
      } else {
        res.end(await upstream.text());
      }
    } catch (err) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    }
  })();
}

let server, aiProxyServer;

app.whenReady().then(() => {
  const rootDir = path.join(__dirname);

  // 启动主应用服务器（127.0.0.1:3000）
  server = createServer(rootDir);
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`App server at http://127.0.0.1:${PORT}`);

    const win = new BrowserWindow({
      width: 1200, height: 800,
      title: '超时空辉夜姬',
      icon: path.join(rootDir, '3.png'),
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    win.setMenuBarVisibility(false);
    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  // 启动 AI 代理服务器（0.0.0.0，可被局域网/公网访问）
  const cfgPath = findProxyConfigPath();
  const proxyCfg = loadProxyConfig();
  console.log(`Config path: ${cfgPath}, found=${fs.existsSync(cfgPath)}, token=${proxyCfg.token ? '***' : '(none)'}`);
  if (proxyCfg.token) {
    aiProxyServer = createAiProxyServer(proxyCfg);
    aiProxyServer.listen(proxyCfg.port, '0.0.0.0', () => {
      console.log(`AI proxy on http://0.0.0.0:${proxyCfg.port}/api/chat (token=${proxyCfg.token ? '***' : 'none'})`);
      // 代理启动后自动开启 Cloudflare Tunnel
      startTunnel(proxyCfg.port);
    });
  } else {
    console.log('AI proxy disabled — set "token" in ai-proxy-config.json to enable');
  }
});

app.on('window-all-closed', () => {
  if (tunnelProcess) { tunnelProcess.kill(); tunnelProcess = null; }
  if (server) server.close();
  if (aiProxyServer) aiProxyServer.close();
  app.quit();
});
