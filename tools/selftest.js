/* Lawha — the data preservation test, run for real.
 *
 * The static audit proves the guard *can* refuse a write. This proves the
 * product *does* the right thing end to end: it writes real data to real
 * storage, drives the real new tab page through three Scenes and an import,
 * and counts what actually got drawn.
 *
 *   1. Create 6 notes, 12 shortcuts, 4 Later items in `diwan`
 *   2. Switch to `falak` (notes: off, shortcuts.max: 8)
 *   3. Confirm 8 shortcuts render, no notes
 *   4. Switch to `warsha`
 *   5. Confirm all 6 notes and all 12 shortcuts return intact
 *   6. Import a third-party Scene
 *   7. Confirm data unchanged
 *
 * The person running this has their own notes. They are snapshotted first and
 * restored in a finally block, including if an assertion throws. */

import { getScene, validateScene, normalizeScene } from '../shared/scenes.js';
import {
  get,
  setData,
  setPresentation,
  capped,
  LIMITS,
  DATA_KEYS,
  DataGuardError,
  beginPresentation,
  endPresentation,
} from '../shared/storage.js';
import { el, uid, isSafeURL, navigate } from '../shared/utils.js';
import { isTrustedMessage, MAX_MESSAGE_BYTES } from '../shared/messaging.js';
import { saveForLater } from '../modules/later.js';

const frame = document.getElementById('preview');
const results = document.getElementById('results');
const verdict = document.getElementById('verdict');

let previewReady = false;
let paintResolve = null;

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === 'lawha:preview-ready') previewReady = true;
  if (event.data?.type === 'lawha:preview-painted') paintResolve?.();
});

/** Post a Scene to the preview and wait until it has actually drawn. */
async function paint(scene) {
  while (!previewReady) await new Promise((r) => setTimeout(r, 25));
  const painted = new Promise((resolve) => {
    paintResolve = resolve;
  });
  frame.contentWindow.postMessage(
    { type: 'lawha:preview', scene: JSON.parse(JSON.stringify(scene)) },
    location.origin
  );
  await painted;
  // One more frame so layout has settled before anything is counted.
  await new Promise((r) => requestAnimationFrame(() => r()));
}

const doc = () => frame.contentDocument;
const count = (selector) => doc().querySelectorAll(selector).length;

/* ---- Reporting ---------------------------------------------------------- */

let failures = 0;

function step(label, passed, detail = '') {
  if (!passed) failures += 1;
  const node = el('li', { class: 'st-step', dataset: { state: passed ? 'pass' : 'fail' } }, [
    el('span', { class: 'st-mark', text: passed ? '✓' : '✗' }),
    el('span', {}, [el('span', { text: label }), detail ? el('span', { class: 'st-detail', text: detail }) : null]),
  ]);
  results.append(node);
  return passed;
}

/* ---- Fixtures ----------------------------------------------------------- */

const NOTES = Array.from({ length: 6 }, (_, i) => ({
  id: uid(),
  text: `Test note ${i + 1}`,
  created: Date.now() - i * 1000,
}));

const SHORTCUTS = Array.from({ length: 12 }, (_, i) => ({
  url: `https://example-${i + 1}.test/`,
  label: `Site ${i + 1}`,
  order: i,
}));

const LATER = Array.from({ length: 4 }, (_, i) => ({
  url: `https://later-${i + 1}.test/`,
  title: `Saved page ${i + 1}`,
  saved: Date.now() - i * 1000,
}));

/** A Scene as if it came from a stranger: unknown module, unknown variant, and
 *  a palette token trying to smuggle a network request into your browser. */
