import type { ContentFormat } from "./types.ts";

const AUTHORITY_TLDS = [".edu", ".gov"];
const AUTHORITY_DOMAINS = [
  "nature.com",
  "sciencedirect.com",
  "nih.gov",
  "harvard.edu",
  "mit.edu",
  "stanford.edu",
  "oxford.ac.uk",
  "cambridge.org",
  "ieee.org",
  "acm.org",
  "wikipedia.org",
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "theguardian.com",
  "economist.com",
  "hbr.org",
  "mckinsey.com",
  "gartner.com",
  "forrester.com",
  "pewresearch.org",
  "statista.com",
  "anthropic.com",
  "openai.com",
  "deepmind.google",
  "thelancet.com",
];

// Tier-1 sources per locked AEO rubric §1 (authority sub-score B)
const TIER_1_TLDS = [".edu", ".gov"];
const TIER_1_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "nytimes.com",
  "wsj.com",
  "bloomberg.com",
  "ft.com",
  "nature.com",
  "thelancet.com",
  "nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
];

const QUESTION_STARTERS = [
  "what",
  "how",
  "why",
  "when",
  "where",
  "who",
  "which",
  "is",
  "are",
  "does",
  "do",
  "can",
  "should",
  "will",
  "could",
  "would",
];

// Document-level HTML signals: a real page wrapper or a CLOSING block tag
// (genuine structural markup, not a prose mention of "<div>"). Closing tags are
// the tell — prose discussing HTML writes "<div>" but not "</div></body>".
const STRONG_HTML_DOC = /<(?:html|body|article|main)[\s>]|<\/(?:html|body|article|main|section|div|p|ul|ol|table|h[1-6])>/i;

export function detectFormat(content: string): ContentFormat {
  const trimmed = content.trim();

  // JUA-469 (#24): a single `# ` line must NOT flip a real HTML page to
  // markdown. A shell snippet (`# install deps`) inside <pre>/<code>, a CSS id
  // selector echoed in text, or a hash-comment in an embedded script would
  // otherwise misclassify the whole page — after which markdown extractors find
  // no headings/tables/paragraphs and structural/qSub/freshness silently zero.
  // So when STRONG document-level HTML markup is present, HTML wins even if a
  // `# ` heading appears. (Genuine markdown that merely MENTIONS inline tags
  // like `<div>` has no closing tags / page wrapper, so it still detects as
  // markdown — preserving the AEO-AUDIT Sprint-2.5 contract.)
  const hasMdHeading = /^#{1,6}\s+/m.test(trimmed);
  const hasStrongHtml = STRONG_HTML_DOC.test(trimmed);

  if (hasMdHeading && !hasStrongHtml) {
    return "markdown";
  }
  if (hasStrongHtml || /<\/?(html|body|article|section|main|div|p|h[1-6]|ul|ol|table)[\s>]/i.test(trimmed)) {
    return "html";
  }
  if (hasMdHeading) {
    return "markdown";
  }
  if (/(^|\n)\s*[-*]\s+\S/.test(trimmed)) {
    return "markdown";
  }
  return "text";
}

/**
 * Remove non-article boilerplate from raw HTML *while preserving structural
 * markup* (headings, paragraphs, tables, lists, links, JSON-LD-bearing scopes).
 *
 * JUA-469 (#19): the batch endpoint fetches a full page then slices the RAW
 * HTML to 12 KB before any extraction. On a typical page the first 12 KB is
 * `<head>` + inlined CSS + analytics `<script>` — so batch scored boilerplate,
 * not the article, and rows came back near-F while still `ok: true`. Stripping
 * `<head>`, `<script>`, `<style>`, and the common chrome containers
 * (`<nav>`/`<header>`/`<footer>`/`<aside>`) BEFORE the cap pulls the article
 * body into the scored window, so a batch URL-fetch lands close to a single-URL
 * paste of the same article.
 *
 * It deliberately keeps `<body>`'s structural tags intact (this is NOT
 * `stripHtml`, which flattens to plain text) because the rule layer still needs
 * the HTML structure for heading/table/list/JSON-LD scoring. JSON-LD lives in
 * `<script type="application/ld+json">` inside `<head>`/`<body>`; that specific
 * script type is preserved so authority schema scoring survives the strip.
 */
