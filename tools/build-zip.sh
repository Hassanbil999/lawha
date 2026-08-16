#!/bin/bash
# Lawha — build the submission zip.
#
# Runs every pre-submission check first and refuses to package anything if one
# fails. What goes in is source: readable, commented, unminified JavaScript, the
# way the Web Store wants to receive it. There is no build step to strip.
#
# What stays out: the tools that produced the checks, the docs, the repository
# metadata. A reviewer does not need them, and shell scripts inside a package
# make scanners nervous for no benefit.
#
# Run with `bash tools/build-zip.sh`.

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

bash tools/pre-submission.sh

version=$(node -p "require('./manifest.json').version")
name="lawha-${version}.zip"
out="../${name}"

rm -f "$out"

# Zipped from the parent so paths inside are relative to the extension root —
# Chrome rejects a package whose manifest.json is inside a folder.
zip -r -q "$out" . \
  --exclude '.git/*' \
  --exclude '.claude/*' \
  --exclude 'tools/*' \
  --exclude 'docs/*' \
  --exclude 'node_modules/*' \
  --exclude '*.sh' \
  --exclude '*.zip' \
  --exclude '.gitignore' \
  --exclude '.DS_Store'

echo ""
echo "✓ Built ${name}"
echo "  $(cd .. && du -h "$name" | cut -f1) · $(unzip -l "$out" | tail -1 | awk '{print $2}') files"
echo ""
echo "  Next: upload at https://chrome.google.com/webstore/devconsole"
echo "  Listing copy and the submission checklist are in docs/store-listing.md"
echo ""
