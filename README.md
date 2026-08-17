# Lawha · لوحة

Your browser's new tab, redesigned as a personal canvas.

## What it does

Lawha replaces Chrome's blank new tab with a page you arrange yourself: the
links you actually use, the pages you were just on, your bookmark folders, a few
notes, and a short queue of things to read later. A side panel lists the tabs
open in the current window, and lets you adjust how the whole thing looks
without leaving the page you are looking at.





## Scenes

A Scene is a JSON file describing a complete arrangement: the colour palette,
the grid, and the variant every module renders in. Five ship with the extension
— Diwan, Rasf, Satr, Falak and Warsha — and switching between them changes the
layout, not just the paint.

Open the gallery from the side panel to browse them, apply one, or build your
own by remixing an existing Scene. Export saves it as a file; anyone who imports
that file sees exactly what you saw. Switching Scenes never touches your notes,
shortcuts or reading queue — that boundary is enforced in the storage layer, not
left to good intentions.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `?` | Show every shortcut. Press again to dismiss |
| `Ctrl+K` | Search open tabs, bookmarks and history at once |
| `/` | The same search, from the new tab |
| `Ctrl+Shift+P` | The same search, from any page in the browser |
| `Ctrl+Shift+L` | Show or hide the side panel |
| `Ctrl+Shift+S` | Save the current page to read later |
| `Ctrl+Shift+F` | Focus mode — the time and the day, nothing else |
| `A`–`Z` | Filter your shortcuts by typing, with the grid focused |
| `Esc` | Close the search, clear a filter, or leave focus mode |

On macOS, `⌘` replaces `Ctrl` throughout.

If `Ctrl+Shift+P` doesn't open the command palette, go to
`chrome://extensions/shortcuts` and assign it manually — Chrome silently
declines a shortcut another extension already claimed.


## Privacy

Lawha makes no network requests at all. There is no server, no account, no
analytics and no telemetry — fonts are bundled, icons are drawn from path data,
and colours are computed on your machine.

Everything you create stays in your browser's own storage, and the extension
asks for no host permissions, so it cannot read the content of any page you
visit.

You can check all of this yourself: open a new tab, open DevTools → Network, and
reload. Every request will be a local `chrome-extension://` one, and filtering by
domain will leave the list empty.

## Development

No dependencies and no build step — it is HTML, CSS and JavaScript as shipped.
`bash tools/pre-submission.sh` runs every check: syntax, craft rules, colour
contrast, the data-preservation guard, manifest validity and translation
completeness. `tools/selftest.html`, loaded as an extension page, runs the
data-preservation test against real storage.

## License
MIT

---
