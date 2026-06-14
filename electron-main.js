const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

// Simple static file server
function createServer(rootDir) {
  return http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';

    const filePath = path.join(rootDir, url);

    // Security: prevent directory traversal
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

let server;

app.whenReady().then(() => {
  const rootDir = path.join(__dirname);

  server = createServer(rootDir);
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      title: '超时空辉夜姬',
      icon: path.join(rootDir, '3.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.setMenuBarVisibility(false);
    win.loadURL(`http://127.0.0.1:${PORT}`);

    // Don't open external links in the app window
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});
