/* Lawha — the checks that only a browser can settle.
 *
 * Everything here is a claim the static suite cannot reach: that the new tab
 * boots and draws a Scene, that onboarding runs once and then never again, that
 * the legibility floor really keeps text over every gradient readable, that the
 * gallery's previews fill their cards and notice a Scene applied elsewhere, and
 * that adding a feed goes fetch -> offscreen parse -> storage -> headline.
 *
 * Contrast is recomputed here from the colours the browser resolved, rather
 * than by calling the same helpers under test, so a wrong answer in
 * shared/utils.js cannot agree with itself and pass.
 *
 * The feed checks need a fixture served over HTTPS, because isValidFeedURL
 * requires it. The certificate is generated on the spot with openssl and thrown
 * away; without openssl those checks are skipped rather than failed, and
 * without a network the public-feed check is skipped too.
 *
 * Dev-only, and slower than the rest — it launches a real Chrome, so it is not
 * part of pre-submission.sh. Run with `node tools/browser-check.mjs`.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const SCENES = ['diwan', 'rasf', 'satr', 'falak', 'warsha'];

let failures = 0;
let skipped = 0;

function check(label, ok, detail = '') {
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function skip(label, why) {
  console.log(`  \x1b[33m·\x1b[0m ${label} — skipped: ${why}`);
  skipped += 1;
}

function section(name) {
  console.log(`\n\x1b[1m▶ ${name}\x1b[0m`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---- Contrast, computed independently ------------------------------------ */

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) =>
  0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255);

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/* A colour-mix() resolves to `color(srgb 0..1 ...)`; a plain token to rgb(). */
function toRgb(value) {
  const numbers = value.match(/[\d.]+/g).map(Number);
  return value.startsWith('color(')
    ? numbers.slice(0, 3).map((v) => v * 255)
    : numbers.slice(0, 3);
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

/** The colour content sits on: `percent` of the canvas washed over the layer. */
function composite(canvas, layer, percent) {
  return canvas.map((c, i) => Math.round(c * (percent / 100) + layer[i] * (1 - percent / 100)));
}

const scrimPercent = (declaration) => Number((declaration.match(/([\d.]+)%/) ?? [0, 0])[1]);

/* ---- An HTTPS feed fixture ----------------------------------------------- */

function makeCertificate(dir) {
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
      '-days', '1', '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1'],
    { stdio: 'ignore' }
  );
  return {
    key: readFileSync(path.join(dir, 'key.pem')),
    cert: readFileSync(path.join(dir, 'cert.pem')),
  };
}

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Lawha Fixture</title><link>https://example.com/</link>
<item><title>الخبر الأول</title><link>https://example.com/one</link></item>
<item><title>Second headline</title><link>https://example.com/two</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Fixture</title>
<link rel="alternate" href="https://atom.example.com/"/>
<entry><title>Atom one</title><link rel="alternate" href="https://atom.example.com/1"/></entry>
</feed>`;

async function startFixture(credentials) {
  const server = createServer(credentials, (request, response) => {
    if (request.url === '/rss.xml') {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      response.end(RSS);
    } else if (request.url === '/atom.xml') {
      response.writeHead(200, { 'Content-Type': 'application/atom+xml; charset=utf-8' });
      response.end(ATOM);
    } else if (request.url === '/html') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html><body>a login wall</body></html>');
    } else {
      response.writeHead(500);
      response.end('no');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `https://127.0.0.1:${server.address().port}` };
}

/* ---- The run ------------------------------------------------------------- */

const seedDone = `const { setPresentation } = await import('../shared/storage.js');
  await setPresentation('onboardingComplete', true); return 1;`;

