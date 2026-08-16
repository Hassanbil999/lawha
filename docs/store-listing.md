# Lawha · لوحة — Chrome Web Store listing

Everything the Developer Dashboard asks for, written out. Copy each block into
the matching field. Nothing here is generated at build time — if the product
changes, this file changes with it, because a listing that overstates what the
extension does is one of the three most common first-round rejections.

Not shipped: `docs/` is excluded from the zip.

---

## Name — 30 / 45 characters

```
Lawha — لوحة · Personal Canvas
```

## Short description — 100 / 132 characters

```
A calm new tab that's yours to design. Tabs, bookmarks, notes — in layouts you build and share free.
```

## Category

**Productivity**

## Long description

```
Lawha replaces Chrome's blank new tab with a personal canvas you design.

Unlike other new tab extensions, Lawha lets you change not just colors — but the entire layout. Choose how your bookmarks display (cards, shelf, tree, tiles). Choose how your shortcuts appear (circles, a ring around the clock, a plain list). Build a complete Scene — palette + layout + style — and share it as a file with anyone, free, no account needed.

WHAT IT DOES
· New tab becomes your personal desktop: shortcuts, recent pages, bookmark folders, notes, and a reading queue
· Side panel lists the tabs open in this window — filter as you type, and pin, mute, close or save one for later
· The same panel tunes the canvas while you look at it — colours, density, background, language — without leaving the page
· One search finds any open tab, bookmark, or history entry at once
· A hairline arc at the top of the page shows where you are in your day — no labels, just ambient
· Start typing over your shortcuts to filter them; press ? at any time for the full keyboard list

ARABIC SUPPORT
Lawha is written for Arabic speakers, not translated for them. Full RTL layout, native Arabic fonts, real Arabic phrasing throughout.

PRIVACY
Zero network requests. No accounts. No analytics. No tracking. Everything lives in your browser. You can verify this in Chrome DevTools → Network tab — it will be empty.

COMPLETELY FREE
No paid features, no subscription, no freemium wall. The scene-sharing system is a file you export and send to whoever you want.

SCENES — SHAREABLE LAYOUTS
A Scene is a JSON file that defines everything: colors, layout, and how each module displays. Five are built in (Diwan, Rasf, Satr, Falak, Warsha). Build your own, export it, share it anywhere.
```

> **Changed from the Patch C draft:** the line naming `Ctrl+K` now says "One search"
> without a key. The global shortcut moved to `Ctrl+Shift+P` in the final manifest
> and `Ctrl+K` only works on a Lawha page, so naming either one in the listing
> would be a claim a reviewer could test and find half-true. The keyboard list
> lives in the product, on `?`.

---

## Screenshots — 5 minimum, 1280×800

These have to be captured from a real browser, so they are the one part of the
submission that cannot be prepared from the source tree.

1. **Diwan** scene, English, Waraq palette — the default, and the calmest
2. **Rasf** scene, Arabic, RTL, Hibr palette — proves the RTL claim at a glance
3. **Falak** scene — the orbit. The showpiece; put it third so it lands after
   the reader knows what they are looking at
4. **Sidebar** open in List mode alongside an ordinary page
5. **Gallery** page showing scene cards
6. **Istikhrāj** — a photo background before and after palette extraction

At least one must show Arabic/RTL. Screenshot 2 covers it.

### Capturing them

```bash
# Load the unpacked extension, then open a window with no browser chrome
chrome --app="chrome-extension://<your-extension-id>/newtab/newtab.html" \
       --window-size=1280,800
```

Take the shot with the OS screenshot tool, not Chrome's own capture — Chrome's
adds device-pixel scaling that lands at 2560×1600 and gets rejected for size.
Fill the page with plausible content first: a dozen shortcuts, three or four
notes, a couple of things in the reading queue. Empty modules photograph badly
and make the product look unfinished.

## Promotional tile — 440×280

A dark tile: `--bg-canvas` from the Hibr palette (`#121316`), the name
"Lawha · لوحة" in Tajawal 700, centred, with the hairline Waqt arc as the only
decoration. No gradients, no screenshots, no feature bullets.

---

## Dashboard answers

| Question | Answer |
|---|---|
| Does your extension use remote code? | **No** |
| Does your extension handle user data? | **Yes** |
| — what kind | Browsing history (read at render, never stored or transmitted); website content? **No**; personal communications? **No**; location? **No**; financial? **No**; authentication? **No** |
| Is data sold to third parties? | **No** |
| Is data used or transferred for purposes unrelated to core functionality? | **No** |
| Is data used to determine creditworthiness? | **No** |
| Visibility | **Public** — unlisted extensions do not appear in search |

## Privacy policy URL

`privacy-policy.html` in the repository root, hosted on GitHub Pages. It names
`hassanbil999@gmail.com` as the contact — change that line if you would rather a
different address appear publicly, since the store listing makes it reachable.

`tools/pre-submission.sh` fails if the placeholder text ever comes back.

The reviewer cross-checks the policy against the manifest's permission list.
Both currently name the same six: `tabs`, `bookmarks`, `history`, `storage`,
`favicon`, `sidePanel`. If a permission is ever added, the policy has to gain a
paragraph in the same commit.

---

## Before hitting Submit

- [ ] `bash tools/pre-submission.sh` passes with no failures
- [ ] Developer account has 2-Step Verification enabled
- [ ] $5 registration fee paid
- [ ] Privacy policy is live at a public URL and matches the manifest
- [ ] 5+ screenshots at 1280×800, at least one showing Arabic/RTL
- [ ] Promotional tile uploaded at 440×280
- [ ] Long description makes no claim the extension does not fulfil
- [ ] Zip built per `tools/pre-submission.sh` output, excluding `tools/` and `docs/`

## After submitting

Expect 3–7 days for the first review; submission volume has been high through
2026. If it comes back rejected, read the rejection code and fix that one item
rather than arguing — the second review is usually much faster. For a new tab
extension the common first-round reasons are, in order: a privacy policy that
does not account for every permission, a permission that looks unnecessary for
the described functionality, and a screenshot showing something the description
never mentions.
