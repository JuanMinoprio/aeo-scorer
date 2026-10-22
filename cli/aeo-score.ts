#!/usr/bin/env node
// aeo-score: offline, deterministic AEO rule-layer scorer.
//
// Runs the same rule engine that powers https://juanminoprio.com/tools/aeo-scorer
// (vendored in ./engine, see engine/SOURCE.md). No network calls, no API keys,
// no dependencies. Requires Node.js 22.18+ (native TypeScript type stripping).
//
// Usage:
//   node cli/aeo-score.ts post.md [more.md ...]
//   cat page.html | node cli/aeo-score.ts -
//   node cli/aeo-score.ts --json --min 45 docs/*.md   # CI gate: exit 1 below 45/73

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { scoreContentRules, scoreSemanticCoherence, stripBoilerplate, detectFormat, RULE_BASED_MAX } from "./engine/index.ts";
import type { RuleBasedInput, RuleBasedResult, DimensionKey, ContentFormat } from "./engine/index.ts";
import { extractDateSignal } from "./engine/extract.ts";

const MAX_BYTES = 2_000_000;

const LABELS: Record<DimensionKey, string> = {
  authority: "Authority",
  entity: "Entity",
  structural: "Structural",
  qSubheadings: "Q-Subheadings",
  freshness: "Freshness",
};

const HELP = `aeo-score: score content for AI-engine citation readiness (rule layer, offline)

Usage: node cli/aeo-score.ts [options] <file ...|->

Options:
  --json             Print machine-readable JSON (always an array, one entry per file)
  --min <n>          Exit with code 1 if any file scores below n (0-${RULE_BASED_MAX})
  --published <date> Fallback publication date (YYYY-MM-DD), used only for files
                     with no date of their own (front matter, <time>, meta tags)
  --format <f>       Force input format: html | markdown | text
  -h, --help         Show this help

The rule layer covers ${RULE_BASED_MAX} of the 100 rubric points. The remaining
points need LLM judgment: run /aeo-scorer in Claude Code, or the web tool at
https://juanminoprio.com/tools/aeo-scorer for the full score.`;

interface Options {
  json: boolean;
  min?: number;
  published?: string;
  format?: ContentFormat;
  files: string[];
}