async function firstRun(browser) {
  section('First run');
  const page = await browser.page('newtab/newtab.html');
  await page.waitFor('!!document.querySelector("dialog[open]")');

  check('onboarding opens on a fresh profile', await page.evaluate('!!document.querySelector("dialog[open]")'));
  const scenes = await page.evaluate('document.querySelectorAll(".onboard-scene").length');
  check('every bundled Scene is offered', scenes === SCENES.length, `${scenes} offered`);

  // Two buttons carry .onboard-go — the Scene step's and the tour's — so the
  // click has to go to whichever step is actually showing.
  const visibleGo = '.onboard-step:not([hidden]) .onboard-go';
  await page.run('document.querySelectorAll(".onboard-scene")[0].click(); return 1;');
  await sleep(300);
  await page.run(`document.querySelector('${visibleGo}').click(); return 1;`);
  await sleep(400);
  check('the tour opens after a Scene is chosen',
    await page.evaluate('!!document.querySelector(".onboard-step:not([hidden]) .onboard-tour-card")'));

  const cards = [];
  for (let i = 0; i < 6; i += 1) {
    const step = await page.run(`
      const next = document.querySelector('${visibleGo}');
      if (!next) return '';
      const title = (document.querySelector('.onboard-tour-title') || {}).textContent || '';
      next.click();
      await new Promise((r) => setTimeout(r, 250));
      return JSON.stringify({ title, open: !!document.querySelector('dialog[open]') });
    `);
    if (!step) break;
    const parsed = JSON.parse(step);
    cards.push(parsed.title);
    if (!parsed.open) break;
  }
  check('the tour runs to the end and closes', cards.length === 4, cards.join(' → '));
  await sleep(500);
  check('finishing is remembered', await page.run(
    `const { get } = await import('../shared/storage.js'); return Boolean(await get('onboardingComplete'));`
  ));

  await page.waitFor('document.querySelectorAll("[data-region]").length > 0');
  const regions = await page.evaluate('[...document.querySelectorAll("[data-region]")].map(n=>n.dataset.region).join(",")');
  const slots = await page.evaluate('[...document.querySelectorAll("[data-slot]")].map(n=>n.dataset.slot).join(",")');
  check('the Scene draws its regions', regions.length > 0, regions);
  check('every module in them rendered',
    await page.evaluate('[...document.querySelectorAll("[data-slot]")].every(s=>s.children.length>0)'), slots);

  const second = await browser.page('newtab/newtab.html');
  await second.waitFor('document.querySelectorAll("[data-region]").length > 0');
  await sleep(400);
  check('onboarding does not come back', !(await second.evaluate('!!document.querySelector("dialog[open]")')));
  check('no exceptions on either run',
    [...page.logs, ...second.logs].filter((l) => l.startsWith('EXCEPTION')).length === 0);

  await second.close();
  await page.close();
}

async function legibility(browser) {
  section('Legibility floor');
  const page = await browser.page('newtab/newtab.html');
  await page.run(seedDone);

  let worstPrimary = Infinity;
  let worstCase = '';
  let flattened = 0;

  for (const scene of SCENES) {
    await page.run(`const { setPresentation } = await import('../shared/storage.js');
      await setPresentation('activeScene', ${JSON.stringify(scene)}); return 1;`);
    await page.evaluate('location.reload()', { awaitPromise: false });
    await sleep(1200);
    await page.waitFor('document.querySelectorAll("[data-region]").length > 0');

    const readings = JSON.parse(await page.run(`
      const bg = await import('../shared/background.js');
      const probe = (name) => {
        const node = document.createElement('span');
        node.style.color = 'var(' + name + ')';
        document.body.appendChild(node);
        const value = getComputedStyle(node).color;
        node.remove();
        return value;
      };
      const out = [];
      for (const preset of bg.GRADIENT_PRESETS) {
        const colors = preset.colors.length >= 3 ? preset.colors : [...preset.colors, preset.colors.at(-1)];
        // a stored scrim of zero: any wash that appears is the floor's doing
        bg.applyBackground({ background: 'gradient', gradient: { colors, angle: preset.angle }, scrim: 0 });
        out.push({
          id: preset.id, colors,
          scrim: getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim').trim(),
          canvas: probe('--bg-canvas'), primary: probe('--text-primary'),
          secondary: probe('--text-secondary'), muted: probe('--text-muted'),
        });
      }
      bg.applyBackground({ background: 'theme', scrim: 0 });
      out.push({ id: '(theme)', colors: [], dataBg: document.documentElement.dataset.bg,
        scrim: getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim').trim() });
      return JSON.stringify(out);
    `));

    for (const reading of readings) {
      if (reading.id === '(theme)') {
        check(`${scene}: a theme background needs no wash`,
          reading.dataBg === 'theme' && scrimPercent(reading.scrim) === 0);
        continue;
      }
      const percent = scrimPercent(reading.scrim);
      const canvas = toRgb(reading.canvas);
      const primary = toRgb(reading.primary);
      for (const stop of reading.colors) {
        const backdrop = composite(canvas, hexToRgb(stop), percent);
        const ratio = contrast(primary, backdrop);
        if (ratio < worstPrimary) {
          worstPrimary = ratio;
          worstCase = `${scene}/${reading.id} at ${percent}%`;
        }
      }
      // the step exists to keep the tiers apart; equal means it collapsed
      if (reading.secondary === reading.primary || reading.muted === reading.secondary) flattened += 1;
    }
  }

  check('text clears 4.5:1 over every gradient, in every Scene',
    worstPrimary >= 4.49, `worst ${worstPrimary.toFixed(2)}:1 — ${worstCase}`);
  check('the quiet tiers stay distinct rather than collapsing to primary',
    flattened === 0, flattened ? `${flattened} combinations flattened` : 'all distinct');

  await page.close();
}

