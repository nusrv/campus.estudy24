// Requires a successful build. Uses only GET requests; never changes PostgreSQL.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { once } = require('node:events');
async function main() {
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  try {
    let response;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error('Startup file exited before readiness.');
      try { response = await fetch(origin + '/design-system', { signal: AbortSignal.timeout(1000) }); if (response.ok) break; } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(response?.status, 200);
    const html = await response.text();
    const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"<>]*\/_next\/static\/[^"<>]+)"/g)].map(match => match[1].replaceAll('&amp;', '&')))];
    assert.ok(assets.some(url => url.endsWith('.css')), 'No production stylesheet.');
    assert.ok(assets.some(url => url.endsWith('.js')), 'No production JavaScript.');
    let fonts = 0;
    for (const asset of assets) {
      const result = await fetch(new URL(asset, origin));
      assert.equal(result.status, 200, asset);
      if (asset.endsWith('.css')) {
        assert.match(result.headers.get('content-type') || '', /text\/css/);
        const css = await result.text();
        for (const match of css.matchAll(/url\((?:["']?)([^)"']+\.woff2?)(?:["']?)\)/g)) {
          const font = await fetch(new URL(match[1], new URL(asset, origin)));
          assert.equal(font.status, 200, 'Production font missing'); fonts++;
        }
      }
      if (asset.endsWith('.js')) assert.match(result.headers.get('content-type') || '', /javascript/);
    }
    assert.ok(fonts > 0, 'No bundled Arabic fonts checked.');
    for (const url of ['/.env', '/.git/config', '/package.json', '/server.js', '/prisma/schema.prisma']) {
      const result = await fetch(origin + url);
      assert.ok([403, 404].includes(result.status), 'Private file exposed: ' + url);
    }
    console.log(`Production startup passed: ${assets.length} CSS/JS/preload assets, ${fonts} font requests, 5 private-file denials. No copying.`);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 12000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
main().catch(() => { console.error('Production startup/asset verification failed.'); process.exitCode = 1; });
