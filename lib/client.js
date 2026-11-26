// REST client for rocky-mem's public contract.
//
// Only three endpoints are used, all documented in the server's docs/:
//   GET  /api/v1/doctor    capability probe (features + contract version)
//   POST /api/v1/context   standing memory for a working directory
//   POST /api/v1/search    budgeted context pack for one query
//
// The client never blocks a session: every call is bounded, failures trip a
// circuit breaker, and callers treat every error as "no context this time".

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

export function expandHome(p) {
  if (typeof p !== 'string' || p.length === 0) return p;
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

export class RockyClient {
  constructor(config, log) {
    this.endpoint = trimSlash(config.endpoint || 'http://127.0.0.1:7432');
    this.tokenFile = expandHome(config.tokenFile);
    this.doctorCacheMs = config.doctorCacheMs ?? 60_000;
    this.log = log;
    this.tokenValue = undefined;
    this.failures = 0;
    this.openUntil = 0;
    this.doctorAt = 0;
    this.doctorValue = null;
  }

  status() {
    const open = Date.now() < this.openUntil;
    return {
      endpoint: this.endpoint,
      reachable: !open && this.failures === 0,
      failures: this.failures,
      openUntil: open ? this.openUntil : 0,
      doctor: this.doctorValue,
    };
  }

  #tripped() {
    return Date.now() < this.openUntil;
  }

  #fail(err) {
    this.failures += 1;
    if (this.failures >= BREAKER_THRESHOLD) {
      this.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.failures = 0;
      this.log?.warn?.('rocky-mem: circuit open for 60s after repeated failures', err?.message ?? err);
    }
    return undefined;
  }

  #ok() {
    this.failures = 0;
  }

  async token() {
    if (this.tokenValue !== undefined) return this.tokenValue;
    const fromEnv = process.env.ROCKYMEM_TOKEN;
    if (fromEnv) {
      this.tokenValue = fromEnv.trim();
      return this.tokenValue;
    }
    if (!this.tokenFile) {
      this.tokenValue = '';
      return '';
    }
    try {
      this.tokenValue = (await readFile(this.tokenFile, 'utf8')).trim();
    } catch {
      this.tokenValue = '';
    }
    return this.tokenValue;
  }

  async #post(path, body, timeoutMs) {
    if (this.#tripped()) return undefined;
    const token = await this.token();
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      const res = await fetch(`${this.endpoint}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      this.#ok();
      return await res.json();
    } catch (err) {
      return this.#fail(err);
    }
  }

  // Capability probe. Cached; a failure returns the previous value (or null)
  // without tripping the breaker.
  async doctor() {
    if (this.doctorValue && Date.now() - this.doctorAt < this.doctorCacheMs) {
      return this.doctorValue;
    }
    if (this.#tripped()) return this.doctorValue;
    try {
      const token = await this.token();
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${this.endpoint}/api/v1/doctor`, {
        headers,
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      this.doctorValue = body;
      this.doctorAt = Date.now();
      this.#ok();
      return body;
    } catch {
      return this.doctorValue;
    }
  }

  async hasFeature(name) {
    const d = await this.doctor();
    if (!d) return false;
    const features = Array.isArray(d.features) ? d.features : [];
    return features.includes(name);
  }

  async context({ cwd, budgetTokens, timeoutMs }) {
    return this.#post('/api/v1/context', { cwd, budget_tokens: budgetTokens }, timeoutMs);
  }

  async search({ query, cwd, budgetTokens, limit, timeoutMs }) {
    return this.#post(
      '/api/v1/search',
      { query, cwd, budget_tokens: budgetTokens, limit: limit ?? 12 },
      timeoutMs,
    );
  }
}
