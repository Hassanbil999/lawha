# Bundled typefaces

These files ship inside the extension so that opening a new tab never touches
the network. Fetching them from a CDN would be a request on every page load and
would leak the timing of your browsing to a third party.

| Family | Role | Weights | Copyright |
|---|---|---|---|
| **Tajawal** | Display | 500, 700 | © Boutros Fonts |
| **IBM Plex Sans Arabic** | Body / UI | 300, 400, 500, 600 | © IBM Corp. |
| **IBM Plex Mono** | Metadata | 400 | © IBM Corp. |

All three are licensed under the **SIL Open Font License, Version 1.1**, which
permits bundling and redistribution with software. Full text:
<https://openfontlicense.org>

## Why one file per subset

Each weight is split by Unicode range — `-arabic`, `-latin`, `-latin-ext` — and
declared with a matching `unicode-range` in `shared/fonts.css`. The browser then
downloads only the ranges a page actually uses, so a Latin-only new tab never
decodes 44 KB of Arabic glyph outlines, and an Arabic one never decodes the
Latin extended set.

## Regenerating

```
python tools/fetch-fonts.py
```

Downloads the woff2 files and rewrites `shared/fonts.css`. Build-time only —
nothing in the shipped extension runs it, and it is the only step in this
project that touches the network.
