// Optional skill registration.
//
// The canonical skill text lives in the rocky-mem repository and is published
// as the `rocky-mem-skill` npm package. When that package is installed this
// provider serves it verbatim, so the skill never drifts from the server
// version it documents. Without the package a short embedded body keeps the
// agent oriented.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';

const require = createRequire(import.meta.url);

const FALLBACK_BODY = [
  '# rocky-mem',
  '',
  'rocky-mem stores two kinds of knowledge: **memory** (current state: preferences,',
  'facts, constraints) and **experience** (a ledger of what was tried, what worked,',
  'and when the advice stops applying).',
  '',
  '## Protocol',
  '',
  '1. Session start: `mem_context` with the working directory. Treat the returned',
  '   `## Preferences` as hard constraints.',
  '2. Before a non-trivial task: `mem_search` with the symptom or error text.',
  '   Honour `Applies when` and treat `## Do not use` as hard negatives.',
  '3. After a reusable lesson: `mem_record` with at least one evidence item.',
  '   `pending_review` is not success — say so.',
  '4. When reality contradicts an entry: `mem_feedback` with `outcome=wrong`',
  '   and a short note.',
  '',
  'Tool names may carry a host prefix (for example',
  '`mcp__rockymem__mem_search`); match on the `mem_` suffix.',
].join('\n');

const SKILL_NAME = 'rocky-mem';
const SKILL_DESCRIPTION =
  'Consult and maintain rocky-mem, the engineering experience ledger: standing ' +
  'preferences, provenance-backed lessons, and when those lessons stop applying.';

function resolveSkillDir() {
  try {
    return dirname(require.resolve('rocky-mem-skill/package.json'));
  } catch {
    return undefined;
  }
}

async function readSkillBody(dir) {
  if (!dir) return FALLBACK_BODY;
  try {
    const body = await readFile(join(dir, 'SKILL.md'), 'utf8');
    return body.trim().length > 0 ? body : FALLBACK_BODY;
  } catch {
    return FALLBACK_BODY;
  }
}

function makeProvider(log) {
  return {
    name: 'rocky-mem',
    async list() {
      const dir = resolveSkillDir();
      const candidate = {
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'rocky-mem',
        source: 'bundled',
        // Higher than a user's local skill so a local copy wins a name clash.
        rank: 1000,
        locator: { dir },
      };
      if (dir) {
        candidate.resourceBase = { kind: 'directory', path: dir.split(sep).join('/') };
      }
      return { candidates: [candidate], complete: true };
    },
    async get(candidate) {
      const { rank: _rank, locator, ...summary } = candidate;
      const content = await readSkillBody(locator?.dir);
      return { ...summary, content };
    },
  };
}

export function registerSkill(ctx, log) {
  const install = () => {
    let skills;
    try {
      skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined;
    } catch {
      skills = undefined;
    }
    if (!skills || typeof skills.registerProvider !== 'function') return false;
    try {
      skills.registerProvider(makeProvider(log));
      log?.info?.('rocky-mem: skill registered (rocky-mem-skill ' +
        (resolveSkillDir() ? 'found' : 'missing, using the embedded body') + ')');
      return true;
    } catch (err) {
      log?.warn?.('rocky-mem: skill registration failed', err?.message ?? err);
      return false;
    }
  };

  if (install()) return true;
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['skills'], () => install());
      return true;
    } catch {
      /* fall through */
    }
  }
  log?.debug?.('rocky-mem: skills service unavailable; skill not registered');
  return false;
}
