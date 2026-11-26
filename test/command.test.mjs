import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { apply } from '../lib/index.js';

const realFetch = globalThis.fetch;

function stubDaemon() {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/v1/doctor')) {
      return new Response(
        JSON.stringify({ contract: 1, version: '0.2.0', features: ['context', 'search'] }),
        { status: 200 },
      );
    }
    if (u.endsWith('/api/v1/context')) {
      return new Response(JSON.stringify({ pack: '## Preferences\n- pnpm', uids: ['m_1'] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
}

function makeCtx() {
  const hooks = {};
  const commands = [];
  const ctx = {
    on: (e, f) => {
      hooks[e] = f;
    },
    get: (name) =>
      name === 'commands'
        ? { register: (def) => commands.push(def) }
        : name === 'skills'
          ? { registerProvider: () => {} }
          : undefined,
    logger: () => ({ info() {}, warn() {}, debug() {} }),
  };
  return { ctx, hooks, commands };
}

beforeEach(() => {
  process.env.ROCKYMEM_TOKEN = 'test';
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ROCKYMEM_TOKEN;
});

test('/rockymem registers and reports status', async () => {
  stubDaemon();
  const { ctx, commands, hooks } = makeCtx();
  apply(ctx, { endpoint: 'http://127.0.0.1:7432', tokenFile: '' });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, 'rockymem');

  const agent = { inject: () => {}, session: { id: 's1', header: { cwd: '/r' } } };
  await hooks['agent/created']({ agent, source: 'startup' });

  const out = await commands[0].handler({ rawInput: '' });
  assert.equal(out.kind, 'success');
  assert.match(out.text, /rocky-mem — http:\/\/127\.0\.0\.1:7432/);
  assert.match(out.text, /injected 1/);
  assert.match(out.text, /inject=on/);
});

test('/rockymem on|off toggles injection for the process', async () => {
  stubDaemon();
  const { ctx, commands, hooks } = makeCtx();
  apply(ctx, { tokenFile: '' });

  assert.equal((await commands[0].handler({ rawInput: 'off' })).kind, 'success');
  const agent = { inject: () => {}, session: { id: 's2', header: { cwd: '/r' } } };
  await hooks['agent/created']({ agent, source: 'startup' });
  const off = await commands[0].handler({ rawInput: '' });
  assert.match(off.text, /inject=off/);
  assert.match(off.text, /skipped disabled=1/);

  await commands[0].handler({ rawInput: 'on' });
  assert.match((await commands[0].handler({ rawInput: '' })).text, /inject=on/);
});
