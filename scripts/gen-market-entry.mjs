#!/usr/bin/env node
// Generate the format-1 plugin index entry for this bundle.
//
// Usage:
//   node scripts/gen-market-entry.mjs            # entry on stdout
//   node scripts/gen-market-entry.mjs --index     # full index document
//
// The output is what a plugin index (DSH Discover) and the curated catalog PR
// both need: name, title, description, icon, author, repository, versions.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const repo =
  process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
    : pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? '';

const entry = {
  name: pkg.name,
  title: 'rocky-mem',
  description: pkg.description,
  icon: 'icons/rocky-mem.svg',
  author: pkg.author ?? 'rocky-mem contributors',
  homepage: repo ? `${repo}#readme` : undefined,
  repository: repo ? { url: repo } : undefined,
  versions: [
    {
      version: pkg.version,
      publishTimestamp: Number(process.env.PUBLISH_TIMESTAMP ?? Math.floor(Date.now() / 1000)),
      source: { type: 'npm' },
      engines: { dsh: pkg.engines?.dsh },
    },
  ],
};

const index = {
  format: 1,
  title: { en: 'rocky-mem', zh: 'rocky-mem 经验台账' },
  plugins: [entry],
};

const wantIndex = process.argv.includes('--index');
const out = JSON.stringify(wantIndex ? index : entry, null, 2);

if (process.argv.includes('--out')) {
  const target = process.argv[process.argv.indexOf('--out') + 1];
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, out + '\n', 'utf8');
  console.log(`wrote ${target}`);
} else {
  console.log(out);
}
