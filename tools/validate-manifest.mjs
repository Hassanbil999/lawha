/**
 * validate-manifest.mjs
 * Checks manifest.json against the things a Chrome Web Store review rejects for.
 * Exports: nothing (exits non-zero on failure)
 * Depends on: node:fs, node:path, node:url
 */

/* Lawha — the manifest, checked before a reviewer checks it.
 *
 * Every rule here corresponds to a real rejection reason: a stale manifest
 * version, a permission the listing does not account for, an icon path that
 * points at nothing, a locale declared but not shipped.
 *
 * Dev-only. Run with `node tools/validate-manifest.mjs`. */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;

function ok(label) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function fail(label, detail = '') {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
}

function assert(condition, label, detail = '') {
  if (condition) ok(label);
  else fail(label, detail);
}

/* ---- Parse --------------------------------------------------------------- */

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  ok('manifest.json parses');
} catch (error) {
  fail('manifest.json parses', error.message);
  process.exit(1);
}

/* ---- Version ------------------------------------------------------------- */

assert(
  manifest.manifest_version === 3,
  'Manifest V3',
  `found version ${manifest.manifest_version} — V2 is refused for new submissions`
);

assert(
  /^\d+\.\d+(\.\d+){0,2}$/.test(String(manifest.version)),
  `Version is a valid dotted number (${manifest.version})`
);

/* ---- Permissions ---------------------------------------------------------
 * The list is closed. A permission that appears here and not in the privacy
 * policy is a rejection, so growing this set is a deliberate act with paperwork
 * attached — not something that happens quietly in a refactor. */

const EXPECTED_PERMISSIONS = [
  'tabs',
  'bookmarks',
  'history',
  'storage',
  'favicon',
  'sidePanel',
];

const permissions = manifest.permissions ?? [];
const unexpected = permissions.filter((p) => !EXPECTED_PERMISSIONS.includes(p));
const missing = EXPECTED_PERMISSIONS.filter((p) => !permissions.includes(p));

assert(
  !unexpected.length,
  'No permission beyond the declared set',
  unexpected.length
    ? `undeclared: ${unexpected.join(', ')} — add it to privacy-policy.html and to this list, or take it out`
    : ''
);

assert(!missing.length, 'Every declared permission is present', missing.join(', '));

assert(
  !manifest.host_permissions,
  'No host_permissions',
  'host permissions widen the review scope and Lawha needs none'
);

assert(
  !manifest.content_scripts,
  'No content scripts',
  'Lawha never runs in a page it does not own'
);

/* ---- Content security policy --------------------------------------------- */

const csp = manifest.content_security_policy?.extension_pages ?? '';

assert(Boolean(csp), 'An explicit extension_pages CSP is declared');

/* `connect-src 'self'` is what proves the zero-network claim: the extension's
 * own package is reachable — scenes/*.json is loaded with fetch — and no remote
 * origin is. `'none'` would be stricter on paper and would break loading the
 * built-in Scenes, which is worse than a promise kept literally. */
assert(
  /connect-src\s+'self'\s*(;|$)/.test(csp),
  "connect-src is 'self' — no remote origin is reachable",
  `found: ${csp}`
);

for (const directive of ['script-src', 'object-src', 'style-src', 'default-src']) {
  assert(
    new RegExp(`${directive}\\s+'self'`).test(csp),
    `${directive} is 'self'`,
    `found: ${csp}`
  );
}

assert(
  !/unsafe-inline|unsafe-eval|https?:/.test(csp),
  'CSP allows no inline code, no eval, and no remote origin',
  `found: ${csp}`
);

/* ---- Icons --------------------------------------------------------------- */

const iconSizes = ['16', '32', '48', '128'];
const iconProblems = [];

for (const size of iconSizes) {
  const path = manifest.icons?.[size];
  if (!path) iconProblems.push(`no ${size}px icon declared`);
  else if (!existsSync(join(ROOT, path))) iconProblems.push(`${path} does not exist`);
}

assert(!iconProblems.length, 'Every icon size is declared and present', iconProblems.join('; '));

/* ---- Locales ------------------------------------------------------------- */

const localeDir = join(ROOT, '_locales');
const locales = existsSync(localeDir) ? readdirSync(localeDir) : [];

assert(
  Boolean(manifest.default_locale) && locales.includes(manifest.default_locale),
  `default_locale "${manifest.default_locale}" has a _locales directory`,
  `_locales holds: ${locales.join(', ') || 'nothing'}`
);

/* Every __MSG_key__ the manifest references has to exist in the default locale,
 * or Chrome refuses to load the extension at all. */
const messagesPath = join(localeDir, manifest.default_locale ?? 'en', 'messages.json');
if (existsSync(messagesPath)) {
  const messages = JSON.parse(readFileSync(messagesPath, 'utf8'));
  const referenced = [...JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map(
    (match) => match[1]
  );
  const absent = [...new Set(referenced)].filter((key) => !messages[key]);

  assert(
    !absent.length,
    `Every __MSG_*__ placeholder resolves (${new Set(referenced).size} referenced)`,
    absent.map((key) => `missing: ${key}`).join('; ')
  );
} else {
  fail('The default locale ships a messages.json', messagesPath);
}

/* ---- Commands ------------------------------------------------------------ */

const commands = manifest.commands ?? {};
const commandProblems = [];

// Chrome grants at most four suggested key bindings; a fifth is silently
// ignored, which reads to a user as a shortcut that does not work.
if (Object.keys(commands).length > 4) {
  commandProblems.push(`${Object.keys(commands).length} commands — Chrome honours only 4 suggested keys`);
}

const KEY = /^(Ctrl|Command|MacCtrl|Alt|Option)\+(Shift\+)?([A-Z0-9]|Comma|Period|Home|End|PageUp|PageDown|Insert|Delete|Up|Down|Left|Right)$/;

for (const [name, command] of Object.entries(commands)) {
  const suggested = command.suggested_key;
  if (!suggested) continue;

  for (const [platform, combination] of Object.entries(suggested)) {
    if (!KEY.test(combination)) {
      commandProblems.push(`${name}.${platform}: "${combination}" is not a valid combination`);
    }
  }

  if (!command.description) commandProblems.push(`${name} has no description`);
}

assert(
  !commandProblems.length,
  `Every command shortcut is valid (${Object.keys(commands).length} commands)`,
  commandProblems.join('; ')
);

/* ---- Entry points exist -------------------------------------------------- */

const entries = [
  manifest.chrome_url_overrides?.newtab,
  manifest.side_panel?.default_path,
  manifest.action?.default_popup,
  manifest.background?.service_worker,
].filter(Boolean);

const missingEntries = entries.filter((path) => !existsSync(join(ROOT, path)));

assert(
  !missingEntries.length,
  `Every declared entry point exists (${entries.length})`,
  missingEntries.join(', ')
);

/* ---- Result -------------------------------------------------------------- */

console.log(
  `\n${failures ? '\x1b[31m' : '\x1b[32m'}manifest: ${failures ? `${failures} problem(s)` : 'clean'}\x1b[0m\n`
);
process.exit(failures ? 1 : 0);
