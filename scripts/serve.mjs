import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/data/status.json', ['data/status.json', 'application/json; charset=utf-8']]
]);
createServer(async (request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) { response.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(`../dist/${file[0]}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }).end(body);
  } catch (error) {
    console.error('Unable to serve build:', error.message);
    response.writeHead(500).end('Build unavailable. Run npm run build first.');
  }
}).listen(4173, '127.0.0.1', () => console.log('Dashboard: http://127.0.0.1:4173'));
