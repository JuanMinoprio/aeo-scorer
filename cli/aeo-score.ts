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
import { scoreContentRules, scoreSemanticCoherence, RULE_BASED_MAX } from "./engine/index.ts";
import type { RuleBasedResult, DimensionKey } from "./engine/index.ts";

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
  --json             Print machine-readable JSON (one object per file)
  --min <n>          Exit with code 1 if any file scores below n (0-${RULE_BASED_MAX})
  --published <date> Publication date (YYYY-MM-DD) when the file has none
  --format <f>       Force input format: html | markdown | text
  -h, --help         Show this help

The rule layer covers ${RULE_BASED_MAX} of the 100 rubric points. The remaining
points need LLM judgment: run /aeo-scorer in Claude Code, or the web tool at
https://juanminoprio.com/tools/aeo-scorer for the full score.`;

interface Options {
  json: boolean;
  min?: number;
  published?: string;
  format?: "html" | "markdown" | "text";
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
      const n = Number(next());
      if (!Number.isFinite(n) || n < 0 || n > RULE_BASED_MAX) fail(`--min must be 0-${RULE_BASED_MAX}`);
      opts.min = n;
    } else if (a === "--published") {
      const d = next();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) fail("--published must be YYYY-MM-DD");
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
  if (buf.length > MAX_BYTES) fail(`${file} is larger than ${MAX_BYTES / 1_000_000} MB`);
  return buf.toString("utf8");
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
  const results: object[] = [];

  for (const file of opts.files) {
    let content: string;
    try {
      content = read(file);
    } catch (err) {
      fail(`cannot read ${file}: ${(err as NodeJS.ErrnoException).code ?? String(err)}`);
    }
    const r = scoreContentRules({
      content,
      format: opts.format,
      meta: opts.published ? { publishedAt: opts.published } : undefined,
    });
    const coherence = scoreSemanticCoherence({ content, format: opts.format ?? r.formatDetected });
    if (opts.min !== undefined && r.total < opts.min) belowMin = true;

    const name = file === "-" ? "stdin" : basename(file);
    if (opts.json) results.push({ file: name, ...r, semanticCoherence: coherence });
    else process.stdout.write(render(name, r, coherence) + "\n\n");
  }

  if (opts.json) process.stdout.write(JSON.stringify(results.length === 1 ? results[0] : results, null, 2) + "\n");
  else
    process.stdout.write(
      "This is the deterministic rule layer. For the full 100-point score with LLM judgment,\n" +
        "run /aeo-scorer in Claude Code or https://juanminoprio.com/tools/aeo-scorer\n",
    );
  if (belowMin) process.exit(1);
}

main();
