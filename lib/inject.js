// Session-start and pre-step injection.
//
// Mechanism (verified against @claude-mem/dsh and the Host docs):
//   agent/created   → agent.inject(message) queues context for the next pre-step
//   agent/pre-step  → waterfall; wrapping next() lets us append a message
//
// Every failure path returns "no injection". A memory service that is down must
// never slow down or break a session.

import { resolveMessageFactory } from './message.js';

const WRAP_CLOSE = '</rockymem-context>';

const FOOTER = [
  'If an item above contradicts what you actually observe, call mem_feedback',
  'with outcome=wrong and a short note instead of silently ignoring it.',
  'Before a non-trivial task, call mem_search with the symptom or error text.',
].join(' ');

export function wrapPack(pack, kind) {
  const open = `<rockymem-context kind="${kind}">`;
  return [open, pack.trim(), WRAP_CLOSE, '', FOOTER].join('\n');
}

async function buildMessage(text, log) {
  const { factory } = await resolveMessageFactory(log);
  return factory({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin:rocky-mem' },
  });
}

function textOf(message) {
  if (!message || message.source?.kind === 'plugin:rocky-mem') return '';
  const blocks = message.content;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function looksLikeSubagent(agent) {
  const header = agent?.session?.header;
  if (!header) return false;
  return Boolean(
    header.parentSessionId ||
      header.parent ||
      header.delegatedFrom ||
      header.subagentOf ||
      header.lineage?.parent,
  );
}

function shortHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function createInjector({ client, config, log, stats }) {
  const seen = new Map(); // sessionId -> Set(hashes)
  const tally = stats ?? { injected: 0, skipped: Object.create(null) };
  const skip = (reason) => {
    tally.skipped[reason] = (tally.skipped[reason] ?? 0) + 1;
  };

  function seenIn(sessionId) {
    let set = seen.get(sessionId);
    if (!set) {
      set = new Set();
      seen.set(sessionId, set);
      if (seen.size > 200) {
        const oldest = seen.keys().next().value;
        seen.delete(oldest);
      }
    }
    return set;
  }

  async function injectText(agent, text, kind) {
    if (!agent || typeof agent.inject !== 'function') return false;
    const message = await buildMessage(text, log);
    agent.inject(message);
    tally.injected += 1;
    log?.info?.(`rocky-mem: injected ${kind} context (${text.length} chars)`);
    return true;
  }

  async function onCreated(event) {
    if (!config.inject.enabled) return skip('disabled');
    const agent = event?.agent;
    const source = event?.source ?? event?.sessionSource ?? 'startup';
    if (!config.inject.onSources.includes(source)) return skip(`source:${source}`);
    if (looksLikeSubagent(agent)) return skip('subagent');
    if (!(await client.hasFeature('context'))) return skip('no-feature');
    const cwd = agent?.session?.header?.cwd;
    const result = await client.context({
      cwd,
      budgetTokens: config.inject.budgetTokens,
      timeoutMs: config.inject.timeoutMs,
    });
    const pack = result?.pack;
    if (!pack || !String(pack).trim()) return skip(result ? 'empty-pack' : 'unreachable');
    await injectText(agent, wrapPack(pack, 'standing'), 'standing');
  }

  async function onPreStep(payload, next) {
    const decision = await next();
    if (!config.preStep.enabled) return decision;
    if (!decision || decision.kind !== 'enter') return decision;
    if (payload?.turn !== 1 || payload?.step !== 1) return decision;

    const agent = payload?.agent;
    if (!agent || looksLikeSubagent(agent)) return decision;

    const messages = Array.isArray(decision.messages) ? decision.messages : [];
    const prompt = messages.map(textOf).find((t) => t.length >= config.preStep.minPromptChars);
    if (!prompt) return decision;
    if (prompt.startsWith('/') || prompt.startsWith('!')) return decision;

    const sessionId = agent?.session?.id ?? 'unknown';
    const key = shortHash(prompt);
    const set = seenIn(sessionId);
    if (set.has(key)) return decision;
    set.add(key);

    const result = await client.search({
      query: prompt.slice(0, 500),
      cwd: agent?.session?.header?.cwd,
      budgetTokens: config.preStep.budgetTokens,
      timeoutMs: config.preStep.timeoutMs,
    });
    const pack = result?.pack;
    if (!pack || !String(pack).trim()) {
      skip(result ? 'task:empty-pack' : 'task:unreachable');
      return decision;
    }

    // Preferences are already injected at session start. Injecting a pack again
    // only pays off when it carries experience: an `## Applies` or `## Do not
    // use` section. Measured: five of six realistic queries returned prefs only,
    // which would add ~40 tokens of duplicate noise per turn.
    const sections = Array.isArray(result.sections) ? result.sections : [];
    const hasExperience = sections.length > 0
      ? sections.some((s) => (s.name === 'applies' || s.name === 'do_not_use') && (s.count ?? 0) > 0)
      : (result.uids ?? []).some((uid) => String(uid).startsWith('e_'));
    if (!hasExperience) {
      skip('task:prefs-only');
      return decision;
    }

    const text = wrapPack(pack, 'task');
    const message = await buildMessage(text, log).catch(() => null);
    if (!message) return decision;
    log?.info?.(`rocky-mem: injected task context (${text.length} chars)`);
    return { ...decision, messages: [...messages, message] };
  }

  return { onCreated, onPreStep };
}
