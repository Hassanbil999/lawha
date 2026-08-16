#!/bin/bash
# Lawha — everything that has to be true before the zip is built.
#
# Runs every check in order and stops at the first failure. A clean run is the
# only thing that should precede a submission; a reviewer finding any of this
# costs days of round-trip, and all of it is preventable here in seconds.
#
# Dev-only, and excluded from the zip. Run with `bash tools/pre-submission.sh`.

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

echo ""
echo "▶ Syntax — every shipped file parses as an ES module"
node tools/syntax-check.mjs

echo "▶ Audit — craft rules, palette contrast, the data guard"
node tools/audit.mjs

echo "▶ Style — no var, no console.log, no unfinished-work markers"
bash tools/style-check.sh

echo ""
echo "▶ Security — no markup injection, no dynamic code"
security_hits=0

# Comment lines are dropped before matching. This codebase documents the rules
# it follows, and a file explaining that it never assigns innerHTML should not
# be flagged for containing the word.
scan() {
  local label="$1"
  local pattern="$2"
  local hits
  hits=$(find . -name '*.js' \
    -not -path './tools/*' \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './.claude/*' \
    | xargs grep -nE "$pattern" 2>/dev/null \
    | grep -vE '^[^:]*:[0-9]+:[[:space:]]*(\*|//|/\*)' || true)

  if [ -n "$hits" ]; then
    echo "  ✗ $label"
    echo "$hits" | sed 's/^/      /'
    security_hits=1
  else
    echo "  ✓ $label"
  fi
}

scan "no innerHTML assignment"  'innerHTML[[:space:]]*='
scan "no outerHTML assignment"  'outerHTML[[:space:]]*='
scan "no insertAdjacentHTML"    'insertAdjacentHTML'
scan "no document.write"        'document\.write'
scan "no eval"                  '(^|[^A-Za-z0-9_$.])eval[[:space:]]*\('
scan "no Function constructor"  'new[[:space:]]+Function'

[ "$security_hits" -eq 0 ] || exit 1

echo ""
echo "▶ Manifest"
node tools/validate-manifest.mjs

echo "▶ Locales"
node tools/check-locales.mjs

echo "▶ Assets"
for size in 16 32 48 128; do
  if [ -f "assets/icon-${size}.png" ]; then
    echo "  ✓ assets/icon-${size}.png"
  else
    echo "  ✗ assets/icon-${size}.png is missing"
    exit 1
  fi
done

echo ""
echo "▶ Privacy policy"
if [ ! -s "privacy-policy.html" ]; then
  echo "  ✗ privacy-policy.html is missing or empty"
  exit 1
fi

# The template ships with placeholders. Publishing it with them still in is a
# rejection, so they are a hard failure rather than a note.
if grep -q '\[your contact email\]\|\[your repository URL\]' privacy-policy.html; then
  echo "  ✗ privacy-policy.html still has placeholders in it"
  grep -n '\[your contact email\]\|\[your repository URL\]' privacy-policy.html | sed 's/^/      /'
  echo "      Fill these in and host the page before submitting."
  exit 1
fi
echo "  ✓ privacy-policy.html is filled in"

echo ""
echo "✓ All checks passed. Safe to zip and submit."
echo ""
