import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createUserMessageLocal, freezeDeep } from '../lib/message.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('local factory produces a durable user message', () => {
  const m = createUserMessageLocal({
    content: [{ type: 'text', text: 'hello' }],
    source: { kind: 'plugin:rocky-mem' },
  });
  assert.match(m.id, UUID);
  assert.equal(m.role, 'user');
  assert.equal(m.content[0].text, 'hello');
  assert.equal(m.source.kind, 'plugin:rocky-mem');
});

test('local factory deep-freezes its result', () => {
  const m = createUserMessageLocal({ content: [{ type: 'text', text: 'x' }], source: { kind: 'k' } });
  assert.ok(Object.isFrozen(m));
  assert.ok(Object.isFrozen(m.content));
  assert.ok(Object.isFrozen(m.content[0]));
  assert.throws(() => {
    m.content[0].text = 'mutated';
  }, TypeError);
});

test('freezeDeep walks nested objects', () => {
  const v = freezeDeep({ a: { b: { c: 1 } } });
  assert.ok(Object.isFrozen(v.a.b));
});
