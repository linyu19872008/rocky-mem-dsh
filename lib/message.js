// Message construction, with no runtime dependency on the harness packages.
//
// `agent.inject()` expects a durable UserMessage: { id, role, content, source },
// immutable. The canonical helper lives in `@deepseek-ai/dsh-llm`, but that
// package is installed inside the harness checkout, not in a plugin profile, so
// a bare import fails from a profile-installed bundle. Its implementation is
// small and stable enough to mirror:
//
//   createMessage(input) = deepFreeze(structuredClone({ ...input, id: randomUUID() }))
//
// We try the real constructor first and keep the local one for the case where it
// cannot be resolved. Both produce the same runtime shape: `MessageId` is a
// branded string, so a UUID is exactly what the harness expects.

import { randomUUID } from 'node:crypto';

export function freezeDeep(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return value;
}

/**
 * Build a detached, deeply frozen user message.
 * @param {{ content: readonly unknown[], source: object }} input
 * @returns {Readonly<{ id: string, role: 'user', content: readonly unknown[], source: object }>}
 */
export function createUserMessageLocal({ content, source }) {
  return freezeDeep(
    structuredClone({
      id: randomUUID(),
      role: 'user',
      content,
      source,
    }),
  );
}

let upstream;

/**
 * Resolve the harness constructor once. Returns:
 *   { factory, source: 'harness' | 'local' }
 */
export async function resolveMessageFactory(log) {
  if (upstream !== undefined) return upstream;
  try {
    const mod = await import('@deepseek-ai/dsh-llm');
    if (typeof mod.createUserMessage === 'function') {
      upstream = { factory: mod.createUserMessage, source: 'harness' };
      return upstream;
    }
    log?.warn?.('rocky-mem: @deepseek-ai/dsh-llm has no createUserMessage; using the local factory');
  } catch (err) {
    log?.debug?.(`rocky-mem: using the local message factory (${err?.code ?? err?.message ?? err})`);
  }
  upstream = { factory: createUserMessageLocal, source: 'local' };
  return upstream;
}

/** Test seam: forget the resolved factory. */
export function resetMessageFactory() {
  upstream = undefined;
}
