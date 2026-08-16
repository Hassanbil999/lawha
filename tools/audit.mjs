/* Lawha — static audit. Run with `node tools/audit.mjs`.
 *
 * Checks the parts of §21 a machine can settle: the craft rules about physical
 * properties and the 4px grid, the promise that no user text goes through
 * innerHTML, the contrast floor on every palette, i18n completeness, and that
 * all five bundled Scenes actually validate against the schema that guards
 * imports.
 *
 * Dev-only. Nothing here ships, and it has no dependencies. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;
let checks = 0;

function ok(label) {
  checks += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function fail(label, details = []) {
  checks += 1;
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${label}`);
  for (const line of details.slice(0, 12)) console.log(`      ${line}`);
  if (details.length > 12) console.log(`      …and ${details.length - 12} more`);
}

function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

/* ---- File walking -------------------------------------------------------- */

const SKIP_DIRS = new Set(['assets', 'node_modules', '.git', '.claude']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const byExt = (ext) => files.filter((f) => extname(f) === ext);
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const read = (f) => readFileSync(f, 'utf8');

/* Strip comments so a rule named in prose does not read as a violation. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* ==========================================================================
   Craft — §21
   ========================================================================== */

section('Craft: no physical directions in CSS');
{
  const banned = [
    /(^|[\s;{])margin-left\s*:/,
    /(^|[\s;{])margin-right\s*:/,
    /(^|[\s;{])padding-left\s*:/,
    /(^|[\s;{])padding-right\s*:/,
    /(^|[\s;{])border-left\s*:/,
    /(^|[\s;{])border-right\s*:/,
    /(^|[\s;{])(?<!inset-inline-start:\s)left\s*:/,
    /(^|[\s;{])right\s*:/,
    /flex-direction\s*:\s*row-reverse/,
    /text-align\s*:\s*(left|right)/,
  ];

  const hits = [];
  for (const file of byExt('.css')) {
    const source = stripComments(read(file));
    source.split('\n').forEach((line, index) => {
      for (const pattern of banned) {
        if (pattern.test(line)) hits.push(`${rel(file)}:${index + 1}  ${line.trim()}`);
      }
    });
  }

  if (hits.length) fail('CSS uses only logical properties', hits);
  else ok('CSS uses only logical properties');
}

section('Craft: no physical directions in JS style writes');
{
  const hits = [];
  for (const file of byExt('.js')) {
    const source = stripComments(read(file));
    source.split('\n').forEach((line, index) => {
      if (/setProperty\(\s*['"](left|right|margin-left|margin-right|padding-left|padding-right)['"]/.test(line)) {
        hits.push(`${rel(file)}:${index + 1}  ${line.trim()}`);
      }
      if (/\.style\.(left|right|marginLeft|marginRight|paddingLeft|paddingRight)\s*=/.test(line)) {
        hits.push(`${rel(file)}:${index + 1}  ${line.trim()}`);
      }
    });
  }

  if (hits.length) fail('JavaScript writes only logical properties', hits);
  else ok('JavaScript writes only logical properties');
}

section('Craft: spacing is on the 4px grid');
{
  // Authored px values must be multiples of 4. Exempted: hairlines and the
  // sub-4px details the spec names itself — the 4px Waqt dot, the 2px active
  // bar, the 3px dots, and type sizes, which are their own scale.
  const EXEMPT_PROPS = /^(font-size|line-height|letter-spacing|border|border-\w+|outline|outline-offset|stroke-width|--hairline|--text-\w+|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|border-radius|--radius-\w+|top|bottom|width|height|transform|box-shadow|--shadow-\w+|aspect-ratio|flex|flex-basis|background-size|scale|rotate)$/;

  const hits = [];
  for (const file of byExt('.css')) {
    const source = stripComments(read(file));
    source.split('\n').forEach((line, index) => {
      const match = /^\s*([a-z-]+)\s*:\s*(.+?);/.exec(line);
      if (!match) return;
      const [, prop, value] = match;
      if (EXEMPT_PROPS.test(prop)) return;

      for (const found of value.matchAll(/(?<![\w.-])(\d+)px/g)) {
        const px = Number(found[1]);
        if (px !== 0 && px % 4 !== 0) {
          hits.push(`${rel(file)}:${index + 1}  ${prop}: ${value}`);
        }
      }
    });
  }

  if (hits.length) fail('Spacing values are multiples of 4', hits);
  else ok('Spacing values are multiples of 4');
}

section('Craft: no user text through innerHTML');
{
  const hits = [];
  for (const file of byExt('.js')) {
    const source = stripComments(read(file));
    source.split('\n').forEach((line, index) => {
      if (/\.(innerHTML|outerHTML)\s*=/.test(line) || /insertAdjacentHTML/.test(line)) {
        hits.push(`${rel(file)}:${index + 1}  ${line.trim()}`);
      }
    });
  }

  if (hits.length) fail('No innerHTML anywhere', hits);
  else ok('No innerHTML anywhere');
}

section('Craft: weight 600 appears only on the clock and the active tab title');
{
  const hits = [];
  for (const file of byExt('.css')) {
    const source = stripComments(read(file));
    const blocks = source.split('}');
    for (const block of blocks) {
      if (!/font-weight\s*:\s*600/.test(block)) continue;
      const selector = block.split('{')[0].trim().replace(/\s+/g, ' ');
      // @font-face declares that a weight exists; it does not apply one.
      if (/@font-face/.test(selector)) continue;
      const allowed =
        /\.clock-time/.test(selector) ||
        (/\[data-active="true"\]/.test(selector) && /tab(-tile)?-title/.test(selector));
      if (!allowed) hits.push(`${rel(file)}  ${selector}`);
    }
  }

  if (hits.length) fail('Weight 600 is confined to the clock and the active tab', hits);
  else ok('Weight 600 is confined to the clock and the active tab');
}

section('Craft: Arabic never gets negative letter-spacing');
{
  const tokens = read(join(ROOT, 'shared', 'tokens.css'));
  const zeroed = /:root\[lang="ar"\][^}]*--tracking-tight:\s*0/.test(tokens);

  const hits = [];
  for (const file of byExt('.css')) {
    const source = stripComments(read(file));
    source.split('\n').forEach((line, index) => {
      if (/letter-spacing\s*:\s*-/.test(line)) {
        hits.push(`${rel(file)}:${index + 1}  ${line.trim()}  (literal negative tracking)`);
      }
    });
  }

  if (!zeroed) hits.push('shared/tokens.css does not zero --tracking-tight for lang="ar"');
  if (hits.length) fail('Arabic tracking is never negative', hits);
  else ok('Arabic tracking is never negative');
}

/* ==========================================================================
   Palettes — §21 "All four palettes pass 4.5:1 on body text"
   ========================================================================== */

section('Accessibility: contrast');
{
  const tokens = read(join(ROOT, 'shared', 'tokens.css'));

  function paletteOf(name) {
    const pattern = new RegExp(
      `\\[data-palette="${name}"\\](?:[^{]*)\\{([^}]*)\\}|:root,\\s*\\[data-palette="${name}"\\]\\s*\\{([^}]*)\\}`
    );
    const match = pattern.exec(tokens);
    const body = match?.[1] ?? match?.[2] ?? '';
    const out = {};
    for (const decl of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[decl[1]] = decl[2].trim();
    return out;
  }

  const hexToRgb = (hex) => {
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    return long ? long.slice(1, 4).map((c) => parseInt(c, 16)) : null;
  };

  const ratio = (a, b) => {
    const lum = (hex) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return 0;
      const [r, g, bl] = rgb.map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const results = [];
  for (const name of ['waraq', 'hibr', 'nakhla', 'sadaf']) {
    const p = paletteOf(name);
    const pairs = [
      ['body text on canvas', p['text-primary'], p['bg-canvas']],
      ['body text on card', p['text-primary'], p['bg-card']],
      ['secondary on canvas', p['text-secondary'], p['bg-canvas']],
      ['accent text on accent', p['accent-text'], p['accent']],
    ];
    for (const [label, fg, bg] of pairs) {
      if (!fg || !bg) {
        results.push(`${name}: could not read tokens for ${label}`);
        continue;
      }
      const r = ratio(fg, bg);
      if (r < 4.5) results.push(`${name} — ${label}: ${r.toFixed(2)}:1 (needs 4.5)`);
    }
  }

  if (results.length) fail('All four palettes clear 4.5:1', results);
  else ok('All four palettes clear 4.5:1 on body, secondary and accent text');
}

/* ==========================================================================
   i18n
   ========================================================================== */

section('i18n: every key exists in both languages');
{
  const { STRINGS, MODULE_LABELS, VARIANT_LABELS } = await import('../shared/i18n.js');
  const { MODULES } = await import('../shared/modules.js');

  const missing = [];
  const keys = new Set([...Object.keys(STRINGS.en), ...Object.keys(STRINGS.ar)]);
  for (const key of keys) {
    for (const lang of ['en', 'ar']) {
      if (typeof STRINGS[lang][key] !== 'string' || !STRINGS[lang][key]) {
        missing.push(`STRINGS.${lang}.${key}`);
      }
    }
  }
  for (const lang of ['en', 'ar']) {
    for (const id of Object.keys(MODULES)) {
      if (!MODULE_LABELS[lang][id]) missing.push(`MODULE_LABELS.${lang}.${id}`);
      for (const variant of MODULES[id].variants) {
        if (!VARIANT_LABELS[lang][id]?.[variant]) {
          missing.push(`VARIANT_LABELS.${lang}.${id}.${variant}`);
        }
      }
    }
  }

  if (missing.length) fail('English and Arabic are complete', missing);
  else ok(`English and Arabic are complete (${keys.size} strings + every module and variant)`);
}

section('i18n: no key is used that does not exist');
{
  const { STRINGS } = await import('../shared/i18n.js');
  const known = new Set(Object.keys(STRINGS.en));

  const used = new Set();
  for (const file of [...byExt('.js'), ...byExt('.html')]) {
    // Comments stripped first: i18n.js documents the data-i18n="key" form in
    // prose, and a docs example is not a call site.
    const source = stripComments(read(file)).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of source.matchAll(/\bt\(\s*'([a-z0-9_]+)'/g)) used.add(m[1]);
    for (const m of source.matchAll(/data-i18n(?:-\w+)?="([a-z0-9_]+)"/g)) used.add(m[1]);
  }
  // Keys built at runtime from a known, closed set.
  for (const prefix of ['greet_', 'grad_', 'dens_', 'sec_', 'arr_', 'cmd_src_']) {
    for (const key of known) if (key.startsWith(prefix)) used.delete(key);
  }

  const unknown = [...used].filter((key) => !known.has(key));
  if (unknown.length) fail('Every referenced string key exists', unknown);
  else ok('Every referenced string key exists');
}

/* ==========================================================================
   Scenes
   ========================================================================== */

section('Scenes: all five bundled Scenes validate');
{
  const { validateScene, BUILTIN_SCENE_IDS } = await import('../shared/scenes.js');

  const problems = [];
  for (const id of BUILTIN_SCENE_IDS) {
    const raw = JSON.parse(read(join(ROOT, 'scenes', `${id}.json`)));
    const result = validateScene(raw);
    if (!result.ok) {
      problems.push(`${id}.json → ${result.reason}`);
      continue;
    }
    if (result.scene.meta.id !== id) {
      problems.push(`${id}.json declares meta.id "${result.scene.meta.id}"`);
    }
    // Every region a Scene declares should carry at least one module, or it is
    // a hole in the grid.
    for (const [name, region] of Object.entries(result.scene.regions)) {
      if (!region.modules.length) problems.push(`${id}.json → region "${name}" is empty`);
    }
  }

  if (problems.length) fail('Bundled Scenes pass the import gate', problems);
  else ok(`Bundled Scenes pass the import gate (${BUILTIN_SCENE_IDS.length})`);
}

section('Scenes: hostile Scenes are refused');
{
  const { validateScene } = await import('../shared/scenes.js');
  const base = JSON.parse(read(join(ROOT, 'scenes', 'diwan.json')));

  const cases = [
    [
      'palette token smuggling a url()',
      { ...base, palette: { ...Object.fromEntries(
        ['bg-canvas','bg-raised','bg-card','text-primary','text-secondary','text-muted','accent','accent-soft','accent-text','border','shadow-color']
          .map((k) => [k, '#000000'])
      ), 'bg-canvas': 'url(https://example.com/x.png)' } },
    ],
    [
      'grid columns breaking out of the declaration',
      { ...base, grid: { ...base.grid, columns: '1fr; } body { background: url(https://example.com/x) } .x {' } },
    ],
    ['a newer schema', { ...base, schemaVersion: 99 }],
    ['not a Lawha file', { hello: true }],
    ['a non-rectangular area map', { ...base, grid: { ...base.grid, areas: ['header header', 'hero header'] } }],
    ['a region name with a quote in it', { ...base, regions: { ...base.regions, 'a"b': { modules: ['clock'] } } }],
  ];

  const leaked = [];
  for (const [label, scene] of cases) {
    const result = validateScene(scene);
    if (result.ok) leaked.push(`accepted: ${label}`);
  }

  if (leaked.length) fail('Malformed and hostile Scenes are refused', leaked);
  else ok(`Malformed and hostile Scenes are refused (${cases.length} cases)`);
}

section('Scenes: unknown modules and variants degrade instead of failing');
{
  const { validateScene } = await import('../shared/scenes.js');
  const base = JSON.parse(read(join(ROOT, 'scenes', 'diwan.json')));

  const fromTheFuture = {
    ...base,
    modules: {
      ...base.modules,
      clock: { variant: 'holographic' },
      weather: { variant: 'sunny' },
    },
  };

  const result = validateScene(fromTheFuture);
  const problems = [];
  if (!result.ok) problems.push(`rejected outright: ${result.reason}`);
  else {
    if (result.scene.modules.clock.variant !== 'monumental') {
      problems.push(`unknown variant became "${result.scene.modules.clock.variant}", expected the default`);
    }
    if ('weather' in result.scene.modules) problems.push('unknown module survived');
  }

  if (problems.length) fail('A Scene from a newer build degrades gracefully', problems);
  else ok('A Scene from a newer build degrades gracefully');
}

/* ==========================================================================
   The data preservation contract — §10
   ========================================================================== */

section('Contract: presentation code cannot write user data');
{
  const storage = await import('../shared/storage.js');
  const problems = [];

  // 1. The two namespaces do not overlap.
  const overlap = storage.DATA_KEYS.filter((key) => storage.SCENE_KEYS.includes(key));
  if (overlap.length) problems.push(`DATA_KEYS and SCENE_KEYS share: ${overlap.join(', ')}`);

  // 2. assertNoDataWrites throws for every user-data key.
  for (const key of storage.DATA_KEYS) {
    let threw = false;
    try {
      storage.assertNoDataWrites([key]);
    } catch {
      threw = true;
    }
    if (!threw) problems.push(`assertNoDataWrites allowed "${key}"`);
  }

  // 3. ...and permits the key applyScene actually writes.
  try {
    storage.assertNoDataWrites(['activeScene']);
  } catch {
    problems.push('assertNoDataWrites refused "activeScene", which applyScene must write');
  }

  // 4. setPresentation refuses user data outright.
  for (const key of storage.DATA_KEYS) {
    let threw = false;
    try {
      await storage.setPresentation(key, 'nope');
    } catch (error) {
      threw = error instanceof storage.DataGuardError;
    }
    if (!threw) problems.push(`setPresentation accepted the user-data key "${key}"`);
  }

  // 5. The lock: a write attempted mid-render throws.
  storage.beginPresentation();
  let guarded = false;
  try {
    await storage.setData('notes', []);
  } catch (error) {
    guarded = error instanceof storage.DataGuardError;
  }
  storage.endPresentation();
  if (!guarded) problems.push('setData succeeded while a Scene was rendering');

  if (problems.length) fail('The data guard holds', problems);
  else ok('The data guard holds (namespaces, assertion, and the render lock)');
}

section('Contract: renderers never reach for a write');
{
  // A structural check to back the runtime one: nothing in the render path
  // imports a writer it has no business calling.
  const RENDER_ONLY = ['modules/clock.js', 'modules/waqt.js', 'modules/recent.js', 'modules/bookmarks.js'];
  const problems = [];

  for (const name of RENDER_ONLY) {
    const source = read(join(ROOT, name));
    if (/\b(setData|updateData|setPresentation)\b/.test(source)) {
      problems.push(`${name} imports or calls a storage writer`);
    }
  }

  // And the ones that do write must only do so from an event handler, never
  // from render(). A crude but effective proxy: no writer call may appear
  // before the first `addEventListener` or inside an exported render.
  for (const name of ['modules/shortcuts.js', 'modules/notes.js', 'modules/later.js']) {
    const source = read(join(ROOT, name));
    const renderBody = /export async function render\([\s\S]*?\n}/.exec(source)?.[0] ?? '';
    if (/\b(setData|updateData)\s*\(/.test(renderBody)) {
      problems.push(`${name} writes user data inside render()`);
    }
  }

  if (problems.length) fail('No module writes user data while rendering', problems);
  else ok('No module writes user data while rendering');
}

/* ==========================================================================
   Wiring
   ========================================================================== */

section('Wiring: every named import resolves to a real export');
{
  const exportsOf = (source) => {
    const names = new Set();
    for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
    for (const m of source.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) names.add(m[1]);
    for (const m of source.matchAll(/export\s+class\s+(\w+)/g)) names.add(m[1]);
    for (const m of source.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  const problems = [];

  for (const file of byExt('.js')) {
    const source = stripComments(read(file));

    for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const [, clause, specifier] = m;
      if (!specifier.startsWith('.')) continue;

      const target = join(file, '..', specifier);
      let targetSource;
      try {
        targetSource = stripComments(read(target));
      } catch {
        problems.push(`${rel(file)} imports "${specifier}", which does not exist`);
        continue;
      }

      const available = exportsOf(targetSource);
      for (const part of clause.split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        if (!available.has(name)) {
          problems.push(`${rel(file)} imports { ${name} } from "${specifier}", which does not export it`);
        }
      }
    }

    // Namespace imports only need the file to exist.
    for (const m of source.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*['"](\.[^'"]+)['"]/g)) {
      try {
        read(join(file, '..', m[1]));
      } catch {
        problems.push(`${rel(file)} imports "${m[1]}", which does not exist`);
      }
    }
  }

  if (problems.length) fail('All imports resolve', problems);
  else ok('All imports resolve');
}

section('Wiring: pages load the stylesheets and scripts they reference');
{
  const problems = [];
  for (const file of byExt('.html')) {
    const source = read(file);
    for (const m of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = m[1];
      // Anything with a scheme, or a fragment, is not a file on disk to check.
      // mailto: in particular — the privacy policy has to name a contact.
      if (/^(https?:|data:|mailto:|tel:|chrome-extension:|#)/.test(href)) continue;
      const target = join(file, '..', href.split('?')[0]);
      try {
        statSync(target);
      } catch {
        problems.push(`${rel(file)} references "${href}", which does not exist`);
      }
    }
  }

  if (problems.length) fail('Every page asset exists', problems);
  else ok('Every page asset exists');
}

section('Wiring: every element the scripts look up exists in the markup');
{
  const problems = [];
  const pages = [
    ['newtab/newtab.html', 'newtab/newtab.js'],
    ['sidebar/sidebar.html', 'sidebar/sidebar.js'],
    ['popup/popup.html', 'popup/popup.js'],
    ['tools/selftest.html', 'tools/selftest.js'],
  ];

  for (const [htmlPath, jsPath] of pages) {
    const html = read(join(ROOT, htmlPath));
    const js = stripComments(read(join(ROOT, jsPath)));
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

    const wanted = new Set();
    for (const m of js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) wanted.add(m[1]);
    for (const m of js.matchAll(/\$\(\s*['"]([\w-]+)['"]\s*\)/g)) wanted.add(m[1]);

    for (const id of wanted) {
      if (!ids.has(id)) problems.push(`${jsPath} looks up #${id}, absent from ${htmlPath}`);
    }
  }

  if (problems.length) fail('Every looked-up element id exists', problems);
  else ok('Every looked-up element id exists');
}

/* ==========================================================================
   Manifest & packaging
   ========================================================================== */

section('Packaging');
{
  const manifest = JSON.parse(read(join(ROOT, 'manifest.json')));
  const problems = [];

  if (manifest.manifest_version !== 3) problems.push('not Manifest V3');
  if (manifest.host_permissions) problems.push('declares host_permissions');

  const expected = ['tabs', 'bookmarks', 'history', 'storage', 'favicon', 'sidePanel'];
  const extra = manifest.permissions.filter((p) => !expected.includes(p));
  if (extra.length) problems.push(`unexpected permissions: ${extra.join(', ')}`);

  const suggested = Object.values(manifest.commands ?? {}).filter((c) => c.suggested_key);
  if (suggested.length > 4) problems.push(`${suggested.length} suggested keys; Chrome allows 4`);

  const csp = manifest.content_security_policy?.extension_pages ?? '';
  if (!csp.includes("script-src 'self'")) problems.push('CSP does not pin script-src to self');

  // default_locale requires _locales to exist, or the extension will not load.
  for (const lang of ['en', 'ar']) {
    try {
      const messages = JSON.parse(read(join(ROOT, '_locales', lang, 'messages.json')));
      for (const key of ['appName', 'appDesc', 'cmdToggleSidebar', 'cmdPalette', 'cmdSaveLater', 'cmdFocusMode']) {
        if (!messages[key]?.message) problems.push(`_locales/${lang} is missing ${key}`);
      }
    } catch {
      problems.push(`_locales/${lang}/messages.json is missing or unreadable`);
    }
  }

  if (problems.length) fail('Manifest is well formed', problems);
  else ok('Manifest is well formed');
}

section('Packaging: nothing reaches the network');
{
  const problems = [];
  for (const file of [...byExt('.js'), ...byExt('.css'), ...byExt('.html')]) {
    if (rel(file).startsWith('tools/')) continue;
    const source = stripComments(read(file));
    source.split('\n').forEach((line, index) => {
      if (/@import\s+url\(\s*['"]?https?:/.test(line)) {
        problems.push(`${rel(file)}:${index + 1}  remote @import`);
      }
      if (/(src|href)\s*=\s*['"]https?:/.test(line)) {
        problems.push(`${rel(file)}:${index + 1}  remote asset reference`);
      }
      if (/fonts\.(googleapis|gstatic)\.com/.test(line)) {
        problems.push(`${rel(file)}:${index + 1}  Google Fonts reference`);
      }
      // fetch() is fine for chrome.runtime.getURL; a literal URL is not.
      if (/fetch\(\s*['"`]https?:/.test(line)) {
        problems.push(`${rel(file)}:${index + 1}  fetch to a remote URL`);
      }
    });
  }

  if (problems.length) fail('No remote resources are referenced anywhere', problems);
  else ok('No remote resources are referenced anywhere');
}

section('Packaging: fonts are bundled');
{
  const fontsCss = read(join(ROOT, 'shared', 'fonts.css'));
  const referenced = [...fontsCss.matchAll(/url\('\.\.\/assets\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
  const present = new Set(readdirSync(join(ROOT, 'assets', 'fonts')));

  const missing = referenced.filter((name) => !present.has(name));
  const families = new Set(
    [...fontsCss.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1])
  );

  const problems = [...missing.map((f) => `missing font file: ${f}`)];
  for (const family of ['Tajawal', 'IBM Plex Sans Arabic', 'IBM Plex Mono']) {
    if (!families.has(family)) problems.push(`no @font-face for ${family}`);
  }

  if (problems.length) fail('Every declared font file is present', problems);
  else ok(`Every declared font file is present (${referenced.length} faces)`);
}

/* ---- Result -------------------------------------------------------------- */

console.log(
  `\n${failures ? '\x1b[31m' : '\x1b[32m'}${checks - failures}/${checks} checks passed\x1b[0m\n`
);
process.exit(failures ? 1 : 0);
