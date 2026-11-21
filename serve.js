// 로컬 테스트 서버: node serve.js → http://localhost:5180
const http = require('http'), fs = require('fs'), path = require('path');
const T = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8' };
http.createServer((q, r) => {
  let f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(__dirname)) { r.writeHead(403); return r.end(); }
  if (f.endsWith(path.sep)) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(5180, () => console.log('http://localhost:5180'));