function fail(msg: string): never {
  process.stderr.write(`aeo-score: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { json: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? fail(`${a} needs a value`);
    if (a === "-h" || a === "--help") {
      process.stdout.write(HELP + "\n");
      process.exit(0);
    } else if (a === "--json") opts.json = true;
    else if (a === "--min") {
      const v = next();
      const n = Number(v);
      if (!/^\d+$/.test(v) || n > RULE_BASED_MAX) fail(`--min must be a whole number 0-${RULE_BASED_MAX}`);
      opts.min = n;
    } else if (a === "--published") {
      const d = next();
      const t = Date.parse(`${d}T00:00:00Z`);
      // Round-trip rejects rollovers like 2026-02-31; the engine ignores future dates.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d)
        fail("--published must be a real date, YYYY-MM-DD");
      if (t > Date.now()) fail("--published cannot be in the future");
      opts.published = d;
    } else if (a === "--format") {
      const f = next();
      if (f !== "html" && f !== "markdown" && f !== "text") fail("--format must be html, markdown, or text");
      opts.format = f;
    } else if (a.startsWith("-") && a !== "-") fail(`unknown option ${a} (try --help)`);
    else opts.files.push(a);
  }
  if (opts.files.length === 0) {
    process.stdout.write(HELP + "\n");
    process.exit(2);
  }
  return opts;
}

function read(file: string): string {
  const buf = file === "-" ? readFileSync(0) : readFileSync(file);
  if (buf.length > MAX_BYTES) throw new Error(`larger than ${MAX_BYTES / 1_000_000} MB`);
  return buf.toString("utf8");
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function frontMatterDate(block: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const m = block.match(new RegExp(`^${key}:\\s*["']?(\\d{4}-\\d{2}-\\d{2}[^"'\\s]*)`, "mi"));
    if (m) return m[1];
  }
  return undefined;
}

// Turn a raw file into engine input the way the web tool would see it:
// markdown front matter becomes meta (and leaves the scored body), and full
// HTML pages lose nav/footer/scripts via the engine's own stripBoilerplate.
function prepare(raw: string, opts: Options): RuleBasedInput {
  let content = raw;
  let meta: RuleBasedInput["meta"] = {};
  const fm = content.match(FRONT_MATTER);
  if (fm) {
    meta.publishedAt = frontMatterDate(fm[1], ["date", "published", "publishedAt", "pubDate"]);
    meta.updatedAt = frontMatterDate(fm[1], ["updated", "updatedAt", "lastmod", "modified"]);
    content = content.slice(fm[0].length);
  }
  const format = opts.format ?? detectFormat(content);
  if (format === "html" && /<(html|body|head)\b/i.test(content)) {
    // stripBoilerplate drops <head> meta tags, so read the page date first.
    const pageDate = extractDateSignal(content, "html", undefined, new Date());
    if (pageDate.iso && !meta.publishedAt) meta.publishedAt = pageDate.iso;
    content = stripBoilerplate(content);
  }
  if (opts.published && extractDateSignal(content, format, meta, new Date()).iso === null) {
    meta.publishedAt = opts.published;
  }
  if (!meta.publishedAt) delete meta.publishedAt;
  if (!meta.updatedAt) delete meta.updatedAt;
  return { content, format, meta: Object.keys(meta).length ? meta : undefined };
}

function bar(score: number, max: number): string {
  const ratio = max === 0 ? 0 : score / max;
  return ratio >= 0.75 ? "✓" : ratio >= 0.4 ? "⚠" : "✗";
}

function render(name: string, r: RuleBasedResult, coherence: ReturnType<typeof scoreSemanticCoherence>): string {
  const lines = [
    `File: ${name} (${r.wordCount} words, ${r.formatDetected})`,
    `AEO rule-layer score: ${r.total} / ${r.maxTotal}`,
    "",
  ];
  for (const key of Object.keys(LABELS) as DimensionKey[]) {
    const d = r.byDimension[key];
    const top = d.evidence[0] ? `  · ${d.evidence[0]}` : "";
    lines.push(`  ${LABELS[key].padEnd(14)}${String(d.score).padStart(2)}/${String(d.max).padEnd(3)}${bar(d.score, d.max)}${top}`);
  }
  lines.push("");
  lines.push(`Anti-gaming flags: ${r.ruleGamingFlags.length ? r.ruleGamingFlags.join(", ") : "none"}`);
  lines.push(`Semantic coherence (LinkedIn, reported separately): ${coherence.total}/20 ${coherence.band}`);
  return lines.join("\n");
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  let belowMin = false;
  let readErrors = 0;
  const results: object[] = [];

  for (const file of opts.files) {
    const name = file === "-" ? "stdin" : basename(file);
    let raw: string;
    try {
      raw = read(file);
    } catch (err) {
      // Keep going: one bad path should not hide the scores of every other file.
      const reason = (err as NodeJS.ErrnoException).code ?? (err as Error).message;
      process.stderr.write(`aeo-score: cannot read ${file}: ${reason}\n`);
      if (opts.json) results.push({ file: name, error: reason });
      readErrors++;
      continue;
    }
    const input = prepare(raw, opts);
    const r = scoreContentRules(input);
    const coherence = scoreSemanticCoherence({ content: input.content, format: input.format });
    if (opts.min !== undefined && r.total < opts.min) belowMin = true;

    if (opts.json) results.push({ file: name, ...r, semanticCoherence: coherence });
    else process.stdout.write(render(name, r, coherence) + "\n\n");
  }

  if (opts.json) process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  else
    process.stdout.write(
      "This is the deterministic rule layer. For the full 100-point score with LLM judgment,\n" +
        "run /aeo-scorer in Claude Code or https://juanminoprio.com/tools/aeo-scorer\n",
    );
  // exitCode (not exit()) lets piped stdout finish flushing first.
  process.exitCode = readErrors ? 2 : belowMin ? 1 : 0;
}

main();
