// ollama-public-api-server.js
// A tiny public API proxy for Ollama's /api/chat endpoint.
//
// Usage on a server with Node 18+:
//   $env:OLLAMA_UPSTREAM="http://127.0.0.1:11434/api/chat"
//   $env:AI_PROXY_TOKEN="change-me"
//   node ollama-public-api-server.js
//
// Frontend config:
//   localStorage.setItem('quiz_public_ai_endpoint_v1', 'https://your-domain.example/api/chat')
//   localStorage.setItem('quiz_public_ai_token_v1', 'change-me')

const http = require('http');

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = process.env.OLLAMA_UPSTREAM || 'http://127.0.0.1:11434/api/chat';
const TOKEN = process.env.AI_PROXY_TOKEN || '';
const ALLOW_ORIGIN = process.env.AI_PROXY_ALLOW_ORIGIN || '*';
const RATE_WINDOW_MS = Number(process.env.AI_PROXY_RATE_WINDOW_MS || 60_000);
const RATE_MAX = Number(process.env.AI_PROXY_RATE_MAX || 30);
const buckets = new Map();

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function allowedByRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = buckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > RATE_WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count <= RATE_MAX;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/api/chat') {
    send(res, 404, { error: 'Not found' });
    return;
  }
  if (TOKEN) {
    const auth = String(req.headers.authorization || '');
    if (auth !== `Bearer ${TOKEN}`) {
      send(res, 401, { error: 'Unauthorized' });
      return;
    }
  }
  if (!allowedByRateLimit(req)) {
    send(res, 429, { error: 'Rate limit exceeded' });
    return;
  }

  try {
    const body = await readBody(req);
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    res.writeHead(upstream.status, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': upstream.headers.get('content-type') || 'application/x-ndjson'
    });

    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    } else {
      res.end(await upstream.text());
    }
  } catch (err) {
    send(res, 502, { error: err.message || String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`AI proxy listening on http://0.0.0.0:${PORT}/api/chat`);
  console.log(`Upstream: ${UPSTREAM}`);
});
