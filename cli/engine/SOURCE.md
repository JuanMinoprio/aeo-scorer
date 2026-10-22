# Vendored engine

These files are a copy of the AEO rule engine in the juanminoprio.com repo
(`src/lib/aeo-scorer/`), the same code that runs behind the web scorer.
The only change is that relative imports carry explicit `.ts` extensions so
Node 22.18+ runs them with no build step.

Synced from commit: `b2d9138`

Do not edit these files here. Change the engine upstream, then run
`scripts/sync-engine.sh <path-to-juanminoprio.com>` and `npm test`.
