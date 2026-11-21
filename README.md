# Lawha · لوحة

![vibe coded](https://img.shields.io/badge/vibe-coded-ff69b4) ![status](https://img.shields.io/badge/status-v1.1.1-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

> **In one line:** a Chrome extension that replaces the boring new-tab page with a personal canvas you arrange yourself.

---

## 1. The idea (why it exists)

Chrome's new tab is mostly empty. Lawha (لوحة = "board / painting") turns it into a page made of the things you actually use:

- the links you visit most,
- the pages you were just on,
- your bookmark folders,
- a few notes,
- a short "read later" queue.

A **side panel** lists the open tabs in your window and lets you change the whole look without leaving the page.

## 2. Main concepts (notes)

### Modules = the building blocks
Each box on the page is a module (in `modules/`):

| Module | What it does |
|---|---|
| `clock` | Time and date |
| `waqt` (وقت) | A thin line showing how far through the day you are |
| `shortcuts` | Your favourite links |
| `recent` | Pages you just visited |
| `bookmarks` | Your bookmark folders |
| `notes` | Quick notes |
| `later` | Read-later queue |
| `search` | Search tabs, bookmarks and history together |
| `feeds` (متابعات) | RSS/Atom headlines. Opt-in, off by default |

### Scenes = whole looks
A **Scene** is one JSON file that describes everything: colour palette, grid layout, and which style each module uses.
Five come built in: **Diwan, Rasf, Satr, Falak, Warsha** (`scenes/`).

- Switching Scene changes the *layout*, not just the colours.
- You can remix a Scene, export it as a file, and anyone who imports it sees exactly what you saw.
- Switching Scenes **never** touches your notes, shortcuts or reading list. The storage layer enforces this.

### Palette from image
`shared/palette-from-image.js` + `shared/kmeans.js` pull colours out of an image using **k-means** (group similar pixel colours, take the centre of each group).

## 3. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `?` | Show every shortcut |
| `Ctrl+K` or `/` | Search open tabs, bookmarks and history |
| `Ctrl+Shift+P` | Same search, from any page |
| `Ctrl+Shift+L` | Show / hide the side panel |
| `Ctrl+Shift+S` | Save current page to read later |
| `Ctrl+Shift+F` | Focus mode: just the time and the day |
| `A`–`Z` | Filter shortcuts by typing (with the grid focused) |
| `Esc` | Close search, clear filter, or leave focus mode |

On macOS use `⌘` instead of `Ctrl`.
If `Ctrl+Shift+P` doesn't work, set it in `chrome://extensions/shortcuts`. Chrome ignores a shortcut another extension already took.

## 4. Privacy (important)

- **No server, no account, no analytics, no tracking.** Fonts are bundled, icons are drawn from code, colours are computed on your machine.
- **Only exception: Feeds.** If you turn it on, your browser fetches the RSS URLs *you* added, directly from those sites. That's why the extension asks for a host permission. It has no content scripts, so it can't read or change the pages you visit.
- Everything you create stays in your browser's local storage.
- **Check it yourself:** open DevTools → Network on a new tab. With Feeds off, every request is a local `chrome-extension://` one.

Full policy: `privacy-policy.html`.

## 5. Folder map

| Path | What's inside |
|---|---|
| `manifest.json` | Extension settings (Manifest V3) |
| `newtab/` | The new-tab page |
| `sidebar/` | The side panel |
| `popup/` | Toolbar popup |
| `gallery/` | Browse, apply and remix Scenes |
| `modules/` | The building blocks listed above |
| `scenes/` | The five built-in Scenes (JSON) |
| `shared/` | Common code: storage, palette, i18n, icons, messaging |
| `background.js`, `offscreen.*` | Background worker; offscreen page parses feeds |
| `_locales/` | Arabic and English text |
| `tools/` | Checks, headless browser test, zip builder |
| `docs/store-listing.md` | Chrome Web Store listing text |

## 6. How to run it

No dependencies, no build step. It's plain HTML, CSS and JavaScript.

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Open a new tab.

### Checks before publishing
```bash
bash tools/pre-submission.sh     # syntax, craft rules, contrast, data-safety guard, manifest, translations
node tools/browser-check.mjs     # loads the extension in headless Chrome and tests it for real
bash tools/build-zip.sh          # makes the zip for the Chrome Web Store
```
- `browser-check.mjs` checks the new tab boots, onboarding runs once, text is readable (4.5:1) over every Scene's background, gallery previews fill their cards, and a feed goes fetch → parse → storage → headline. It's slower and needs Chrome, so it's separate. Run it on any change that touches rendering.
- `tools/selftest.html` (opened as an extension page) tests that your data survives, using real storage.

## 7. Status

- ✅ Version 1.1.1, feature-complete, with store listing and privacy policy ready.
- ✅ Arabic + English.

## License
MIT
