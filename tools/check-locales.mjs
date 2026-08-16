/**
 * check-locales.mjs
 * Asserts that every _locales message key exists in every shipped locale, and
 * that the in-app STRINGS tables agree with each other too.
 * Exports: nothing (exits non-zero on failure)
 * Depends on: node:fs, node:path, node:url
 */

/* Lawha — no half-translated build.
 *
 * There are two string systems, for two different jobs. `_locales/` is Chrome's
 * own, and it covers the handful of strings the *browser* renders — the
 * extension name, its description, the shortcut list in chrome://extensions.
 * `shared/i18n.js` covers everything Lawha itself draws.
 *
 * Both are checked here, because a missing key in either one ships as a blank
 * label, and Arabic is not a translation layer bolted onto this product — a
 * string that exists in only one language is a bug in both.
 *
 * Dev-only. Run with `node tools/check-locales.mjs`. */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;

function ok(label) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function fail(label, details = []) {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${label}`);
  for (const detail of details.slice(0, 20)) console.log(`      ${detail}`);
  if (details.length > 20) console.log(`      …and ${details.length - 20} more`);
}

/* ---- _locales ------------------------------------------------------------ */

const localeDir = join(ROOT, '_locales');
const locales = readdirSync(localeDir).filter((name) =>
  existsSync(join(localeDir, name, 'messages.json'))
);

if (locales.length < 2) {
  fail('At least two locales ship', [`found: ${locales.join(', ') || 'none'}`]);
} else {
  const tables = Object.fromEntries(
    locales.map((locale) => [
      locale,
      JSON.parse(readFileSync(join(localeDir, locale, 'messages.json'), 'utf8')),
    ])
  );

  const everyKey = new Set(locales.flatMap((locale) => Object.keys(tables[locale])));
  const problems = [];

  for (const key of everyKey) {
    for (const locale of locales) {
      const entry = tables[locale][key];
      if (!entry) problems.push(`_locales/${locale}: missing "${key}"`);
      else if (typeof entry.message !== 'string' || !entry.message.trim()) {
        problems.push(`_locales/${locale}: "${key}" has no message`);
      }
    }
  }

  if (problems.length) fail('_locales agree across every language', problems);
  else ok(`_locales agree across ${locales.join(', ')} (${everyKey.size} keys)`);
}

/* ---- shared/i18n.js ------------------------------------------------------
 * Parsed rather than imported: i18n.js reaches for chrome.* at module scope in
 * places, and Node has no chrome. The tables are plain object literals, so
 * pulling the keys out with a scanner is both sufficient and cheaper than
 * standing up a fake browser. */

const i18nSource = stripComments(readFileSync(join(ROOT, 'shared', 'i18n.js'), 'utf8'));

/**
 * Blank out comments, keeping the file's length and line structure so offsets
 * stay meaningful. Without this, prose inside a block comment — "…does not
 * spell out:" — scans as a key called `out`.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (line, lead) => lead + ' '.repeat(line.length - lead.length));
}

/** Grab the body of one language block inside a `export const NAME = { ... }`. */
function languageBlock(source, table, lang) {
  const start = source.indexOf(`const ${table}`);
  if (start < 0) return null;

  const langAt = source.indexOf(`\n  ${lang}: {`, start);
  if (langAt < 0) return null;

  let depth = 0;
  let index = source.indexOf('{', langAt);
  const from = index;

  for (; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, index + 1);
    }
  }
  return null;
}

/** Keys declared at the top level of a block, ignoring nested objects. */
function keysOf(block) {
  const keys = new Set();
  let depth = 0;

  // A key is `name:` at depth 1. Anything deeper belongs to a nested table.
  for (let index = 0; index < block.length; index += 1) {
    const char = block[index];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (depth === 1) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(block.slice(index, index + 60));
      if (match && !/[A-Za-z0-9_]/.test(block[index - 1] ?? '')) {
        keys.add(match[1]);
        index += match[0].length - 1;
      }
    }
  }
  return keys;
}

const en = languageBlock(i18nSource, 'STRINGS', 'en');
const ar = languageBlock(i18nSource, 'STRINGS', 'ar');

if (!en || !ar) {
  fail('STRINGS has both an en and an ar table', ['could not locate one of them in shared/i18n.js']);
} else {
  const enKeys = keysOf(en);
  const arKeys = keysOf(ar);

  const problems = [
    ...[...enKeys].filter((key) => !arKeys.has(key)).map((key) => `STRINGS.ar: missing "${key}"`),
    ...[...arKeys].filter((key) => !enKeys.has(key)).map((key) => `STRINGS.en: missing "${key}"`),
  ];

  if (problems.length) fail('STRINGS.en and STRINGS.ar hold the same keys', problems);
  else ok(`STRINGS.en and STRINGS.ar hold the same ${enKeys.size} keys`);

  /* An empty value is worse than a missing key. assertStringsComplete() treats
   * "" as absent and throws on it at boot, which surfaces as the Errors button
   * on chrome://extensions and nowhere else — a placeholder someone meant to
   * fill in later takes the whole extension down on load. */
  const blanks = [];
  for (const [lang, block] of [['en', en], ['ar', ar]]) {
    for (const key of keysOf(block)) {
      const value = new RegExp(`\\b${key}\\s*:\\s*(["'\`])(.*?)\\1`, 's').exec(block);
      if (value && value[2].trim() === '') blanks.push(`STRINGS.${lang}.${key} is empty`);
    }
  }

  if (blanks.length) fail('No string is defined but left empty', blanks);
  else ok('No string is defined but left empty');
}

/* ---- data-i18n attributes -----------------------------------------------
 * The other half of the same risk. check-locales already proves every t('key')
 * in JavaScript resolves; markup asks for strings too, through data-i18n, and
 * applyStrings() calls t() on whatever it finds there. A typo in an attribute
 * throws at boot on a dev build exactly like a missing key in code does. */

if (en) {
  const enKeys = keysOf(en);
  const problems = [];
  let checked = 0;

  for (const dir of ['newtab', 'sidebar', 'popup', 'gallery', 'tools']) {
    const at = join(ROOT, dir);
    if (!existsSync(at)) continue;

    for (const name of readdirSync(at)) {
      if (!name.endsWith('.html')) continue;
      const markup = readFileSync(join(at, name), 'utf8');

      for (const match of markup.matchAll(
        /data-i18n(?:-placeholder|-aria|-title)?="([A-Za-z0-9_]+)"/g
      )) {
        checked += 1;
        if (!enKeys.has(match[1])) {
          problems.push(`${dir}/${name}: data-i18n="${match[1]}" has no entry`);
        }
      }
    }
  }

  if (problems.length) fail('Every data-i18n attribute resolves to a string', problems);
  else ok(`Every data-i18n attribute resolves to a string (${checked} checked)`);
}

/* Every t('key') the codebase asks for must exist. A key that is only ever
 * requested and never defined throws on a dev build and falls back silently on
 * a shipped one, which is exactly the bug a user reports as "blank label". */
if (en) {
  const enKeys = keysOf(en);
  const referenced = new Set();

  for (const dir of ['modules', 'newtab', 'sidebar', 'popup', 'gallery', 'shared']) {
    const at = join(ROOT, dir);
    if (!existsSync(at)) continue;
    for (const name of readdirSync(at)) {
      if (!name.endsWith('.js')) continue;
      const source = readFileSync(join(at, name), 'utf8');
      for (const match of source.matchAll(/\bt\(\s*'([a-z][a-z0-9_]*)'/g)) {
        referenced.add(match[1]);
      }
    }
  }

  const undefinedKeys = [...referenced].filter((key) => !enKeys.has(key));
  if (undefinedKeys.length) {
    fail('Every requested string key is defined', undefinedKeys.map((key) => `t('${key}') has no entry`));
  } else {
    ok(`Every requested string key is defined (${referenced.size} referenced)`);
  }
}

/* ---- Result -------------------------------------------------------------- */

console.log(
  `\n${failures ? '\x1b[31m' : '\x1b[32m'}locales: ${failures ? `${failures} problem(s)` : 'clean'}\x1b[0m\n`
);
process.exit(failures ? 1 : 0);
