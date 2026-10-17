'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../app');
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.txt':'text/plain'};
const port = Number(process.env.PORT || 5173);
http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/fixture') {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      .replace('<title>Kick TV</title>', '<title>Kick TV — TEST FIXTURES</title>')
      .replace('<script src="js/app.js">', '<script src="/test-fixture.js"></script><script src="js/app.js">');
    res.writeHead(200, {'Content-Type':types['.html'], 'Cache-Control':'no-store'}); return res.end(html);
  }
  if (pathname === '/test-fixture.js') {
    res.writeHead(200, {'Content-Type':types['.js']}); return res.end(fs.readFileSync(path.resolve(__dirname, '../tests/browser-fixture.js')));
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'}); res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('Kick TV preview: http://127.0.0.1:' + port));
