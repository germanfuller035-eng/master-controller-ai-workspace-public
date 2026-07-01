// ============================================================
//  Dashboard Static Server — Node.js (без внешних пакетов)
//  Версия: 2026-05-26
//  Root: D:\AI_WORKSPACE
//  Port: 8787  |  Bind: 127.0.0.1
//  Безопасность: не читает .env, не читает AI_SECRETS,
//                не делает внешних запросов
// ============================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 8787;
const BIND = '127.0.0.1';
const ROOT = 'D:\\AI_WORKSPACE';

// Блокировать доступ к секретным папкам/файлам
const BLOCKED_PATHS = [
  'AI_SECRETS',
  '.env',
  '.env.',
  'secrets.',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
};

function isBlocked(urlPath) {
  const normalized = urlPath.replace(/\\/g, '/').toLowerCase();
  for (const b of BLOCKED_PATHS) {
    if (normalized.includes(b.toLowerCase())) return true;
  }
  return false;
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>AI Workspace Dashboard Server</title>
<style>body{font-family:monospace;background:#1a1a2e;color:#e0e0e0;padding:40px;}
a{color:#00d4ff;}h1{color:#00d4ff;}
.box{background:#16213e;padding:20px;border-radius:8px;margin:20px 0;border:1px solid #0f3460;}
</style></head>
<body>
<h1>🖥 AI Workspace — Dashboard Server</h1>
<div class="box">
  <b>Сервер работает</b> на <code>http://127.0.0.1:8787/</code><br><br>
  <a href="/09_dashboards/visual_master_dashboard.html">
    📊 Открыть Visual Master Dashboard
  </a>
</div>
<div class="box">
  <b>Root:</b> D:\\AI_WORKSPACE<br>
  <b>Port:</b> 8787<br>
  <b>Bind:</b> 127.0.0.1 (только локально)<br>
  <b>Engine:</b> Node.js (без npm-пакетов)
</div>
</body></html>`;

const server = http.createServer((req, res) => {
  const timestamp = new Date().toISOString();
  const rawUrl = req.url || '/';

  // Лог каждого запроса
  console.log(`[${timestamp}] ${req.method} ${rawUrl}`);

  // Корень — отдать index page
  if (rawUrl === '/' || rawUrl === '') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }

  // Декодировать URL
  let urlDecoded;
  try {
    urlDecoded = decodeURIComponent(rawUrl.split('?')[0]);
  } catch {
    res.writeHead(400); res.end('Bad Request'); return;
  }

  // Блокировать секреты
  if (isBlocked(urlDecoded)) {
    console.warn(`  [BLOCKED] ${urlDecoded}`);
    res.writeHead(403); res.end('403 Forbidden'); return;
  }

  // Собрать путь к файлу
  const safePath = urlDecoded.replace(/\//g, path.sep).replace(/\.\./g, '');
  const filePath = path.join(ROOT, safePath);

  // Проверить что путь внутри ROOT (защита от path traversal)
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('403 Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${urlDecoded}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => {
      console.error(`  [ERROR] Stream: ${e.message}`);
      res.end();
    });
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  [ОШИБКА] Порт ${PORT} уже занят!`);
    console.error(`  Найдите PID: netstat -ano | findstr :${PORT}`);
    console.error(`  Убейте:      taskkill /PID <PID> /F`);
    console.error(`  Затем перезапустите сервер.\n`);
  } else {
    console.error(`  [ОШИБКА] Сервер: ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, BIND, () => {
  console.log('');
  console.log('  =====================================================');
  console.log(`   Dashboard Static Server — Node.js`);
  console.log(`   URL:  http://${BIND}:${PORT}/`);
  console.log(`   Dashboard: http://${BIND}:${PORT}/09_dashboards/visual_master_dashboard.html`);
  console.log(`   Root: ${ROOT}`);
  console.log('   Нажмите Ctrl+C для остановки.');
  console.log('  =====================================================');
  console.log('');
});
