import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
test('Plesk startup uses provided port, production mode and graceful signal cleanup', async () => {
  for (const port of ['3100', '/tmp/passenger-campus.sock']) {
    const signals = new EventEmitter();
    let listenTarget: unknown; let closed = false; let drained = false; let exitCode: unknown;
    const app = { prepare: async () => {}, getRequestHandler: () => async () => {}, close: async () => { closed = true; } };
    const server = { on: () => {}, listen: (value: unknown) => { listenTarget = value; }, close: (callback: () => void) => { drained = true; callback(); }, closeIdleConnections: () => {} };
    const processMock = { env: { PORT: port, NODE_ENV: 'development' }, on: signals.on.bind(signals), exit: (code: number) => { exitCode = code; } };
    vm.runInNewContext(readFileSync(new URL('../server.js', import.meta.url), 'utf8'), {
      require: (name: string) => name === 'next' ? (options: { dev: boolean }) => { assert.equal(options.dev, false); return app; } : name === 'node:http' ? { createServer: () => server } : { resolve: (value: string) => value },
      process: processMock, __dirname: '.', console, setTimeout, clearTimeout, URL,
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(listenTarget, port === '3100' ? 3100 : port);
    assert.equal(processMock.env.NODE_ENV, 'production');
    signals.emit('SIGTERM');
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(drained && closed); assert.equal(exitCode, 0);
  }
});
