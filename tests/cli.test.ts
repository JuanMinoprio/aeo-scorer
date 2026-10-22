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
  const [out] = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out.byDimension).sort(), ["authority", "entity", "freshness", "qSubheadings", "structural"]);
  assert.equal(out.maxTotal, 73);
});

test("--min gates CI with exit code 1", () => {
  assert.equal(run(["--min", "73", "-"], DOC).status, 1);
  assert.equal(run(["--min", "0", "-"], DOC).status, 0);
});

test("--json is always an array, even for one file", () => {
  assert.ok(Array.isArray(JSON.parse(run(["--json", "-"], DOC).stdout)));
});

test("front-matter dates count and --published never overrides a real date", () => {
  const today = new Date().toISOString().slice(0, 10);
  const fm = `---\ntitle: x\ndate: ${today}\n---\n${DOC}`;
  const [withFm] = JSON.parse(run(["--json", "--published", "2020-01-01", "-"], fm).stdout);
  assert.ok(withFm.byDimension.freshness.score > 0, "front-matter date should win over --published");
  assert.doesNotMatch(withFm.byDimension.freshness.evidence.join(" "), /2020/);
  const [fallback] = JSON.parse(run(["--json", "--published", today, "-"], DOC).stdout);
  assert.ok(fallback.byDimension.freshness.score > 0, "--published should fill a missing date");
});

test("full HTML pages are scored without nav and footer boilerplate", () => {
  const page = `<html><head><meta property="article:published_time" content="${new Date().toISOString()}"></head>
<body><nav>Home About Pricing Careers Blog Contact Login Signup</nav><article><h1>Title</h1><p>Body text here.</p></article>
<footer>Copyright Acme Inc 2019</footer></body></html>`;
  const [r] = JSON.parse(run(["--json", "-"], page).stdout);
  assert.ok(r.wordCount < 10, `expected boilerplate stripped, got ${r.wordCount} words`);
  assert.ok(r.byDimension.freshness.score > 0, "head date should survive stripping");
});

test("bad input exits 2 with a message, not a stack trace", () => {
  const missing = run(["does-not-exist.md"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read .*ENOENT/);
  for (const bad of [["--min", "999"], ["--min", ""], ["--min", "0x10"], ["--published", "yesterday"], ["--published", "2026-02-31"], ["--published", "2999-01-01"]])
    assert.equal(run([...bad, "-"], DOC).status, 2, bad.join(" "));
});

test("one unreadable file does not hide the others' scores", () => {
  const r = run(["--json", "does-not-exist.md", "-"], DOC);
  assert.equal(r.status, 2);
  const out = JSON.parse(r.stdout);
  assert.equal(out.length, 2);
  assert.equal(out[0].error, "ENOENT");
  assert.equal(typeof out[1].total, "number");
});
