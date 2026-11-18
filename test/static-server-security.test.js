const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { resolveStaticPath } = require('../static-path');
const { startServer, HOST } = require('../server');

function request(port, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, path: requestPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('resolveStaticPath rejects malformed encoding and every root escape form', () => {
  const rootDir = path.resolve('D:/example/site');

  assert.equal(resolveStaticPath(rootDir, '/%E0%A4%A').statusCode, 400);
  assert.equal(resolveStaticPath(rootDir, '/%2e%2e/secret.txt').statusCode, 403);
  assert.equal(resolveStaticPath(rootDir, '/..%5csecret.txt').statusCode, 403);
  assert.equal(resolveStaticPath(rootDir, '/../site-secret/secret.txt').statusCode, 403);

  const valid = resolveStaticPath(rootDir, '/%E4%B8%AD%E6%96%87.html?v=1');
  assert.equal(valid.ok, true);
  assert.equal(valid.filePath, path.join(rootDir, '\u4e2d\u6587.html'));
});

test('development server serves valid paths, blocks traversal, and binds to localhost', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-static-server-'));
  const rootDir = path.join(tempDir, 'site');
  const siblingDir = path.join(tempDir, 'site-secret');
  fs.mkdirSync(rootDir);
  fs.mkdirSync(siblingDir);
  fs.writeFileSync(path.join(rootDir, 'index.html'), '<h1>home</h1>');
  fs.writeFileSync(path.join(rootDir, '\u4e2d\u6587.html'), '<h1>unicode</h1>');
  fs.writeFileSync(path.join(siblingDir, 'secret.txt'), 'secret');

  const server = startServer({ rootDir, port: 0, logger: () => {} });
  t.after(async () => {
    if (server.listening) {
      server.close();
      await once(server, 'close');
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  await once(server, 'listening');

  const address = server.address();
  assert.equal(address.address, HOST);

  const home = await request(address.port, '/');
  assert.equal(home.statusCode, 200);
  assert.equal(home.body.toString('utf8'), '<h1>home</h1>');
  assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(home.headers['cache-control'], 'no-cache');

  const unicode = await request(address.port, '/%E4%B8%AD%E6%96%87.html?v=1');
  assert.equal(unicode.statusCode, 200);
  assert.equal(unicode.body.toString('utf8'), '<h1>unicode</h1>');

  fs.writeFileSync(path.join(rootDir, 'sample.mp3'), Buffer.from([0, 1, 2, 3, 4, 5]));
  const audio = await request(address.port, '/sample.mp3', { Range: 'bytes=2-4' });
  assert.equal(audio.statusCode, 206);
  assert.equal(audio.headers['content-type'], 'audio/mpeg');
  assert.equal(audio.headers['content-range'], 'bytes 2-4/6');
  assert.deepEqual(audio.body, Buffer.from([2, 3, 4]));

  assert.equal((await request(address.port, '/%E0%A4%A')).statusCode, 400);
  assert.equal((await request(address.port, '/%2e%2e/site-secret/secret.txt')).statusCode, 403);
  assert.equal((await request(address.port, '/..%5csite-secret%5csecret.txt')).statusCode, 403);
});
