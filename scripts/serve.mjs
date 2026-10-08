import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, RUNTIME_FILES } from './runtime.mjs';

const args = process.argv.slice(2);
const requestedPort = args.length === 0 ? 8780
  : args.length === 2 && args[0] === '--port' ? Number(args[1]) : NaN;
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
  console.error('Usage: npm run dev -- --port 8780 (port 1024–65535)');
  process.exit(1);
}
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  function answer(status, body, extra = {}) {
    response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
    response.end(request.method === 'HEAD' ? undefined : body);
  }
  if (!['GET', 'HEAD'].includes(request.method)) return answer(405, 'Method not allowed', { Allow: 'GET, HEAD' });
  try {
    const host = new URL(`http://${request.headers.host ?? ''}`).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) return answer(403, 'Loopback requests only');
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    // An allowlist also excludes dotfiles, source tests, traversal and folders.
    if (!RUNTIME_FILES.includes(name)) return answer(404, 'Not found');
    const bytes = await readFile(path.join(ROOT, name));
    answer(200, bytes, { 'Content-Type': types[path.extname(name)], 'Content-Length': bytes.length });
  } catch (error) {
    answer(error.code === 'ENOENT' ? 404 : 400, error.code === 'ENOENT' ? 'Not found' : 'Bad request');
  }
});
server.on('error', error => {
  console.error(`Preview failed: ${error.code === 'EADDRINUSE' ? `Port ${requestedPort} is already in use.` : error.message}`);
  process.exitCode = 1;
});
server.listen(requestedPort, '127.0.0.1', () => console.log(`Breathing Room: http://127.0.0.1:${requestedPort}/`));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