async function gallery(browser) {
  section('Gallery');
  const seed = await browser.page('newtab/newtab.html');
  await seed.run(seedDone);
  await seed.run(`const { setPresentation } = await import('../shared/storage.js');
    await setPresentation('activeScene', 'diwan'); return 1;`);

  const page = await browser.page('gallery/gallery.html');
  await page.waitFor('document.querySelectorAll(".gal-card").length > 0');
  await sleep(2500);

  check('cards are drawn', (await page.evaluate('document.querySelectorAll(".gal-card").length')) >= SCENES.length);
  // Previews mount on intersection, so only the ones in view should have frames.
  check('every card in view has a live preview',
    await page.evaluate(`[...document.querySelectorAll('.gal-card')]
       .filter((c) => c.getBoundingClientRect().top < innerHeight + 200)
       .every((c) => c.querySelector('iframe'))`));
  check('the previews are the real new tab, and painted',
    await page.evaluate(`[...document.querySelectorAll('.gal-card iframe')].every((f) => {
       try { return f.src.includes('newtab.html') && f.contentDocument.querySelectorAll('[data-region]').length > 0; }
       catch { return false; } })`));
  check('exactly one card is marked active',
    (await page.evaluate(`document.querySelectorAll('.gal-card[data-active="true"]').length`)) === 1);

  /* The preview is a 1120px page scaled into whatever the grid column is, so
     the one thing that must hold at every width is that it fills the card. */
  let misfit = '';
  for (const width of [700, 900, 1200, 1500]) {
    await page.width(width);
    await sleep(900);
    const gap = JSON.parse(await page.run(`
      const host = document.querySelector('.gal-card-preview');
      const frame = host.querySelector('iframe');
      if (!frame) return JSON.stringify({ x: 0, y: 0 });
      const a = host.getBoundingClientRect();
      const b = frame.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(a.width - b.width), y: Math.round(a.height - b.height) });
    `));
    if (Math.abs(gap.x) > 2 || Math.abs(gap.y) > 2) {
      misfit += `${width}px: ${gap.x}x${gap.y} off; `;
    }
  }
  check('the preview fills its card at every width', misfit === '', misfit || 'exact at 700–1500px');
  await page.width(1000);

  const stable = JSON.parse(await page.run(`
    const card = document.querySelector('.gal-card');
    card.dataset.probe = 'kept';
    card.querySelector('iframe').dataset.probe = 'kept';
    const { setPresentation } = await import('../shared/storage.js');
    await setPresentation('activeScene', 'falak');
    await new Promise((r) => setTimeout(r, 1500));
    const again = document.querySelector('.gal-card');
    const frame = again && again.querySelector('iframe');
    return JSON.stringify({
      card: Boolean(again && again.dataset.probe === 'kept'),
      frame: Boolean(frame && frame.dataset.probe === 'kept'),
    });
  `));
  check('cards are updated in place, not rebuilt', stable.card && stable.frame);

  await seed.run(`const { setPresentation } = await import('../shared/storage.js');
    await setPresentation('activeScene', 'satr'); return 1;`);
  await sleep(1600);
  const marked = await page.evaluate(`(() => {
    const card = document.querySelector('.gal-card[data-active="true"]');
    return card ? card.querySelector('.gal-card-name').textContent : '(none)';
  })()`);
  check('a Scene applied on another surface reaches the gallery', /satr/i.test(marked), marked);

  await seed.run(`const { setPresentation } = await import('../shared/storage.js');
    await setPresentation('language', 'ar'); return 1;`);
  const arabic = await browser.page('gallery/gallery.html');
  await arabic.waitFor('document.querySelectorAll(".gal-card").length > 0');
  await sleep(2000);
  check('the gallery is right-to-left in Arabic',
    (await arabic.evaluate('document.documentElement.dir')) === 'rtl');
  check('nothing overflows the viewport sideways',
    await arabic.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2'));
  await seed.run(`const { setPresentation } = await import('../shared/storage.js');
    await setPresentation('language', 'en'); return 1;`);

  check('no exceptions', [...page.logs, ...arabic.logs].filter((l) => l.startsWith('EXCEPTION')).length === 0);
  await arabic.close();
  await page.close();
  await seed.close();
}

async function feeds(browser, fixture) {
  section('Feeds');
  const page = await browser.page('newtab/newtab.html');
  await page.run(seedDone);

  if (!fixture) {
    skip('the whole add → fetch → parse → render round trip', 'openssl is not on PATH');
    await page.close();
    return;
  }

  const add = (url) => page.run(`
    const response = await chrome.runtime.sendMessage({ type: 'lawha:add-feed', url: ${JSON.stringify(url)} });
    const { get } = await import('../shared/storage.js');
    const feed = (await get('feeds')).find((f) => f.url === ${JSON.stringify(url)});
    return JSON.stringify({ response, feed: feed ? {
      title: feed.title, siteUrl: feed.siteUrl, lastError: feed.lastError,
      items: feed.items.map((i) => ({ title: i.title, url: i.url ?? i.link })),
    } : null });
  `);

  const rss = JSON.parse(await add(`${fixture.base}/rss.xml`));
  check('an RSS feed is fetched, parsed and stored', rss.response?.ok === true, JSON.stringify(rss.response));
  check('its title and site come from the document',
    rss.feed?.title === 'Lawha Fixture' && rss.feed?.siteUrl === 'https://example.com/');
  check('Arabic item titles survive the offscreen round trip',
    rss.feed?.items[0]?.title === 'الخبر الأول', rss.feed?.items[0]?.title);
  check('item links are kept', rss.feed?.items[0]?.url === 'https://example.com/one');

  const atom = JSON.parse(await add(`${fixture.base}/atom.xml`));
  check('an Atom feed parses through its alternate links',
    atom.response?.ok === true && atom.feed?.items[0]?.url === 'https://atom.example.com/1');

  const wall = JSON.parse(await add(`${fixture.base}/html`));
  check('a page that is not XML is refused', wall.response?.ok === false && !wall.feed);
  const broken = JSON.parse(await add(`${fixture.base}/boom`));
  check('a server error is refused', broken.response?.ok === false && !broken.feed);

  check('the offscreen document was really created',
    await page.run(`const c = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      return c.length > 0;`));

  // Feeds is opt-in twice over: no bundled Scene places it, and the module's
  // own default variant is `off`, so a Scene has to ask for it by name.
  await page.run(`
    const { getScene, remixScene, saveCustomScene } = await import('../shared/scenes.js');
    const { setPresentation } = await import('../shared/storage.js');
    const scene = remixScene(await getScene('diwan'), { name: 'Feed check' });
    scene.modules.feeds = { ...(scene.modules.feeds || {}), enabled: true, variant: 'list' };
    const region = scene.regions.left || Object.values(scene.regions)[0];
    if (!region.modules.includes('feeds')) region.modules.push('feeds');
    await saveCustomScene(scene);
    await setPresentation('activeScene', scene.meta.id);
    return 1;
  `);
  await page.evaluate('location.reload()', { awaitPromise: false });
  await sleep(2000);
  await page.waitFor('document.querySelectorAll("[data-region]").length > 0');

  const drawn = await page.evaluate('!!document.querySelector("[data-slot=feeds]")');
  check('a Scene that places Feeds draws it', drawn);
  if (drawn) {
    const text = await page.evaluate('document.querySelector("[data-slot=feeds]").innerText');
    check('the headlines are on the page', /الخبر الأول|Second headline/.test(text));
    check('a headline is a button, not a bare link',
      await page.evaluate('!!document.querySelector("[data-slot=feeds] button")'));
  }

  check('no exceptions', page.logs.filter((l) => l.startsWith('EXCEPTION')).length === 0);
  await page.close();
}

async function surfaces(browser) {
  section('The other surfaces');
  for (const [name, file] of [['side panel', 'sidebar/sidebar.html'], ['popup', 'popup/popup.html']]) {
    const page = await browser.page(file);
    await page.waitFor('document.body.innerText.trim().length > 0');
    await sleep(900);
    check(`the ${name} renders`, (await page.evaluate('document.body.innerText.trim().length')) > 10);
    check(`the ${name} logs no exception`,
      page.logs.filter((l) => l.startsWith('EXCEPTION')).length === 0);
    await page.close();
  }

  const page = await browser.page('newtab/newtab.html');
  await page.run(seedDone);
  const image = JSON.parse(await page.run(`
    const bg = await import('../shared/background.js');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, 2, 2);
    const probe = (name) => {
      const node = document.createElement('span');
      node.style.color = 'var(' + name + ')';
      document.body.appendChild(node);
      const value = getComputedStyle(node).color;
      node.remove();
      return value;
    };
    bg.applyBackground({ background: 'image', wallpaper: canvas.toDataURL('image/png'), scrim: 0,
      imagePalette: { 'bg-canvas': '#101216', 'bg-card': '#181B21' } });
    const withPalette = {
      dataBg: document.documentElement.dataset.bg,
      scrim: getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim').trim(),
      canvas: probe('--bg-canvas'), primary: probe('--text-primary'),
    };
    bg.applyBackground({ background: 'image', wallpaper: canvas.toDataURL('image/png'), scrim: 30, imagePalette: null });
    const without = getComputedStyle(document.documentElement).getPropertyValue('--bg-scrim').trim();
    return JSON.stringify({ withPalette, without });
  `));
  const percent = scrimPercent(image.withPalette.scrim);
  const ratio = contrast(
    toRgb(image.withPalette.primary),
    composite(toRgb(image.withPalette.canvas), hexToRgb('#101216'), percent)
  );
  check('a dark wallpaper raises the scrim off zero', percent > 0, `${percent}%`);
  check('text clears 4.5:1 over it', ratio >= 4.49, `${ratio.toFixed(2)}:1`);
  check('without an extracted palette the stored scrim is left alone',
    scrimPercent(image.without) === 30);

  const focusPage = await browser.page('newtab/newtab.html');
  await focusPage.waitFor('!!document.querySelector(".l-bg")');
  const focus = JSON.parse(await focusPage.run(`
    const bg = await import('../shared/background.js');
    bg.applyBackground({ background: 'gradient',
      gradient: { colors: ['#0B0E14', '#232B3E', '#232B3E'], angle: 165 }, scrim: 40 });
    const layer = document.querySelector('.l-bg');
    const read = () => getComputedStyle(layer, '::after').opacity;
    document.documentElement.dataset.focus = '';
    await new Promise((r) => setTimeout(r, 700));
    const normal = read();
    document.documentElement.dataset.focus = 'on';
    // the scrim fades rather than snapping, so the value needs time to settle
    await new Promise((r) => setTimeout(r, 1200));
    return JSON.stringify({ normal, focused: read() });
  `));
  check('focus mode takes the scrim off', focus.focused === '0' && focus.normal !== focus.focused,
    `${focus.normal} → ${focus.focused}`);

  await focusPage.close();
  await page.close();
}

/* ---- Main ---------------------------------------------------------------- */

const certDir = mkdtempSync(path.join(tmpdir(), 'lawha-cert-'));
let fixture = null;
try {
  fixture = await startFixture(makeCertificate(certDir));
} catch {
  fixture = null;
}

let browser;
try {
  browser = await launch({ extension: ROOT });
} catch (error) {
  console.error(`\n\x1b[31m${error.message}\x1b[0m\n`);
  process.exit(1);
}

console.log(`\n${browser.chromeVersion} · extension ${browser.extensionId}`);

try {
  await firstRun(browser);
  await legibility(browser);
  await gallery(browser);
  await feeds(browser, fixture);
  await surfaces(browser);
} finally {
  await browser.kill();
  if (fixture) fixture.server.close();
  try {
    rmSync(certDir, { recursive: true, force: true });
  } catch {
    // a temp dir; it can wait for the operating system
  }
}

const tail = skipped ? ` (${skipped} skipped)` : '';
if (failures === 0) {
  console.log(`\n\x1b[32m✓ Every browser check passed${tail}.\x1b[0m\n`);
} else {
  console.log(`\n\x1b[31m✗ ${failures} browser check(s) failed${tail}.\x1b[0m\n`);
  process.exit(1);
}