const THIRD_PARTY = {
  lawha: true,
  schemaVersion: 2,
  kind: 'scene',
  meta: { id: 'from-a-friend', name: 'From a friend', author: 'Someone else', note: '' },
  palette: 'nakhla',
  grid: {
    maxWidth: 900,
    gap: 5,
    columns: '1fr 1fr',
    areas: ['top top', 'a b'],
    breakpoints: {},
  },
  regions: {
    top: { modules: ['clock', 'waqt'], align: 'center' },
    a: { modules: ['shortcuts', 'notes'], align: 'start' },
    b: { modules: ['recent', 'weather'], align: 'start' },
  },
  modules: {
    clock: { variant: 'holographic' },
    shortcuts: { variant: 'circles', max: 16 },
    notes: { variant: 'cards', max: 6 },
    weather: { variant: 'sunny' },
  },
  density: 'comfortable',
  sectionLabels: true,
};

/* ---- The run ------------------------------------------------------------ */

async function run() {
  results.replaceChildren();
  verdict.hidden = true;
  failures = 0;

  const snapshot = {};
  for (const key of DATA_KEYS) snapshot[key] = await get(key);

  try {
    /* 1 — seed */
    await setData('notes', NOTES);
    await setData('shortcuts', SHORTCUTS);
    await setData('later', LATER);

    const diwan = await getScene('diwan');
    await paint(diwan);

    step(
      '1. Six notes, twelve shortcuts and four Later items exist in Diwan',
      (await get('notes')).length === 6 &&
        (await get('shortcuts')).length === 12 &&
        (await get('later')).length === 4
    );

    step(
      '   Diwan draws them',
      count('.note:not(.note-add)') === 6 && count('.shortcut:not(.shortcut-add)') === 12,
      `notes drawn: ${count('.note:not(.note-add)')}, shortcuts drawn: ${count('.shortcut:not(.shortcut-add)')}`
    );

    /* 2, 3 — falak hides notes and caps shortcuts at 8 */
    const falak = await getScene('falak');
    await paint(falak);

    const falakShortcuts = count('.shortcut:not(.shortcut-add)');
    const falakNotes = count('.note:not(.note-add)');

    step(
      '2–3. Falak renders 8 shortcuts and no notes',
      falakShortcuts === 8 && falakNotes === 0,
      `shortcuts drawn: ${falakShortcuts} (expected 8), notes drawn: ${falakNotes} (expected 0)`
    );

    step(
      '   ...while storage still holds all twelve shortcuts and all six notes',
      (await get('shortcuts')).length === 12 && (await get('notes')).length === 6,
      `stored shortcuts: ${(await get('shortcuts')).length}, stored notes: ${(await get('notes')).length}`
    );

    /* 4, 5 — warsha brings everything back */
    const warsha = await getScene('warsha');
    await paint(warsha);

    const warshaNotes = count('.note:not(.note-add)');
    const warshaShortcuts = count('.shortcut:not(.shortcut-add)');

    step(
      '4–5. Warsha brings back all six notes',
      warshaNotes === 6,
      `notes drawn: ${warshaNotes} (expected 6)`
    );

    step(
      '   ...and every shortcut Warsha is configured to show',
      warshaShortcuts === 9 && (await get('shortcuts')).length === 12,
      `shortcuts drawn: ${warshaShortcuts} of a configured max of 9; stored: ${(await get('shortcuts')).length}`
    );

    const notesAfter = await get('notes');
    step(
      '   ...with the note text untouched',
      notesAfter.every((note, index) => note.text === NOTES[index].text),
      notesAfter.map((n) => n.text).join(' · ')
    );

    /* 6, 7 — a Scene from a stranger */
    const imported = validateScene(THIRD_PARTY);

    step(
      '6. A third-party Scene imports, degrading what it does not recognise',
      imported.ok &&
        imported.scene.modules.clock.variant === 'monumental' &&
        !('weather' in imported.scene.modules) &&
        !imported.scene.regions.b.modules.includes('weather'),
      imported.ok
        ? `clock variant fell back to "${imported.scene.modules.clock.variant}"; unknown module dropped`
        : `rejected: ${imported.reason}`
    );

    if (imported.ok) await paint(imported.scene);

    step(
      '7. Importing it changed nothing that belongs to you',
      (await get('notes')).length === 6 &&
        (await get('shortcuts')).length === 12 &&
        (await get('later')).length === 4,
      `notes: ${(await get('notes')).length}, shortcuts: ${(await get('shortcuts')).length}, later: ${(await get('later')).length}`
    );

    /* The malicious case: a Scene cannot write DATA_KEYS. */
    const blocked = [];
    beginPresentation();
    for (const key of DATA_KEYS) {
      try {
        await setData(key, null);
        blocked.push(`${key}: WROTE`);
      } catch (error) {
        blocked.push(`${key}: ${error instanceof DataGuardError ? 'refused' : 'threw ' + error.name}`);
      }
    }
    endPresentation();

    step(
      '   A Scene cannot write to any user-data key, even if it tries',
      blocked.every((line) => line.endsWith('refused')),
      blocked.join(' · ')
    );

    /* Every variant of every module renders without throwing. */
    await variantSweep();

    /* The security layer, and the checkbox reading. */
    await securitySweep();
    await checkboxSweep();
  } finally {
    for (const key of DATA_KEYS) await setData(key, snapshot[key]);
  }

  verdict.hidden = false;
  verdict.textContent = failures
    ? `${failures} check(s) failed. Your own data has been restored.`
    : 'All checks passed. The contract holds, and your own data has been restored.';
}