export function stripBoilerplate(html: string): string {
  return html
    // Drop everything in <head> EXCEPT JSON-LD (preserve schema for authority).
    .replace(/<head\b[^>]*>([\s\S]*?)<\/head>/gi, (_m, inner) => {
      const ld = inner.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi);
      return ld ? ld.join("\n") : " ";
    })
    // Drop non-JSON-LD scripts (analytics, framework bundles) and all styles.
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    // Drop page chrome that surrounds the article (nav bars, site headers,
    // footers, sidebars). These never carry article-citation signal but eat the
    // byte budget. Article content in <main>/<article>/<section>/<p> survives.
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
    // Drop HTML comments — a citation-pass concern too (#23): authority URLs
    // hidden in comments must not earn visible-citation credit.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*<!doctype[^>]*>/i, " ")
    .trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function plainText(content: string, format: ContentFormat): string {
  if (format === "html") return stripHtml(content);
  if (format === "markdown") {
    return content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]+`/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[#>\-*]+\s+/gm, "")
      .replace(/[*_~]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return content.replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function extractHeadings(content: string, format: ContentFormat): {
  level: number;
  text: string;
}[] {
  const headings: { level: number; text: string }[] = [];
  if (format === "html") {
    const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      headings.push({ level: parseInt(m[1], 10), text: stripHtml(m[2]) });
    }
  } else if (format === "markdown") {
    const re = /^(#{1,6})\s+(.+?)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      headings.push({ level: m[1].length, text: m[2].trim() });
    }
  }
  return headings;
}

export function extractListItems(content: string, format: ContentFormat): number {
  if (format === "html") {
    const matches = content.match(/<li\b[^>]*>/gi);
    return matches ? matches.length : 0;
  }
  if (format === "markdown") {
    const matches = content.match(/^\s*(?:[-*+]|\d+\.)\s+\S/gm);
    return matches ? matches.length : 0;
  }
  return 0;
}

export function hasTable(content: string, format: ContentFormat): boolean {
  if (format === "html") return /<table\b/i.test(content);
  if (format === "markdown") return /^\s*\|.+\|\s*$/m.test(content) && /^\s*\|[\s|:-]+\|\s*$/m.test(content);
  return false;
}

export function hasCodeBlock(content: string, format: ContentFormat): boolean {
  if (format === "html") return /<(pre|code)\b/i.test(content);
  // AEO-AUDIT-014: dropped the indented-block branch — it false-positived on
  // any 4-space-indented continuation paragraph or nested-list item. Only
  // fenced code blocks are counted now.
  if (format === "markdown") return /```[\s\S]*?```/.test(content);
  return false;
}

export function emphasisCount(content: string, format: ContentFormat): number {
  if (format === "html") {
    const matches = content.match(/<(strong|b|em|i)\b/gi);
    return matches ? matches.length : 0;
  }
  if (format === "markdown") {
    const matches = content.match(/(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g);
    return matches ? matches.length : 0;
  }
  return 0;
}

export function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^([^.!?\n]+[.!?])/);
  if (m) return m[1].trim();
  // AEO-AUDIT-006: stripped HTML collapses whitespace to single spaces, so a
  // long single-line article without an early period would otherwise return
  // the whole article. Bound the fallback to ~300 chars and split on any
  // terminator so the sentence-1 word-count check stays meaningful.
  const head = trimmed.slice(0, 300);
  const split = head.split(/[.!?\n]/)[0];
  return split.trim();
}

export function questionSubheadingCount(headings: { text: string }[]): number {
  return headings.filter((h) => {
    const first = h.text.toLowerCase().trim().split(/\s+/)[0] || "";
    const cleaned = first.replace(/[^a-z]/g, "");
    if (QUESTION_STARTERS.includes(cleaned)) return true;
    return h.text.trim().endsWith("?");
  }).length;
}

// AEO-AUDIT-010: title-case sequences like "How To Build Better Marketing"
// were counted as named entities, inflating the entity score. Filter out
// matches that start with a common adjective/adverb/article (sentence
// starters and title-case heading openers), and reject all-stopword chains.
const ENTITY_STOPWORD_STARTERS = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "how", "why", "what", "when", "where", "who", "which",
  "is", "are", "was", "were", "be", "being", "been",
  "do", "does", "did",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "i", "we", "you", "they", "he", "she", "it",
  "my", "our", "your", "their", "his", "her", "its",
  "and", "or", "but", "so", "yet", "for", "nor",
  "to", "of", "in", "on", "at", "by", "with", "from", "into", "onto", "out",
  "if", "then", "else",
  "every", "any", "some", "all", "each", "no", "not",
  "best", "better", "good", "great", "real", "new", "old",
]);

// Single-word brand/org/product names that should count even though they are
// one token. Kept short and high-precision: these are common citation-bearing
// entities the multi-word regex used to miss entirely (JUA-469 #26). Lowercased.
const KNOWN_SINGLE_ENTITIES = new Set([
  "google", "stripe", "amazon", "microsoft", "apple", "meta", "netflix", "nvidia",
  "openai", "anthropic", "github", "gitlab", "salesforce", "hubspot", "shopify",
  "slack", "notion", "figma", "linkedin", "youtube", "tiktok", "reddit", "spotify",
  "uber", "airbnb", "tesla", "intel", "ibm", "oracle", "adobe", "atlassian",
  "datadog", "snowflake", "databricks", "cloudflare", "vercel", "twilio",
  "perplexity", "gemini", "claude", "chatgpt", "copilot", "deepmind", "huggingface",
]);

export function namedEntityCount(text: string): number {
  const unique = new Set<string>();

  // Multi-word TitleCase entities (Unicode-aware: also matches accented and
  // non-Latin capitalized names like "José" or "São Paulo"). `u` flag + \p{Lu}/
  // \p{Ll} cover non-ASCII capitals the old [A-Z][a-z]+ regex dropped (#26).
  const multi = text.match(/\b(\p{Lu}[\p{Ll}\p{Lu}]+(?:\s+\p{Lu}[\p{Ll}\p{Lu}]+){1,4})\b/gu);
  if (multi) {
    for (const phrase of multi) {
      const first = phrase.split(/\s+/)[0]?.toLowerCase() ?? "";
      if (!ENTITY_STOPWORD_STARTERS.has(first)) unique.add(phrase);
    }
  }

  // Single-word entities: count a lone capitalized token ONLY when it is on the
  // curated known-brand allowlist (high precision). Counting every mid-sentence
  // capitalized word would over-credit ordinary nouns and shift legitimate
  // scores; the allowlist captures the common citation-bearing brands the old
  // ≥2-word regex dropped (Google, Stripe, OpenAI…) without that risk.
  const single = text.match(/\b(\p{Lu}[\p{Ll}\p{Lu}]+)\b/gu);
  if (single) {
    for (const tok of single) {
      if (KNOWN_SINGLE_ENTITIES.has(tok.toLowerCase())) unique.add(tok);
    }
  }

  return unique.size;
}

export function numericSpecificityCount(text: string): number {
  // Collect all match spans, then deduplicate overlapping ones so a token like
  // "$2,500,000" doesn't get counted by both the dollar regex and the
  // comma-number regex.
  const patterns = [
    /\$[\d,]+(?:\.\d+)?[KMB]?/g,
    /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,
    /\b\d+(?:\.\d+)?%/g,
    /\b(19|20)\d{2}\b/g,
    /\b\d+(?:\.\d+)?[KMB]\b/g,
    /\b\d+x\b/gi,
  ];
  const spans: [number, number][] = [];
  for (const pat of patterns) {
    const re = new RegExp(pat.source, pat.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const deduped: [number, number][] = [];
  for (const span of spans) {
    if (deduped.length === 0 || span[0] >= deduped[deduped.length - 1][1]) {
      deduped.push(span);
    }
  }
  return deduped.length;
}

export function extractOutboundLinks(content: string, format: ContentFormat): string[] {
  const urls = new Set<string>();
  if (format === "html") {
    // Visible anchors only. <a href> is a real, visible citation.
    const re = /href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.add(m[1]);
    }
    // JUA-469 (#23): the bare-URL pass must run on VISIBLE TEXT, not raw markup.
    // Running it over raw HTML credited authority URLs hidden in <meta>, HTML
    // comments, JSON-LD, or <link> tags — a gaming bypass that earned the full
    // Tier-1 citation +10 with zero citations a reader (or an AI engine
    // extracting visible text) would ever see. Scan only the stripped text.
    const visible = stripHtml(content);
    const bare = visible.match(/https?:\/\/[^\s<>"')\]]+/gi);
    if (bare) bare.forEach((u) => urls.add(u));
    return Array.from(urls);
  }
  if (format === "markdown") {
    const re = /\]\((https?:\/\/[^)\s]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) urls.add(m[1]);
  }
  // markdown / plain text: bare URLs in the source ARE visible.
  const bare = content.match(/https?:\/\/[^\s<>"')\]]+/gi);
  if (bare) bare.forEach((u) => urls.add(u));
  return Array.from(urls);
}

export function authorityLinkCount(urls: string[]): number {
  return urls.filter((u) => {
    let hostname: string;
    try {
      hostname = new URL(u).hostname.toLowerCase();
    } catch {
      return false;
    }
    // TLD check: hostname must actually end with .edu or .gov — not merely
    // contain it (blocks spoofs like "harvard.edu.phishing.xyz").
    if (AUTHORITY_TLDS.some((tld) => hostname.endsWith(tld))) return true;
    // Domain check: exact match or proper subdomain (hostname === d or ends with ".d").
    return AUTHORITY_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
  }).length;
}

const VALID_JSONLD_TYPES = new Set(["Article", "BlogPosting", "WebPage"]);

export function hasJsonLd(content: string): boolean {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (VALID_JSONLD_TYPES.has(parsed["@type"])) return true;
    } catch {
      // unparseable or wrong shape — skip
    }
  }
  return false;
}

export function jsonLdHasAuthor(content: string): boolean {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (!VALID_JSONLD_TYPES.has(parsed["@type"])) continue;
      const author = parsed["author"];
      const name = author && typeof author === "object" ? (author as Record<string, unknown>)["name"] : undefined;
      if (typeof name === "string" && name.trim().length > 0) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function detectByline(text: string, format: ContentFormat, raw: string): boolean {
  if (format === "html") {
    if (/<[^>]+rel=["']author["']/i.test(raw)) return true;
    if (/class=["'][^"']*\b(byline|author|writer|by-line)\b/i.test(raw)) return true;
  }
  return /(^|\n|\s)by\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/m.test(text.slice(0, 800));
}

export function extractListItemTexts(content: string, format: ContentFormat): string[] {
  if (format === "html") {
    const texts: string[] = [];
    const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      texts.push(stripHtml(m[1]).trim());
    }
    return texts;
  }
  if (format === "markdown") {
    const texts: string[] = [];
    for (const line of content.split(/\n/)) {
      const m = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.+)/);
      if (m) texts.push(m[1].trim());
    }
    return texts;
  }
  return [];
}

export function detectAuthorBio(raw: string, format: ContentFormat): boolean {
  if (format === "html") {
    return /class=["'][^"']*\b(author-bio|about-author|author-card|author-info)\b/i.test(raw);
  }
  return /\babout the author\b/i.test(raw) || /\bwritten by\s+[A-Z]/i.test(raw);
}

export interface DateSignal {
  iso: string | null;
  source: string;
  ageDays: number | null;
  /** True when meta.updatedAt was the winning signal but body content references
   *  years more than 1 year older — indicates the "fresh" stamp may be gaming. */
  staleBodySignal?: boolean;
}

// AEO-AUDIT-001: clamp ageDays to a sane window so attacker-supplied
// future dates (or accidental ancient ones) cannot pin freshness at max.
// AEO-AUDIT-007: scope the body "updated:" regex to the first 500 chars
// (header zone) so deep-body mentions of unrelated dates do not become the
// freshness signal, and only push it when no structured candidate exists.
const SANE_AGE_DAYS_MAX = 365 * 50; // ±50 years
const SANE_AGE_DAYS_MIN = -1; // future dates rejected

function isSaneCandidate(iso: string, now: Date): { ok: true; date: Date; ageDays: number } | { ok: false } {
  if (typeof iso !== "string") return { ok: false };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { ok: false };
  const ageDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (ageDays < SANE_AGE_DAYS_MIN) return { ok: false }; // future date
  if (ageDays > SANE_AGE_DAYS_MAX) return { ok: false }; // ancient/typo
  return { ok: true, date: d, ageDays };
}

export function tier1LinkCount(urls: string[]): number {
  return urls.filter((u) => {
    let hostname: string;
    try {
      hostname = new URL(u).hostname.toLowerCase();
    } catch {
      return false;
    }
    if (TIER_1_TLDS.some((tld) => hostname.endsWith(tld))) return true;
    return TIER_1_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
  }).length;
}

export function firstParagraphWordCount(content: string, format: ContentFormat): number {
  if (format === "html") {
    const m = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!m) return 0;
    return countWords(stripHtml(m[1]));
  }
  if (format === "markdown") {
    // Skip any leading headings/blank lines, grab text up to next blank line or heading
    const lines = content.split("\n");
    const textLines: string[] = [];
    let started = false;
    for (const line of lines) {
      const isHeading = /^#{1,6}\s/.test(line);
      const isBlank = line.trim() === "";
      if (!started) {
        if (!isHeading && !isBlank) started = true;
        else continue;
      }
      if (isBlank || isHeading) break;
      textLines.push(line);
    }
    return countWords(textLines.join(" "));
  }
  // plain text: first paragraph up to double newline
  const para = content.split(/\n\s*\n/)[0] ?? "";
  return countWords(para.trim());
}

export function medianSectionWordCount(content: string, format: ContentFormat): number {
  const headings = extractHeadings(content, format);
  if (headings.length < 2) return 0;

  let sections: string[];
  if (format === "html") {
    sections = content.split(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i).slice(1);
  } else if (format === "markdown") {
    sections = content.split(/^#{1,6}\s+.+$/m).slice(1);
  } else {
    return 0;
  }

  const wordCounts = sections
    .map((s) => countWords(plainText(s, format)))
    .filter((n) => n > 0);

  if (wordCounts.length === 0) return 0;
  wordCounts.sort((a, b) => a - b);
  const mid = Math.floor(wordCounts.length / 2);
  return wordCounts.length % 2 === 0
    ? Math.round((wordCounts[mid - 1] + wordCounts[mid]) / 2)
    : wordCounts[mid];
}

export function currentYearStatCount(text: string, now: Date): number {
  const currentYear = now.getFullYear();
  const priorYear = currentYear - 1;
  const yearPat = new RegExp(`\\b(${currentYear}|${priorYear})\\b`);
  // Numeric stat: %, $amount, decimal (0.81), large comma-number, K/M/B suffix
  const statPat = /\d+[%$]|\d+\.\d+|\d{1,3}(?:,\d{3})+|\d+[KMB]\b/i;
  // Count sentences that contain BOTH a current/prior-year mention AND a numeric stat
  const sentences = text.split(/(?<=[.!?])\s+|[\n]/).filter((s) => s.trim().length > 5);
  let count = 0;
  for (const s of sentences) {
    if (yearPat.test(s) && statPat.test(s)) count++;
  }
  return count;
}

export function extractDateSignal(
  content: string,
  format: ContentFormat,
  meta: { publishedAt?: string; updatedAt?: string } | undefined,
  now: Date,
): DateSignal {
  const candidates: { iso: string; source: string }[] = [];

  if (meta?.updatedAt && typeof meta.updatedAt === "string") {
    candidates.push({ iso: meta.updatedAt, source: "meta.updatedAt" });
  }
  if (meta?.publishedAt && typeof meta.publishedAt === "string") {
    candidates.push({ iso: meta.publishedAt, source: "meta.publishedAt" });
  }

  if (format === "html") {
    const timeMatch = content.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    if (timeMatch) candidates.push({ iso: timeMatch[1], source: "<time datetime>" });

    const ogUpdated = content.match(/<meta[^>]+(?:property|name)=["']og:updated_time["'][^>]+content=["']([^"']+)["']/i);
    if (ogUpdated) candidates.push({ iso: ogUpdated[1], source: "og:updated_time" });

    const articlePublished = content.match(/<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
    if (articlePublished) candidates.push({ iso: articlePublished[1], source: "article:published_time" });
  }

  // AEO-AUDIT-007: only consult the body "updated:" pattern when no
  // structured candidate is present, AND scope the search to the first 500
  // characters (header zone) so deep-body mentions don't hijack freshness.
  if (candidates.length === 0) {
    const headerZone = content.slice(0, 500);
    const updatedPattern = headerZone.match(/(?:last\s+)?updated[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
    if (updatedPattern) candidates.push({ iso: updatedPattern[1], source: "updated:pattern" });
  }

  for (const c of candidates) {
    const sane = isSaneCandidate(c.iso, now);
    if (sane.ok) {
      let staleBodySignal: boolean | undefined;
      // When the freshness signal comes from meta.updatedAt, cross-validate
      // against year mentions in the body. If the body references years that
      // are more than 1 year older than the meta date, the "updated" stamp
      // may be fraudulent — cap freshness at 6 in scoreFreshness.
      if (c.source === "meta.updatedAt") {
        const metaYear = sane.date.getFullYear();
        // JUA-469 (#22): scan body years on the VISIBLE text, not raw markup. An
        // old year in an asset path (/uploads/2019/img.png), a copyright footer,
        // or an inline script constant would otherwise flag genuinely fresh
        // content as stale and cap recency 5→3 on nearly any real page.
        const visibleText = plainText(content, format);
        const bodyYears = (visibleText.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
        staleBodySignal = bodyYears.some((y) => metaYear - y > 1);
      }
      return { iso: sane.date.toISOString(), source: c.source, ageDays: sane.ageDays, staleBodySignal };
    }
  }

  return { iso: null, source: "none", ageDays: null };
}
