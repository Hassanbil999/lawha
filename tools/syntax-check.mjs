/* Lawha — parse every shipped JavaScript file as an ES module.
 *
 * `node --check` treats a .js file as CommonJS, which rejects `import` before
 * it has looked at anything else. Copying to a .mjs in a temp dir and checking
 * that is the cheapest way to get a real ESM parse without a build step.
 *
 * Dev-only. Run with `node tools/syntax-check.mjs`. */

import { readdirSync, statSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['assets', 'node_modules', '.git', '.claude', 'tools']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === '.js') out.push(full);
  }
  return out;
}

const temp = mkdtempSync(join(tmpdir(), 'lawha-syntax-'));
let failures = 0;
let count = 0;

try {
  for (const file of walk(ROOT)) {
    const copy = join(temp, `${basename(file, '.js')}-${count}.mjs`);
    copyFileSync(file, copy);
    count += 1;
    try {
      execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' });
      console.log(`  \x1b[32m✓\x1b[0m ${relative(ROOT, file).replace(/\\/g, '/')}`);
    } catch (error) {
      failures += 1;
      console.log(`  \x1b[31m✗\x1b[0m ${relative(ROOT, file).replace(/\\/g, '/')}`);
      console.log(String(error.stderr).split('\n').slice(0, 6).map((l) => `      ${l}`).join('\n'));
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(
  `\n${failures ? '\x1b[31m' : '\x1b[32m'}${count - failures}/${count} files parse as ES modules\x1b[0m\n`
);
process.exit(failures ? 1 : 0);
