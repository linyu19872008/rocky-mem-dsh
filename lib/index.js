// rocky-mem-dsh — DeepSeek Harness Host plugin.
//
// Responsibilities (deliberately narrow):
//   * when to inject context (agent/created, optionally agent/pre-step)
//   * how to degrade when the daemon is absent
//   * registering the portable skill and a /rockymem inspection command
//
// Everything about correctness — quality gates, ranking, pack assembly,
// conflict handling — belongs to the rocky-mem server, reached over its
// public contract. This plugin never reads the database.

import { RockyClient } from './client.js';
import { createInjector } from './inject.js';
import { registerSkill } from './skill.js';

export const name = 'rocky-mem-dsh';

const DEFAULTS = {
  endpoint: 'http://127.0.0.1:7432',
  tokenFile: '~/.local/share/rocky-mem/rocky-mem.token',
  doctorCacheMs: 60_000,
  inject: {
    enabled: true,
    onSources: ['startup', 'clear'],
    budgetTokens: 500,
    timeoutMs: 150,
  },
  preStep: {
    enabled: false,
    budgetTokens: 400,
    minPromptChars: 12,
    timeoutMs: 200,
  },
};

function pickLogger(ctx) {
  try {
    if (typeof ctx.logger === 'function') return ctx.logger('rocky-mem');
    if (ctx.logger) return ctx.logger;
  } catch {
    /* fall through */
  }
  return console;
}

function normalize(raw = {}) {
  return {
    endpoint: raw.endpoint ?? process.env.ROCKYMEM_URL ?? DEFAULTS.endpoint,
    tokenFile: raw.tokenFile ?? DEFAULTS.tokenFile,
    doctorCacheMs: raw.doctorCacheMs ?? DEFAULTS.doctorCacheMs,
    inject: { ...DEFAULTS.inject, ...(raw.inject ?? {}) },
    preStep: { ...DEFAULTS.preStep, ...(raw.preStep ?? {}) },
  };
}

function statusReport({ client, config, stats, doctor }) {
  const skipped = Object.entries(stats.skipped)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${reason}=${n}`)
    .join(', ');
  const features = Array.isArray(doctor?.features) ? doctor.features.join(',') : 'unreachable';
  return [
    `rocky-mem — ${config.endpoint}`,
    `contract ${doctor?.contract ?? '?'} · server ${doctor?.version ?? '?'} · features ${features}`,
    `injected ${stats.injected} · skipped ${skipped || 'none'}`,
    `inject=${config.inject.enabled ? 'on' : 'off'} preStep=${config.preStep.enabled ? 'on' : 'off'} ` +
      `budget=${config.inject.budgetTokens}/${config.preStep.budgetTokens}`,
  ].join('\n');
}

function registerCommand(ctx, state, log) {
  let commands;
  try {
    commands = typeof ctx.get === 'function' ? ctx.get('commands') : undefined;
  } catch {
    commands = undefined;
  }
  if (!commands || typeof commands.register !== 'function') {
    log?.debug?.('rocky-mem: commands service unavailable; /rockymem not registered');
    return false;
  }
  try {
    commands.register({
      name: 'rockymem',
      description: 'rocky-mem status; `/rockymem on|off` toggles context injection',
      handler: async ({ rawInput }) => {
        const arg = String(rawInput ?? '').trim().toLowerCase();
        const { config, stats } = state;
        if (arg === 'on') {
          config.inject.enabled = true;
          return { kind: 'success', text: 'rocky-mem: context injection on' };
        }
        if (arg === 'off') {
          config.inject.enabled = false;
          return { kind: 'success', text: 'rocky-mem: context injection off' };
        }
        if (arg === 'prestep') {
          config.preStep.enabled = !config.preStep.enabled;
          return {
            kind: 'success',
            text: `rocky-mem: preStep ${config.preStep.enabled ? 'on' : 'off'} (this process only)`,
          };
        }
        state.doctor = (await state.client.doctor()) ?? state.doctor;
        return { kind: 'success', text: statusReport({ ...state, config, stats }) };
      },
    });
    return true;
  } catch (err) {
    log?.warn?.('rocky-mem: /rockymem registration failed', err?.message ?? err);
    return false;
  }
}

export function apply(ctx, raw) {
  const log = pickLogger(ctx);
  const config = normalize(raw ?? {});
  const client = new RockyClient(config, log);
  const stats = { injected: 0, skipped: Object.create(null) };
  const state = { client, config, stats, doctor: null };
  const injector = createInjector({ client, config, log, stats });

  if (typeof ctx.on === 'function') {
    ctx.on('agent/created', (event) => injector.onCreated(event));
    ctx.on('agent/pre-step', (payload, next) => injector.onPreStep(payload, next));
  } else {
    log?.warn?.('rocky-mem: ctx.on unavailable; injection disabled');
  }

  registerSkill(ctx, log);
  registerCommand(ctx, state, log);

  // One line at load so a user can tell whether the daemon is reachable
  // without turning the session into a debugging exercise.
  client
    .doctor()
    .then((d) => {
      state.doctor = d ?? null;
      if (d) {
        log?.info?.(
          `rocky-mem: daemon ${config.endpoint} contract=${d.contract ?? '?'} features=${(d.features ?? []).join(',')}`,
        );
      } else {
        log?.warn?.(`rocky-mem: daemon ${config.endpoint} unreachable; injection will be skipped`);
      }
    })
    .catch(() => {});

  return state;
}
