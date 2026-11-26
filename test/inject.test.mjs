import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { apply } from '../lib/index.js';

const realFetch = globalThis.fetch;

function packResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubDaemon({ context = { pack: '## Preferences\n- pnpm', uids: ['m_1'] }, search = { pack: '## Applies\n### [pitfall] x' } } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/v1/doctor')) {
      return packResponse({ contract: 1, features: ['context', 'search'] });
    }
    if (u.endsWith('/api/v1/context')) return packResponse(context);
    if (u.endsWith('/api/v1/search')) return packResponse(search);
    return packResponse({ error: 'not found' }, 404);
  };
}

function makeCtx() {
  const hooks = {};
  const providers = [];
  const logs = [];
  const log = {
    info: (m) => logs.push(['info', String(m)]),
    warn: (m) => logs.push(['warn', String(m)]),
    debug: () => {},
  };
  const ctx = {
    on: (event, fn) => {
      hooks[event] = fn;
    },
    get: (name) => (name === 'skills' ? { registerProvider: (p) => providers.push(p) } : undefined),
    logger: () => log,
  };
  return { ctx, hooks, providers, logs, log };
}

function makeAgent({ parent = false } = {}) {
  const injected = [];
  const agent = {
    inject: (m) => injected.push(m),
    session: {
      id: 's-test',
      header: { cwd: '/repo/x', ...(parent ? { parentSessionId: 'parent-1' } : {}) },
    },
  };
  return { agent, injected };
}

const config = {
  endpoint: 'http://127.0.0.1:7432',
  tokenFile: '',
  inject: { enabled: true, onSources: ['startup', 'clear'], budgetTokens: 200, timeoutMs: 50 },
  preStep: { enabled: false, budgetTokens: 200, minPromptChars: 12, timeoutMs: 50 },
};

beforeEach(() => {
  process.env.ROCKYMEM_TOKEN = 'test';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ROCKYMEM_TOKEN;
});

test('registers both hooks and the skill provider', () => {
  stubDaemon();
  const { ctx, hooks, providers } = makeCtx();
  apply(ctx, config);
  assert.deepEqual(Object.keys(hooks).sort(), ['agent/created', 'agent/pre-step']);
  assert.equal(providers.length, 1);
});

test('daemon down injects nothing and never throws', async () => {
  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  const { ctx, hooks } = makeCtx();
  apply(ctx, config);
  const { agent, injected } = makeAgent();
  await hooks['agent/created']({ agent, source: 'startup' });
  assert.equal(injected.length, 0);
});

test('startup session receives a tagged pack', async () => {
  stubDaemon();
  const { ctx, hooks } = makeCtx();
  apply(ctx, config);
  const { agent, injected } = makeAgent();
  await hooks['agent/created']({ agent, source: 'startup' });
  assert.equal(injected.length, 1);
  const text = injected[0].content[0].text;
  assert.match(text, /^<rockymem-context kind="standing">/);
  assert.match(text, /mem_feedback/);
  assert.match(injected[0].id, /^[0-9a-f-]{36}$/);
});

test('resume and subagent sessions are skipped', async () => {
  stubDaemon();
  const { ctx, hooks } = makeCtx();
  apply(ctx, config);
  const resumed = makeAgent();
  await hooks['agent/created']({ agent: resumed.agent, source: 'resume' });
  assert.equal(resumed.injected.length, 0);

  const child = makeAgent({ parent: true });
  await hooks['agent/created']({ agent: child.agent, source: 'startup' });
  assert.equal(child.injected.length, 0);
});

test('empty pack injects nothing', async () => {
  stubDaemon({ context: { pack: '   ', uids: [] } });
  const { ctx, hooks } = makeCtx();
  apply(ctx, config);
  const { agent, injected } = makeAgent();
  await hooks['agent/created']({ agent, source: 'startup' });
  assert.equal(injected.length, 0);
});

test('pre-step stays a passthrough while disabled', async () => {
  stubDaemon();
  const { ctx, hooks } = makeCtx();
  apply(ctx, config);
  const { agent } = makeAgent();
  const decision = { kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: 'a long enough prompt' }] }] };
  const out = await hooks['agent/pre-step']({ agent, messages: decision.messages, turn: 1, step: 1 }, async () => decision);
  assert.equal(out, decision);
});

test('pre-step appends once and de-duplicates the same prompt', async () => {
  stubDaemon({ search: { pack: '## Applies\n### [pitfall] x', uids: ['e_1'], sections: [{ name: 'applies', count: 1 }] } });
  const { ctx, hooks } = makeCtx();
  apply(ctx, { ...config, preStep: { ...config.preStep, enabled: true } });
  const { agent } = makeAgent();
  const decision = { kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: '滚动更新后配置丢失怎么排查' }] }] };

  const first = await hooks['agent/pre-step']({ agent, messages: decision.messages, turn: 1, step: 1 }, async () => decision);
  assert.equal(first.messages.length, 2);
  assert.match(first.messages[1].content[0].text, /kind="task"/);

  const second = await hooks['agent/pre-step']({ agent, messages: decision.messages, turn: 1, step: 1 }, async () => decision);
  assert.equal(second.messages.length, 1);
});

test('pre-step ignores short prompts and later turns', async () => {
  stubDaemon();
  const { ctx, hooks } = makeCtx();
  apply(ctx, { ...config, preStep: { ...config.preStep, enabled: true } });
  const { agent } = makeAgent();
  const short = { kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] };
  assert.equal((await hooks['agent/pre-step']({ agent, messages: short.messages, turn: 1, step: 1 }, async () => short)).messages.length, 1);

  const long = { kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: 'a long enough prompt' }] }] };
  assert.equal((await hooks['agent/pre-step']({ agent, messages: long.messages, turn: 2, step: 1 }, async () => long)).messages.length, 1);
});

test('skill provider serves a body containing the protocol', async () => {
  const { ctx, providers } = makeCtx();
  apply(ctx, config);
  const provider = providers[0];
  const { candidates } = await provider.list({});
  assert.equal(candidates[0].name, 'rocky-mem');
  const def = await provider.get(candidates[0], {});
  assert.match(def.content, /mem_record/);
});

test('pre-step skips a preferences-only pack', async () => {
  // Measured behaviour: most queries match only the standing preference, which
  // session start already injected. Re-injecting it is pure noise.
  stubDaemon({
    search: {
      pack: '## Preferences\n- pnpm',
      uids: ['m_1'],
      sections: [
        { name: 'preferences', count: 1 },
        { name: 'applies', count: 0 },
        { name: 'do_not_use', count: 0 },
      ],
    },
  });
  const { ctx, hooks } = makeCtx();
  apply(ctx, { ...config, preStep: { ...config.preStep, enabled: true } });
  const { agent } = makeAgent();
  const decision = { kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: 'a long enough prompt' }] }] };
  const out = await hooks['agent/pre-step']({ agent, messages: decision.messages, turn: 1, step: 1 }, async () => decision);
  assert.equal(out.messages.length, 1);
});
