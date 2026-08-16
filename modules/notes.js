/**
 * notes.js
 * The notes module: cards, strip and stack variants, with checkbox lines.
 */

/* Lawha — notes.
 *
 * Variants: cards · strip · stack · off
 *
 * `off` hides notes. It does not delete them. Six notes written in Diwan are
 * six notes in Falak, sitting in storage untouched, waiting for a Scene that
 * shows them again.
 *
 * Note bodies are user text and go in and out through textarea.value and
 * textContent only.
 *
 * CHECKBOXES, AND WHERE THIS STOPS
 * A line beginning `[ ]` draws as an empty box and `[x]` as a ticked one, and
 * clicking the box rewrites that one character. That is the entire formatting
 * feature. No bold, no headings, no links — the moment notes grow a syntax they
 * stop being somewhere to put a thought and start being a document editor.
 *
 * The text stays plain in storage, exactly as typed. `[x] milk` is six
 * characters and a space either way; the rendering is a reading of the string,
 * never a schema. A note written here opens as readable text anywhere else, and
 * nothing has to migrate if this feature is ever taken back out. */

import { el, uid, contextMenu, debounce, replaceChildren } from '../shared/utils.js';
import { get, updateData, capped, LIMITS } from '../shared/storage.js';

export const id = 'notes';

/** `[ ] buy milk` — leading space, the mark, the rest of the line. */
const CHECK_LINE = /^(\s*)\[([ xX])\]\s?(.*)$/;

/** Show the character counter only once the end is in sight — within 20% of
 *  the cap, per the input limits table. */
const COUNTER_FROM = Math.floor(LIMITS.noteBody * 0.8);

export async function render(cfg, ctx) {
  if (cfg.variant === 'off') return null;

  const all = await get('notes');
  const ordered = [...all].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const shown = ordered.slice(0, cfg.max);

  const wrap = el('div', { class: `notes notes-${cfg.variant}` });

  shown.forEach((note, index) => {
    const card = buildNote(note, ctx);
    if (cfg.variant === 'stack') {
      // A stack, not a fan: a couple of pixels of offset each, no rotation
      // beyond a degree. If it draws attention to itself it has failed.
      card.style.setProperty('--stack-index', String(index));
      card.style.setProperty('--stack-depth', String(shown.length - index));
    }
    wrap.append(card);
  });

  wrap.append(buildAdd(ctx));

  if (!all.length) {
    wrap.append(el('p', { class: 'l-empty', text: ctx.t('notes_empty') }));
  }

  return ctx.section('sec_notes', wrap, { module: id });
}

/**
 * One note: a rendered reading view, and the textarea it becomes when you go to
 * write in it. Only one of the two is ever visible, which is what lets a
 * checkbox be a real button instead of a character you have to aim a caret at.
 */