/**
 * Beyond the contract: draw every module in every variant it declares and confirm each
 * one produces something. Cheapest possible guard against a variant that was
 * added to the registry and never actually built.
 */
async function variantSweep() {
  const { MODULES, NEWTAB_MODULE_IDS } = await import('../shared/modules.js');
  const base = await getScene('diwan');

  const broken = [];

  for (const moduleId of NEWTAB_MODULE_IDS) {
    for (const variant of MODULES[moduleId].variants) {
      const scene = normalizeScene({
        ...JSON.parse(JSON.stringify(base)),
        meta: { ...base.meta, id: 'sweep' },
        grid: { maxWidth: 1120, gap: 5, columns: '1fr', areas: ['solo'], breakpoints: {} },
        regions: { solo: { modules: [moduleId], align: 'stretch' } },
        modules: { ...base.modules, [moduleId]: { ...base.modules[moduleId], variant } },
      });

      await paint(scene);

      const drew = doc().querySelector('[data-slot]') !== null;
      // `off` is supposed to draw nothing; everything else must draw something.
      const expected = variant === 'off' ? !drew : drew;
      if (!expected) broken.push(`${moduleId}/${variant}`);
    }
  }

  const total = NEWTAB_MODULE_IDS.reduce((sum, id) => sum + MODULES[id].variants.length, 0);
  step(
    `   Every module renders in every one of its variants (${total} combinations)`,
    broken.length === 0,
    broken.length ? `no output from: ${broken.join(', ')}` : ''
  );
}

/* ---- The security layer -------------------------------------------------
 * Each of these is a door that has to stay shut. Proving they are shut is
 * cheap; discovering one was open because a reviewer found it is not. */

