/**
 * popup.js
 * The toolbar popup: hosts the same tuning panel the side panel does.
 */

/* Lawha — the toolbar popup.
 *
 * The same tuning panel the side panel hosts, at popup width, plus a way into
 * the side panel itself. The Scene builder used to live here; it now lives in
 * the gallery, where there is room for a preview and a decision worth making
 * slowly. The link at the foot of the panel goes there. */

import { mountTuningPanel } from '../shared/tuning.js';
import { applyPresentation, getScene } from '../shared/scenes.js';
import { initI18n, applyStrings } from '../shared/i18n.js';
import { mountIconSprite } from '../shared/icons.js';
import { icon } from '../shared/utils.js';
import { get } from '../shared/storage.js';

const toastNode = document.getElementById('toast');

/** Long enough to read a short sentence, short enough not to linger. */
const TOAST_MS = 2600;

function toast(message) {
  toastNode.textContent = message;
  toastNode.hidden = false;
  clearTimeout(toast.handle);
  toast.handle = setTimeout(() => {
    toastNode.hidden = true;
  }, TOAST_MS);
}

async function boot() {
  mountIconSprite();
  await initI18n();
  applyStrings();

  document.getElementById('mark').append(icon('logo', 20));

  const scene = await getScene(await get('activeScene'));
  await applyPresentation(scene);

  await mountTuningPanel(document.getElementById('tune'), { onToast: toast });

  document.getElementById('open-sidebar').addEventListener('click', async () => {
    // sidePanel.open needs a user gesture, which this click is.
    const { id: windowId } = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId });
    window.close();
  });
}

boot();
