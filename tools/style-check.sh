#!/bin/bash
# Lawha — the style rules a Chrome Web Store scanner cares about.
#
# Three things must not appear in shipped JavaScript: `var`, leftover logging,
# and unfinished-work markers. All three read to a reviewer as code that was not
# ready to be submitted, and the first is a genuine bug source besides.
#
# `tools/` is excluded because it never ships — see the zip step in B7.
#
# Dev-only. Run with `bash tools/style-check.sh`. Exits non-zero on any hit.

cd "$(dirname "$0")/.." || exit 1

status=0

# Shipped JavaScript only: not tools, not dependencies, not the repo metadata.
sources() {
  find . -name '*.js' \
    -not -path './tools/*' \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './.claude/*'
}

check() {
  local label="$1"
  local pattern="$2"
  local hits
  hits=$(sources | xargs grep -nE "$pattern" 2>/dev/null)

  if [ -n "$hits" ]; then
    echo "  ✗ $label"
    echo "$hits" | sed 's/^/      /'
    status=1
  else
    echo "  ✓ $label"
  fi
}

echo "▶ Style"

# `\bvar\b` rather than "var " so `var(--token)` in a template string and any
# identifier ending in "var" are both left alone.
check "no var declarations"        '(^|[^A-Za-z0-9_$.])var[[:space:]]+[A-Za-z_$]'
check "no console.log"             'console\.(log|debug|info)\('
check "no unfinished-work markers" '(TODO|FIXME|HACK|XXX)'

# console.error inside a catch is allowed and wanted — an error that reaches a
# person should be visible. console.warn is not: it is almost always debugging
# that outlived its usefulness.
check "no console.warn"            'console\.warn\('

exit $status
