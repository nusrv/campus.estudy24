// Plesk/Passenger startup entry. No build artifacts are copied or relocated.
process.env.NODE_ENV = 'production';
const http = require('node:http');
const path = require('node:path');
const next = require('next');

async function start() {
  const suppliedPort = process.env.PORT || '3000';
  const port = /^\d+$/.test(suppliedPort) ? Number(suppliedPort) : suppliedPort;
  const app = next({ dev: false, dir: __dirname });
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = http.createServer((req, res) => {
    // Never serve the source tree, even if the reverse proxy forwards such requests.
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (pathname.split('/').some(p => p.startsWith('.')) || /^\/(?:node_modules|src|prisma|docs|scripts|storage)(?:\/|$)/.test(pathname) || /^\/(?:server\.js|package(?:-lock)?\.json|next\.config\.ts|compose\.yaml|Dockerfile)$/.test(pathname)) {
      res.writeHead(404).end(); return;
    }
    Promise.resolve(handle(req, res)).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.on('error', () => { console.error('Application server failed.'); process.exit(1); });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async () => {
      let code = 0;
      try { await app.close(); }
      catch { code = 1; }
      clearTimeout(deadline);
      process.exit(code);
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  // Passenger intercepts listen(); outside Passenger PORT may be TCP or a socket path.
  if (typeof port === 'number') server.listen(port, process.env.HOST || '0.0.0.0');
  else server.listen(path.resolve(port));
}
start().catch(() => { console.error('Production startup failed. Check the build and server configuration.'); process.exit(1); });
