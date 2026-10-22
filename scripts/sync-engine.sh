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
mkdir -p "$DEST/dimensions"
for f in extract.ts rules.ts types.ts index.ts dimensions/semantic-coherence.ts; do
  sed -E 's#(from "\.{1,2}/[^"]*[a-z-])"#\1.ts"#' "$SRC/$f" > "$DEST/$f"
done
SHA="$(git -C "$SITE" rev-parse --short HEAD)"
sed -i.bak -E "s#^Synced from commit: .*#Synced from commit: \`$SHA\`#" "$DEST/SOURCE.md" && rm -f "$DEST/SOURCE.md.bak"
echo "Synced engine from $SHA. Run: npm test"
