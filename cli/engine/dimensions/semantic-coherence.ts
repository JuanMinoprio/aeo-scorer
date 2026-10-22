/**
 * Dimension 8 — Semantic Coherence (360Brew-aligned LinkedIn signals).
 *
 * Research-aligned, not LinkedIn-certified. Inspired by the 360Brew paper's
 * description of LinkedIn-platform-specific dwell-time / topic-authority /
 * semantic-depth / engagement-bait signals.
 *
 * Reported alongside the canonical 100-pt AEO score, never folded in.
 * Backward-compatible for all existing API consumers.
 *
 * Score range: 0-20. Composed of four sub-signals:
 *
 *   1. Dwell-time proxy        (0-10)
 *   2. Topic authority         (0-4)
 *   3. Semantic depth          (0-6)
 *   4. Engagement-bait penalty (0-4, deducted from a starting +4)
 *
 * Bands:
 *   0-11  → fail
 *   12-14 → warn
 *   15-24 → pass  (clamped at SEMANTIC_COHERENCE_MAX = 20)
 *
 * TICKET-C / JUA-387 (2026-05-27): rebalanced after 10 published LinkedIn
 * posts produced 0 PASS, 1 WARN, 9 FAIL against the old boundaries. Three
 * changes were needed; the ticket explicitly authorized rescaling weights
 * when the simpler "move the boundary" fix proved insufficient.
 *
 *   (a) WARN/PASS boundary lowered from 17 to 15.
 *   (b) topicAuthority comparison widened from first vs last paragraph to
 *       first vs last 25% of body, AND Jaccard thresholds relaxed from
 *       0.45 / 0.30 to 0.25 / 0.15. Bookend hooks pivot intentionally.
 *   (c) dwellTimeProxy cap raised from 6 to 10 with a substantive-length
 *       ladder (100+ tokens +3, 200+ tokens +6, 400+ tokens +8, additive
 *       on top of the original a/b/c sub-signals, then clamped at the
 *       cap). Long substantive posts empirically demonstrate dwell-time
 *       even when they use implicit reasoning ("Not X. Y." contrast
 *       structures) rather than the explicit "because / the reason is"
 *       framing the semanticDepth gate looks for.
 *   (d) semanticDepth: mechanism paragraph requirement lowered from 3
 *       sentences to 2, and the connective threshold is tiered (1 = +1,
 *       2+ = +3) so a single explicit explanatory line still earns credit.
 *   (e) Four new explanatory connectives added: "that's why", "which is
 *       why", "driven by", "the catch is".
 *
 * Total maximum stays 20 (Math.min applied in the public API). The rescaled
 * envelope is dwell(10) + topic(4) + depth(6) + bait(4) = 24, which the
 * final clamp pulls back to 20. This preserves the 0-20 contract for all
 * existing API consumers and keeps the band ladder intact.
 */

import { detectFormat } from "../extract.ts";
import type {
  ContentFormat,
  SemanticCoherenceBand,
  SemanticCoherenceScore,
  SemanticCoherenceSignals,
} from "../types.ts";
import { SEMANTIC_COHERENCE_MAX } from "../types.ts";

export type { SemanticCoherenceBand, SemanticCoherenceScore, SemanticCoherenceSignals };
export { SEMANTIC_COHERENCE_MAX };

