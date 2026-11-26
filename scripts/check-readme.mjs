#!/usr/bin/env node
// Keep the two READMEs structurally identical and the plugin metadata honest.
//
//   node scripts/check-readme.mjs
//
// Checks:
//   1. README.md and README.zh-CN.md exist and each links to the other.
//   2. They have the same number of `##` sections, images, and code fences, in
//      the same relative order (text is translated, structure is not).
//   3. locale/*.json use the documented `meta.{title,description,detail}` shape,
//      and each `meta.detail` names a file that exists.
//   4. Every relative link in either README resolves inside the repository.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const en = readFileSync(join(root, 'README.md'), 'utf8');
const zh = readFileSync(join(root, 'README.zh-CN.md'), 'utf8');

// 1. language switcher
if (!en.includes('README.zh-CN.md')) problems.push('README.md has no link to the Chinese version');
if (!/\]\(README\.md\)|href="README\.md"/.test(zh)) {
  problems.push('README.zh-CN.md has no link back to English');
}

// 2. structure parity
const shape = (s) => ({
  sections: (s.match(/^## /gm) ?? []).length,
  images: (s.match(/!\[/g) ?? []).length,
  fences: (s.match(/^```/gm) ?? []).length,
  tables: (s.match(/^\|---/gm) ?? []).length,
});
const a = shape(en);
const b = shape(zh);
for (const key of Object.keys(a)) {
  if (a[key] !== b[key]) problems.push(`structure: ${key} — en=${a[key]} zh=${b[key]}`);
}

// 3. locale metadata
for (const [file, expectZh] of [['locale/en.json', false], ['locale/zh-CN.json', true]]) {
  const path = join(root, file);
  const meta = JSON.parse(readFileSync(path, 'utf8')).meta;
  if (!meta) {
    problems.push(`${file}: missing "meta" object`);
    continue;
  }
  for (const key of ['title', 'description', 'detail']) {
    if (typeof meta[key] !== 'string' || meta[key].trim() === '') {
      problems.push(`${file}: meta.${key} missing`);
    }
  }
  if (meta.detail && !existsSync(join(root, meta.detail))) {
    problems.push(`${file}: meta.detail "${meta.detail}" does not exist`);
  }
  if (expectZh && meta.detail && !meta.detail.includes('.zh')) {
    problems.push(`${file}: the Chinese locale should point at a Chinese detail document`);
  }
  if (!expectZh && meta.detail && meta.detail.includes('.zh')) {
    problems.push(`${file}: the English locale points at a Chinese detail document`);
  }
}

// 4. relative links resolve
for (const [name, text] of [['README.md', en], ['README.zh-CN.md', zh]]) {
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const file = decodeURI(target.split('#')[0]);
    if (!existsSync(join(root, file))) problems.push(`${name}: link not found — ${file}`);
  }
}

// 5. every image used by the READMEs is actually in the repository
const images = readdirSync(join(root, 'docs/img'));
if (images.length === 0) problems.push('docs/img/ is empty');

if (problems.length > 0) {
  for (const p of problems) console.error(`readme check: ${p}`);
  process.exit(1);
}
console.log(`readme check ok: ${a.sections} sections, ${a.images} images, ${a.fences} fences, ${images.length} img files`);