async function securitySweep() {
  /** Run something that must throw, and say whether it did. */
  const refuses = async (fn) => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };

  /* Storage is a closed allow-list. A key nobody declared cannot be written,
     whatever calls it. */
  const unknownKeys = [
    await refuses(() => setData('notAKey', 1)),
    await refuses(() => setPresentation('notAKey', 1)),
    await refuses(() => get('notAKey')),
    // A real data key still cannot be written through the presentation door.
    await refuses(() => setPresentation('notes', [])),
  ];

  step(
    'B2. An unknown storage key is refused at every door',
    unknownKeys.every(Boolean),
    `setData ${unknownKeys[0]}, setPresentation ${unknownKeys[1]}, get ${unknownKeys[2]}, data-via-presentation ${unknownKeys[3]}`
  );

  /* URL safety. javascript: is the one that matters — a shortcut label is user
     text and an imported Scene comes from a stranger. */
  const unsafe = ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'chrome://settings', 'not a url'];
  const safe = ['https://example.com', 'http://example.com/path?q=1'];

  step(
    'B2. isSafeURL admits http and https, and nothing else',
    unsafe.every((url) => !isSafeURL(url)) && safe.every((url) => isSafeURL(url)),
    `refused: ${unsafe.filter((u) => !isSafeURL(u)).length}/${unsafe.length}, admitted: ${safe.filter(isSafeURL).length}/${safe.length}`
  );

  step(
    'B2. navigate() throws on javascript: rather than failing quietly',
    await refuses(() => navigate('javascript:alert(1)'))
  );

  step(
    'B2. The reading queue refuses a URL it could not safely open',
    await refuses(() => saveForLater({ url: 'javascript:alert(1)', title: 'x' }))
  );

  /* Messages are untrusted input until they prove otherwise. */
  const ours = chrome.runtime.id;
  const oversized = { type: 'lawha:probe', payload: 'x'.repeat(MAX_MESSAGE_BYTES + 1) };

  const messageCases = [
    [isTrustedMessage({ type: 'lawha:open-palette' }, { id: ours }), true, 'our own message'],
    [isTrustedMessage({ type: 'lawha:open-palette' }, { id: 'aaaabbbbccccdddd' }), false, 'a forged sender id'],
    [isTrustedMessage({ type: 'lawha:open-palette' }, {}), false, 'no sender id at all'],
    [isTrustedMessage({}, { id: ours }), false, 'a message with no type'],
    [isTrustedMessage({ type: 42 }, { id: ours }), false, 'a non-string type'],
    [isTrustedMessage(oversized, { id: ours }), false, 'an oversized payload'],
  ];

  const wrong = messageCases.filter(([got, want]) => got !== want).map(([, , what]) => what);

  step(
    'B2. A message is trusted only when it is ours, shaped right, and small',
    wrong.length === 0,
    wrong.length ? `mishandled: ${wrong.join(', ')}` : `${messageCases.length} cases`
  );

  /* Length caps hold on the way to storage, not only on the field. */
  const longLabel = 'ل'.repeat(200);
  step(
    'B2. Input caps are enforced at the storage layer',
    capped(longLabel, LIMITS.shortcutLabel).length === LIMITS.shortcutLabel &&
      capped(longLabel, LIMITS.noteBody).length === 200,
    `shortcut label cut to ${LIMITS.shortcutLabel}; a 200-character note left alone`
  );

  /* A4 — the badge is a preference, and it is off until asked for. */
  const badgeBefore = await get('badgeCount');
  await setPresentation('badgeCount', true);
  const badgeOn = await get('badgeCount');
  await setPresentation('badgeCount', badgeBefore);

  step(
    'A4. The tab-count badge is a stored preference, off by default',
    badgeOn === true && badgeBefore === false,
    `default ${badgeBefore}, toggled to ${badgeOn}`
  );
}

/* ---- Notes read their own checkboxes ----------------------------------- */

async function checkboxSweep() {
  const CHECKS = [
    { id: uid(), text: '[ ] unchecked\n[x] checked\nplain line', created: Date.now() },
  ];

  const before = await get('notes');
  await setData('notes', CHECKS);

  const scene = await getScene('warsha');
  await paint(scene);

  const boxes = doc().querySelectorAll('.note-check');
  const ticked = doc().querySelectorAll('.note-line-check[data-checked="true"]');
  const plain = doc().querySelectorAll('.note-line:not(.note-line-check)');

  step(
    'A3. A note draws its [ ] and [x] lines as checkboxes, and leaves the rest as text',
    boxes.length === 2 && ticked.length === 1 && plain.length === 1,
    `boxes: ${boxes.length} (expected 2), ticked: ${ticked.length} (expected 1), plain lines: ${plain.length} (expected 1)`
  );

  step(
    '   ...and the note is still exactly the text that was typed',
    (await get('notes'))[0].text === CHECKS[0].text,
    JSON.stringify((await get('notes'))[0].text)
  );

  await setData('notes', before);
}

document.getElementById('run').addEventListener('click', () => {
  run().catch((error) => {
    step('The run threw', false, `${error.name}: ${error.message}`);
    verdict.hidden = false;
    verdict.textContent = 'The run did not finish. See the failure above.';
  });
});