// Local plain-text conversion that PRESERVES paragraph breaks (double newlines).
// The shared `plainText()` in extract.ts collapses all whitespace into single
// spaces, which would collapse the entire piece into one paragraph and zero
// out the topicAuthority signal. Dim 8 needs paragraph boundaries to compute
// dwell-time density and first/last paragraph token overlap.
function stripHtmlPreservingParagraphs(html: string): string {
  return html
    // Convert closing block-level tags into double newlines so paragraph
    // structure survives the strip.
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|article|section)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainTextPreservingParagraphs(content: string, format: ContentFormat): string {
  if (format === "html") return stripHtmlPreservingParagraphs(content);
  if (format === "markdown") {
    return content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]+`/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[#>\-*]+\s+/gm, "")
      .replace(/[*_~]+/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  // Plain text: preserve newline structure, just normalize horizontal whitespace.
  return content
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Local input type
// ---------------------------------------------------------------------------

export interface SemanticCoherenceInput {
  content: string;
  format?: ContentFormat;
}

// ---------------------------------------------------------------------------
// Front-loaded CTA bait phrases (case-insensitive, checked in the first 3 lines).
// Mirrors the engagement-bait list but with an "if/agree/below" framing
// pattern, which is what makes the opener feel like bait rather than copy.
// ---------------------------------------------------------------------------

const FRONT_LOADED_CTA_PATTERNS: RegExp[] = [
  /\blike\s+if\s+you\s+agree\b/i,
  /\bshare\s+this\s+if\b/i,
  /\bcomment\s+below\s+if\b/i,
  /\bdrop\s+your\s+thoughts\b/i,
];

// Logical progression markers reward sustained narrative arc.
const PROGRESSION_MARKERS: RegExp[] = [
  /\bfirst\b/i,
  /\bthen\b/i,
  /\bbecause\b/i,
  /\bthe\s+catch\b/i,
  /\bwhat\s+changed\b/i,
];

// Explanatory connectives, surface a WHY/HOW framing.
const EXPLANATORY_CONNECTIVES: RegExp[] = [
  /\bbecause\b/i,
  /\bthe\s+reason\s+is\b/i,
  /\bthis\s+works\s+because\b/i,
  /\bthe\s+mechanism\s+is\b/i,
  /\bthis\s+matters\s+because\b/i,
  // Matches both straight ASCII apostrophe and the curly form (macOS/iOS auto-substitution).
  /\bthat['']s\s+why\b/i,
  /\bwhich\s+is\s+why\b/i,
  /\bdriven\s+by\b/i,
  /\bthe\s+catch\s+is\b/i,
];

// Engagement-bait phrases. Each detected phrase costs 1 point off the +4 floor.
const ENGAGEMENT_BAIT_PATTERNS: RegExp[] = [
  /\bwhat\s+do\s+you\s+think\b/i,
  /\blike\s+if\s+you\s+agree\b/i,
  /\bdrop\s+a\s+comment\b/i,
  /\bcomment\s+below\b/i,
  /\btag\s+someone\s+who\b/i,
  /\braise\s+your\s+hand\s+if\b/i,
  /\bshare\s+if\s+you\b/i,
  /\bagree\?/i,
  /\bthoughts\?/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function countSentences(paragraph: string): number {
  // Count terminators; clamp to >=1 for any non-empty paragraph so a
  // hard-wrapped line without punctuation still counts as one sentence.
  const matches = paragraph.match(/[.!?]+(?:\s|$)/g);
  const n = matches ? matches.length : 0;
  return Math.max(1, n);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was",
  "one", "our", "out", "his", "has", "had", "how", "its", "who", "did", "yes",
  "she", "him", "use", "any", "may", "new", "now", "way", "get", "see", "two",
  "this", "that", "with", "from", "they", "have", "your", "what", "when",
  "which", "their", "there", "where", "would", "could", "should", "about",
  "into", "than", "then", "them", "these", "those", "been", "were", "will",
  "more", "most", "some", "such", "only", "also", "just", "much", "very",
  "even", "ever", "every", "still", "after", "before", "while", "between",
]);

function topTokens(text: string, k: number): Set<string> {
  const tokens = tokenize(text).filter((t) => !STOPWORDS.has(t));
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return new Set(sorted.slice(0, k).map(([t]) => t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function firstNonEmptyLines(text: string, n: number): string {
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.slice(0, n).join(" ");
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(text)) n++;
  return n;
}

// Detect at least one paragraph that reads like a mechanism explanation:
// >= 2 sentences AND contains at least one explanatory connective.
// TICKET-C / JUA-387: lowered from 3 sentences to 2 sentences. A mechanism
// paragraph in a 150-word LinkedIn post is typically 2 sentences, not 3.
function hasMechanismParagraph(paragraphs: string[]): boolean {
  for (const para of paragraphs) {
    if (countSentences(para) < 2) continue;
    for (const re of EXPLANATORY_CONNECTIVES) {
      if (re.test(para)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sub-signal scorers
// ---------------------------------------------------------------------------

// Dwell-time proxy cap. Raised from 6 to 10 in TICKET-C / JUA-387 so a
// substantive-length ladder can compensate for the topic/depth signals that
// rarely fire on real LinkedIn posts using implicit-reasoning structures.
const DWELL_TIME_PROXY_MAX = 10;

function scoreDwellTimeProxy(paragraphs: string[], firstLines: string): number {
  let pts = 0;
  const allText = paragraphs.join("\n\n");

  // (a) Paragraph density: average > 2 sentences per paragraph (+2)
  if (paragraphs.length > 0) {
    const totalSentences = paragraphs.reduce((s, p) => s + countSentences(p), 0);
    const avg = totalSentences / paragraphs.length;
    if (avg > 2) pts += 2;
  }

  // (b) Logical progression markers anywhere in the body (+2)
  if (countMatches(allText, PROGRESSION_MARKERS) >= 1) pts += 2;

  // (c) No front-loaded CTA bait in the first 3 lines (+2)
  const hasFrontBait = FRONT_LOADED_CTA_PATTERNS.some((re) => re.test(firstLines));
  if (!hasFrontBait) pts += 2;

  // (d) Substantive-length bonus, additive. Long posts empirically
  // demonstrate dwell-time even when the depth gate misses implicit
  // reasoning. 100+ tokens +3, 200+ tokens +6, 400+ tokens +8 (additive on
  // top of a/b/c, then clamped at DWELL_TIME_PROXY_MAX). Tokens are 3+
  // character non-stopword-ish tokens, see tokenize(). The 100-token tier
  // is also a floor: short posts that miss a/b/c still earn at least +2 so
  // Juan's locked 150-word cadence is not auto-penalized. TICKET-C / JUA-387.
  const wordCount = tokenize(allText).length;
  let lengthBonus = 0;
  if (wordCount >= 400) lengthBonus = 8;
  else if (wordCount >= 200) lengthBonus = 6;
  else if (wordCount >= 100) lengthBonus = 3;
  // Floor (for short 100+ token posts that hit none of a/b/c).
  if (wordCount >= 100) pts = Math.max(pts, 2);
  pts += lengthBonus;

  return Math.min(DWELL_TIME_PROXY_MAX, pts);
}

function scoreTopicAuthority(paragraphs: string[]): number {
  if (paragraphs.length < 2) return 0;
  // TICKET-C / JUA-387: comparison window widened from "first paragraph vs
  // last paragraph" to "first 25% of the body vs last 25% of the body" AND
  // Jaccard thresholds relaxed from 0.45 / 0.30 to 0.25 / 0.15.
  //
  // Why both: real bookend-style LinkedIn hooks (Juan's locked cadence) open
  // with a 1-3 line punch and close with a 1-line callback. Comparing a
  // 5-token opener against a 4-token closer almost always returns 0 even when
  // the underlying topic stays sharp across the body. Widening the window
  // gives the comparison enough signal mass; relaxing the thresholds reflects
  // that bookend closers intentionally pivot rather than echo.
  const sliceSize = Math.max(1, Math.ceil(paragraphs.length / 4));
  const first = paragraphs.slice(0, sliceSize).join("\n\n");
  const last = paragraphs.slice(-sliceSize).join("\n\n");
  const a = topTokens(first, 15);
  const b = topTokens(last, 15);
  const overlap = jaccard(a, b);
  if (overlap >= 0.25) return 4;
  if (overlap >= 0.15) return 2;
  return 0;
}

function scoreSemanticDepth(paragraphs: string[]): number {
  let pts = 0;
  const allText = paragraphs.join("\n\n");
  const connectiveHits = countMatches(allText, EXPLANATORY_CONNECTIVES);
  // TICKET-C / JUA-387: tier the connective bonus so a single explanatory
  // connective still earns partial credit (+1). Two or more retains the full
  // +3. Real Juan-style LinkedIn posts often surface one explicit "because"
  // or "that's why" line alongside implicit reasoning, so the prior all-or-
  // nothing +3 was binary punishment.
  if (connectiveHits >= 2) pts += 3;
  else if (connectiveHits >= 1) pts += 1;
  if (hasMechanismParagraph(paragraphs)) pts += 3;
  return Math.min(6, pts);
}

function scoreEngagementBaitPenalty(text: string): { score: number; baitCount: number } {
  const baitCount = countMatches(text, ENGAGEMENT_BAIT_PATTERNS);
  const score = Math.max(0, 4 - baitCount);
  return { score, baitCount };
}

// ---------------------------------------------------------------------------
// Band + rationale
// ---------------------------------------------------------------------------

function bandFor(total: number): SemanticCoherenceBand {
  // TICKET-C / JUA-387: PASS boundary moved from 17 to 15 so the band is
  // mathematically reachable for bookend-hook LinkedIn posts. See the band
  // comment at the top of this file for the calibration context.
  if (total >= 15) return "pass";
  if (total >= 12) return "warn";
  return "fail";
}

function buildRationale(
  band: SemanticCoherenceBand,
  signals: SemanticCoherenceSignals,
  baitCount: number,
): string {
  // Research-aligned framing. No em dashes. Commas only. No "LinkedIn-certified".
  const parts: string[] = [];
  if (band === "pass") {
    parts.push("Strong semantic coherence on the research-aligned 360Brew signals.");
  } else if (band === "warn") {
    parts.push("Mixed semantic coherence on the research-aligned 360Brew signals.");
  } else {
    parts.push("Weak semantic coherence on the research-aligned 360Brew signals.");
  }

  const callouts: string[] = [];
  if (signals.dwellTimeProxy <= 2) callouts.push("thin paragraph density or front-loaded CTA bait");
  if (signals.topicAuthority === 0) callouts.push("the opener and closer drift to different topics");
  if (signals.semanticDepth <= 2) callouts.push("few WHY/HOW explanations");
  if (baitCount > 0) callouts.push(`${baitCount} engagement-bait phrase${baitCount === 1 ? "" : "s"} detected`);

  if (callouts.length > 0) {
    parts.push(`Watch: ${callouts.join(", ")}.`);
  } else {
    parts.push("Reads as sustained, on-topic, and mechanism-driven.");
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scoreSemanticCoherence(input: SemanticCoherenceInput): SemanticCoherenceScore {
  const raw = input.content ?? "";
  const format = input.format ?? detectFormat(raw);
  const text = plainTextPreservingParagraphs(raw, format);

  const paragraphs = splitParagraphs(text);
  const firstLines = firstNonEmptyLines(text, 3);

  const dwellTimeProxy = scoreDwellTimeProxy(paragraphs, firstLines);
  const topicAuthority = scoreTopicAuthority(paragraphs);
  const semanticDepth = scoreSemanticDepth(paragraphs);
  const bait = scoreEngagementBaitPenalty(text);

  const signals: SemanticCoherenceSignals = {
    dwellTimeProxy,
    topicAuthority,
    semanticDepth,
    engagementBaitPenalty: bait.score,
  };

  // Clamp at SEMANTIC_COHERENCE_MAX (20). Sub-signal ceilings now sum to 24
  // after TICKET-C / JUA-387 rescaled dwellTimeProxy to 0-10; the clamp
  // preserves the 0-20 envelope for all existing API consumers.
  const rawTotal =
    signals.dwellTimeProxy +
    signals.topicAuthority +
    signals.semanticDepth +
    signals.engagementBaitPenalty;
  const total = Math.min(SEMANTIC_COHERENCE_MAX, rawTotal);

  const band = bandFor(total);
  const rationale = buildRationale(band, signals, bait.baitCount);

  return { total, band, rationale, signals };
}