function buildNote(note, ctx) {
  let text = capped(note.text, LIMITS.noteBody);

  const field = el('textarea', {
    class: 'note-body',
    rows: '4',
    maxlength: String(LIMITS.noteBody),
    placeholder: ctx.t('note_placeholder'),
    'aria-label': ctx.t('sec_notes'),
    spellcheck: 'false',
  });
  // Assigning .value, never innerHTML: the note is the user's text and it goes
  // in as a string or not at all.
  field.value = text;

  const view = el('div', { class: 'note-view' });
  const counter = el('span', { class: 'note-count', 'aria-hidden': 'true' });

  const card = el('article', { class: 'l-card note', dataset: { id: note.id } }, [
    view,
    field,
    counter,
  ]);

  const save = debounce(async (next) => {
    await writeNote(note.id, next);
  }, 400);

  function paintCounter() {
    const remaining = LIMITS.noteBody - text.length;
    const near = text.length >= COUNTER_FROM;
    counter.hidden = !near;
    if (near) counter.textContent = ctx.fmtNum(remaining);
  }

  function paintView() {
    replaceChildren(view, renderLines(text, ctx, toggleLine));
    paintCounter();
  }

  /** Flip one `[ ]` to `[x]` or back. One character, in place — the rest of the
   *  line, and every other line, is left exactly as it was written. */
  async function toggleLine(index) {
    const lines = text.split('\n');
    lines[index] = lines[index].replace(
      CHECK_LINE,
      (_, pad, mark, rest) => `${pad}[${mark === ' ' ? 'x' : ' '}] ${rest}`
    );
    text = lines.join('\n');
    field.value = text;
    paintView();
    await writeNote(note.id, text);
  }

  field.addEventListener('input', () => {
    text = capped(field.value, LIMITS.noteBody);
    paintCounter();
    save(text);
  });

  field.addEventListener('focus', () => card.classList.add('is-editing'));
  field.addEventListener('blur', () => {
    card.classList.remove('is-editing');
    paintView();
  });

  // Clicking the reading view puts you in the text, unless you were aiming at a
  // checkbox — which stops the event itself.
  view.addEventListener('click', () => {
    card.classList.add('is-editing');
    // A frame later: the textarea is display:none until that class lands, and
    // focus() on something not being rendered does nothing at all.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
  });

  paintView();

  const remove = el('button', {
    class: 'l-icon-btn note-remove',
    type: 'button',
    'aria-label': ctx.t('action_delete'),
    on: {
      click: async () => {
        await updateData('notes', (current) => current.filter((n) => n.id !== note.id));
        ctx.refresh(id);
      },
    },
  });
  remove.append(ctx.icon('close'));
  card.append(remove);

  card.addEventListener('contextmenu', (event) =>
    contextMenu(event, [
      {
        label: ctx.t('action_delete'),
        icon: 'trash',
        danger: true,
        onSelect: async () => {
          await updateData('notes', (current) => current.filter((n) => n.id !== note.id));
          ctx.refresh(id);
        },
      },
    ])
  );

  return card;
}

/** Read the note as lines, turning the ones that start with a mark into
 *  checkboxes and leaving every other line as the text it is. */
function renderLines(text, ctx, onToggle) {
  if (!text.trim()) {
    return [el('p', { class: 'note-line note-line-empty', text: ctx.t('note_placeholder') })];
  }

  return text.split('\n').map((line, index) => {
    const match = CHECK_LINE.exec(line);

    // An ordinary line. A blank one still needs a box to sit in, or the note
    // loses the space the person deliberately left.
    if (!match) {
      return el('p', { class: 'note-line', text: line || ' ' });
    }

    const checked = match[2].toLowerCase() === 'x';
    const box = el('button', {
      class: 'note-check',
      type: 'button',
      role: 'checkbox',
      'aria-checked': String(checked),
      'aria-label': match[3] || ctx.t('sec_notes'),
      on: {
        click: (event) => {
          // The view underneath opens the editor. This click is not for it.
          event.stopPropagation();
          onToggle(index);
        },
      },
    });
    box.append(ctx.icon('check', 12));

    return el(
      'p',
      { class: 'note-line note-line-check', dataset: { checked: String(checked) } },
      [box, el('span', { class: 'note-check-text', text: match[3] })]
    );
  });
}

async function writeNote(noteId, text) {
  await updateData('notes', (current) =>
    current.map((n) => (n.id === noteId ? { ...n, text: capped(text, LIMITS.noteBody) } : n))
  );
}

function buildAdd(ctx) {
  const button = el(
    'button',
    {
      class: 'l-card note note-add',
      type: 'button',
      'aria-label': ctx.t('action_add'),
      on: {
        click: async () => {
          await updateData('notes', (current) => [
            { id: uid(), text: '', created: Date.now() },
            ...current,
          ]);
          await ctx.refresh(id);
          // Land the caret in the note that was just made. The card has to be
          // put into editing first — the textarea is not focusable while the
          // reading view is the one on show.
          const fresh = document.querySelector('.notes .note:not(.note-add)');
          fresh?.classList.add('is-editing');
          requestAnimationFrame(() => fresh?.querySelector('.note-body')?.focus());
        },
      },
    },
    [ctx.icon('plus', 20)]
  );
  return button;
}
