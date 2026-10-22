import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../cli/aeo-score.ts", import.meta.url));
const run = (args: string[], input?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { input, encoding: "utf8" });

const DOC = "# How AI engines cite\n\nBy Jane Doe\n\n## What is AEO?\n\nAEO is how 42% of 2026 searches end.\n";

test("scores stdin and prints the rule-layer total", () => {
  const r = run(["-"], DOC);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /AEO rule-layer score: \d+ \/ 73/);
});

test("--json emits parseable output with all five dimensions", () => {
  const r = run(["--json", "-"], DOC);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out.byDimension).sort(), ["authority", "entity", "freshness", "qSubheadings", "structural"]);
  assert.equal(out.maxTotal, 73);
});

test("--min gates CI with exit code 1", () => {
  assert.equal(run(["--min", "73", "-"], DOC).status, 1);
  assert.equal(run(["--min", "0", "-"], DOC).status, 0);
});

test("bad input exits 2 with a message, not a stack trace", () => {
  const missing = run(["does-not-exist.md"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read .*ENOENT/);
  assert.equal(run(["--min", "999", "-"], DOC).status, 2);
  assert.equal(run(["--published", "yesterday", "-"], DOC).status, 2);
});
