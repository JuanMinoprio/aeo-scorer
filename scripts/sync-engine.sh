#!/usr/bin/env bash
# Re-vendor the AEO rule engine from a local juanminoprio.com checkout.
# Usage: scripts/sync-engine.sh ../juanminoprio.com
# Copies the engine files and rewrites relative imports to explicit .ts
# extensions so Node can run them without a build step.
set -euo pipefail
SITE="${1:?usage: scripts/sync-engine.sh <path-to-juanminoprio.com>}"
SRC="$SITE/src/lib/aeo-scorer"
DEST="$(cd "$(dirname "$0")/.." && pwd)/cli/engine"
[ -f "$SRC/rules.ts" ] || { echo "no engine at $SRC" >&2; exit 1; }
# SOURCE.md records the commit, so refuse uncommitted engine edits.
if [ -n "$(git -C "$SITE" status --porcelain -- src/lib/aeo-scorer)" ]; then
  echo "uncommitted changes in $SRC; commit them first" >&2; exit 1
fi
mkdir -p "$DEST/dimensions"
for f in extract.ts rules.ts types.ts index.ts dimensions/semantic-coherence.ts; do
  # Strip a .js suffix, then add .ts to every extensionless relative specifier.
  sed -E 's#(from "\.{1,2}/[^"]*)\.js"#\1"#; s#(from "\.{1,2}/[^"]*[a-z-])"#\1.ts"#' "$SRC/$f" > "$DEST/$f"
done
# Every relative import must resolve to a vendored file, or the CLI breaks at runtime.
missing=0
for f in $(cd "$DEST" && find . -name '*.ts'); do
  for spec in $(grep -oE 'from "\.{1,2}/[^"]+"' "$DEST/$f" | sed -E 's/from "(.*)"/\1/'); do
    target="$(dirname "$DEST/$f")/$spec"
    [ -f "$target" ] || { echo "$f imports $spec, which is not vendored: add it to the file list" >&2; missing=1; }
  done
done
[ "$missing" = 0 ] || exit 1
SHA="$(git -C "$SITE" rev-parse --short HEAD)"
sed -i.bak -E "s#^Synced from commit: .*#Synced from commit: \`$SHA\`#" "$DEST/SOURCE.md" && rm -f "$DEST/SOURCE.md.bak"
echo "Synced engine from $SHA. Run: npm test"
