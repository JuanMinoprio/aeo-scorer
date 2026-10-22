import {
  detectFormat,
  plainText,
  countWords,
  extractHeadings,
  extractListItems,
  extractListItemTexts,
  hasTable,
  questionSubheadingCount,
  namedEntityCount,
  numericSpecificityCount,
  extractOutboundLinks,
  authorityLinkCount,
  tier1LinkCount,
  hasJsonLd,
  jsonLdHasAuthor,
  detectByline,
  detectAuthorBio,
  firstParagraphWordCount,
  medianSectionWordCount,
  currentYearStatCount,
  extractDateSignal,
} from "./extract.ts";
import { DIMENSION_MAX, RULE_BASED_MAX } from "./types.ts";
import type { RuleBasedInput, RuleBasedResult, SubScore } from "./types.ts";

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

function scoreAuthority(raw: string, text: string, format: "html" | "markdown" | "text"): SubScore {
  const evidence: string[] = [];

  // Sub-A: Byline detection — 5 if named author present, 0 otherwise.
  // Credentials (to reach 10) require LLM judgment; rule gives 0 or 5 only.
  const bylineDetected = detectByline(text, format, raw);
  const bylinePts = bylineDetected ? 5 : 0;
  evidence.push(bylineDetected ? "Named author byline detected (+5)" : "No byline");
  if (detectAuthorBio(raw, format)) evidence.push("Author bio block present (evidence only)");

  // Sub-B: External citations — Tier-1 link count per locked rubric
  const links = extractOutboundLinks(raw, format);
  const t1Links = tier1LinkCount(links);
  const allAuthLinks = authorityLinkCount(links);
  let citationPts: number;
  if (t1Links >= 3) {
    citationPts = 10;
    evidence.push(`${t1Links} Tier-1 outbound links (≥3 → +10)`);
  } else if (t1Links >= 1) {
    citationPts = 5;
    evidence.push(`${t1Links} Tier-1 outbound link(s) (1-2 → +5)`);
  } else if (allAuthLinks > 0) {
    citationPts = 2;
    evidence.push(`${allAuthLinks} Tier-2 authority link(s), no Tier-1 → +2`);
  } else if (links.length > 0) {
    citationPts = 0;
    evidence.push("Outbound links present but none to authority domains");
  } else {
    citationPts = 0;
    evidence.push("No outbound links");
  }

  // Sub-D: JSON-LD schema markup — 5 if Article/BlogPosting schema AND author field present
  const jsonldPts = (hasJsonLd(raw) && jsonLdHasAuthor(raw)) ? 5 : 0;
  if (jsonldPts > 0) evidence.push("JSON-LD Article/BlogPosting schema with author (+5)");
  else evidence.push("No qualifying JSON-LD schema");

  const score = bylinePts + citationPts + jsonldPts;
  return {
    score: clamp(score, DIMENSION_MAX.authority),
    max: DIMENSION_MAX.authority,
    evidence,
    breakdown: { byline: bylinePts, citations: citationPts, jsonld: jsonldPts },
  };
}

function scoreEntity(text: string, wordCount: number, gamingFlags: string[]): SubScore {
  const evidence: string[] = [];
  const entities = namedEntityCount(text);
  const numerics = numericSpecificityCount(text);

  // Sub-A: Entity density — absolute count with anti-stuffing gate
  let densityTier: number;
  if (entities >= 15) densityTier = 3;
  else if (entities >= 8) densityTier = 2;
  else if (entities >= 3) densityTier = 1;
  else densityTier = 0;
  const DENSITY_SCORES = [0, 3, 5, 8];
  // Anti-stuffing gate: rule_entity_stuffing flag → downgrade one tier
  if (gamingFlags.includes("rule_entity_stuffing") && densityTier > 0) {
    densityTier--;
    evidence.push(`${entities} unique named entities — stuffing flag: tier downgraded`);
  } else {
    evidence.push(`${entities} unique named entities`);
  }
  const densityPts = DENSITY_SCORES[densityTier];

  // Sub-B: Numeric specificity — absolute count
  let numericPts: number;
  if (numerics >= 5) numericPts = 7;
  else if (numerics >= 3) numericPts = 4;
  else if (numerics >= 1) numericPts = 2;
  else numericPts = 0;
  evidence.push(`${numerics} distinct numeric specifics ($/%/multiplier/year)`);

  return {
    score: clamp(densityPts + numericPts, DIMENSION_MAX.entity),
    max: DIMENSION_MAX.entity,
    evidence,
  };
}

function scoreStructural(
  raw: string,
  text: string,
  format: "html" | "markdown" | "text",
): SubScore {
  const evidence: string[] = [];

  // Sub-A: Answer-first opener — first paragraph word count
  const openerWords = firstParagraphWordCount(raw, format);
  let openerPts: number;
  if (openerWords > 0 && openerWords <= 60) {
    openerPts = 6;
    evidence.push(`First paragraph ${openerWords}w (≤60 → +6)`);
  } else if (openerWords > 60 && openerWords <= 120) {
    openerPts = 3;
    evidence.push(`First paragraph ${openerWords}w (61-120 → +3)`);
  } else {
    openerPts = 0;
    evidence.push(openerWords === 0 ? "No first paragraph detected (+0)" : `First paragraph ${openerWords}w (>120 → +0)`);
  }

  // Sub-B: Passage chunk length — median section word count between headings
  const medianChunk = medianSectionWordCount(raw, format);
  let chunkPts: number;
  if (medianChunk >= 100 && medianChunk <= 300) {
    chunkPts = 6;
    evidence.push(`Median section ${medianChunk}w (100-300 → +6)`);
  } else if ((medianChunk >= 50 && medianChunk < 100) || (medianChunk > 300 && medianChunk <= 500)) {
    chunkPts = 3;
    evidence.push(`Median section ${medianChunk}w (50-99 or 301-500 → +3)`);
  } else {
    chunkPts = 0;
    evidence.push(medianChunk === 0 ? "No multi-section structure (+0)" : `Median section ${medianChunk}w (<50 or >500 → +0)`);
  }

  // Sub-C: Tables or structured lists
  let tableListPts: number;
  if (hasTable(raw, format)) {
    tableListPts = 4;
    evidence.push("Table present (+4)");
  } else {
    const listItems = extractListItems(raw, format);
    if (listItems >= 5) {
      tableListPts = 2;
      evidence.push(`${listItems} list items, no table (+2)`);
    } else {
      tableListPts = 0;
      evidence.push(listItems > 0 ? `${listItems} list items, <5 (+0)` : "No table or lists (+0)");
    }
  }

  // Sub-D: Heading hierarchy — sequential with no skips
  const headings = extractHeadings(raw, format);
  let hierarchyPts: number;
  if (headings.length >= 2) {
    const h1Count = headings.filter((h) => h.level === 1).length;
    // Check for skipped levels: H1 → H3 without H2 is a skip
    let hasSkip = false;
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level - headings[i - 1].level > 1) { hasSkip = true; break; }
    }
    if (h1Count <= 1 && !hasSkip) {
      hierarchyPts = 4;
      evidence.push(`${headings.length} headings, sequential hierarchy (+4)`);
    } else {
      hierarchyPts = 2;
      evidence.push(`${headings.length} headings, broken hierarchy (${h1Count > 1 ? `${h1Count} H1s` : "level skip"}) (+2)`);
    }
  } else if (headings.length === 1) {
    hierarchyPts = 0;
    evidence.push("Single heading only (+0)");
  } else {
    hierarchyPts = 0;
    evidence.push("No headings (+0)");
  }

  const score = openerPts + chunkPts + tableListPts + hierarchyPts;
  return { score: clamp(score, DIMENSION_MAX.structural), max: DIMENSION_MAX.structural, evidence };
}

function scoreQSubheadings(raw: string, format: "html" | "markdown" | "text"): SubScore {
  const allHeadings = extractHeadings(raw, format);
  const subheadings = allHeadings.filter((h) => h.level >= 2);
  const qCount = questionSubheadingCount(subheadings);
  const evidence: string[] = [`${qCount} of ${subheadings.length} subheadings (H2-H6) are question-form`];

  let score: number;
  if (allHeadings.length === 0) {
    // No heading structure at all — baseline does not apply
    score = 0;
    evidence.push("No heading structure present (+0)");
  } else if (qCount === 0) {
    // Has headings but none are question-form — baseline valuable
    score = 5;
    evidence.push("Has headings, none question-form (heading presence valuable → +5)");
  } else if (qCount <= 2) {
    score = 10;
    evidence.push("Optimal range (1-2 questions → +10)");
  } else if (qCount <= 4) {
    score = 5;
    evidence.push(`Diminishing returns (${qCount} questions, 3-4 range → +5)`);
  } else {
    score = 3;
    evidence.push(`Anti-gaming penalty (${qCount} questions, ≥5 → +3)`);
  }

  return { score, max: DIMENSION_MAX.qSubheadings, evidence };
}

function scoreFreshness(
  raw: string,
  format: "html" | "markdown" | "text",
  meta: RuleBasedInput["meta"],
  text: string,
  now: Date,
): SubScore {
  const signal = extractDateSignal(raw, format, meta, now);
  const evidence: string[] = [];

  // Sub-A: Publication/update recency
  let recencyPts: number;
  if (!signal.iso || signal.ageDays === null) {
    recencyPts = 0;
    evidence.push("No parseable date signal (+0)");
  } else {
    evidence.push(`Date: ${signal.source} (${signal.iso.slice(0, 10)}, ${signal.ageDays}d old)`);
    if (signal.ageDays <= 30) {
      recencyPts = 5;
      evidence.push("Last 30 days (+5)");
    } else if (signal.ageDays <= 90) {
      recencyPts = 3;
      evidence.push("31-90 days (+3)");
    } else if (signal.ageDays <= 180) {
      recencyPts = 1;
      evidence.push("91-180 days (+1)");
    } else {
      recencyPts = 0;
      evidence.push("Stale (>180 days → +0)");
    }
    // Cross-validate: stale body with fresh meta stamp — cap recency at 3
    if (signal.staleBodySignal && recencyPts > 3) {
      recencyPts = 3;
      evidence.push("Recency capped at 3: body content references dates >1y older than meta.updatedAt");
    }
  }

  // Sub-B: Current-year statistics
  const yearStatCount = currentYearStatCount(text, now);
  let yearStatPts: number;
  if (yearStatCount >= 2) {
    yearStatPts = 3;
    evidence.push(`${yearStatCount} current/prior-year stat references (+3)`);
  } else if (yearStatCount === 1) {
    yearStatPts = 1;
    evidence.push("1 current/prior-year stat reference (+1)");
  } else {
    yearStatPts = 0;
    evidence.push("No current-year stat references (+0)");
  }

  return { score: clamp(recencyPts + yearStatPts, DIMENSION_MAX.freshness), max: DIMENSION_MAX.freshness, evidence };
}

const HOLLOW_AUTHORITY_PATTERNS = [
  /\bstudies?\s+(?:show|suggest|indicate|prove|find)\b/gi,
  /\bresearch\s+(?:shows?|suggests?|indicates?|proves?|finds?)\b/gi,
  /\bexperts?\s+(?:agree|say|believe|recommend)\b/gi,
  /\baccording\s+to\s+(?:experts?|studies?|research)\b/gi,
  /\bdata\s+(?:shows?|suggests?|indicates?)\b/gi,
  /\bevidence\s+(?:shows?|suggests?|indicates?)\b/gi,
];

export function detectGamingPatterns(
  raw: string,
  text: string,
  format: "html" | "markdown" | "text",
  wordCount: number,
): string[] {
  const flags: string[] = [];

  // 1. Repetition density — any single trigram appearing more than once per 20 words signals stuffing.
  // (Ratio-based approaches fail because trailing-word variation keeps overall uniqueness high
  // even when a core phrase like "AI tools for" is repeated 10 times.)
  if (wordCount >= 100) {
    // JUA-469 (#25): normalize punctuation before tokenizing. The old split was
    // whitespace-only, so a stuffer could alternate punctuation ("AI tools, for"
    // / "AI tools. for" / "AI tools! for") to make each trigram unique and dodge
    // the repeat count entirely. Strip non-word characters so the trigrams
    // reflect the actual repeated phrase.
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    const phraseCount: Record<string, number> = {};
    for (let i = 0; i < words.length - 2; i++) {
      const t = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phraseCount[t] = (phraseCount[t] || 0) + 1;
    }
    const maxRepeat = Math.max(0, ...Object.values(phraseCount));
    // JUA-469 (#25): cap the length-scaled threshold. wordCount/20 grew without
    // bound, so a 2,000-word page needed >100 identical trigrams before
    // flagging — trivially gameable. Cap at 8 so dense repetition is caught
    // regardless of document length (8 identical trigrams is stuffing at any
    // size), while the floor of 2 keeps short docs sensitive.
    const threshold = Math.min(8, Math.max(2, Math.floor(wordCount / 20)));
    if (maxRepeat > threshold) {
      flags.push("rule_keyword_stuffing");
    }
  }

  // 2. Entity stuffing — extreme acronym density OR sparse context per named entity
  const entities = namedEntityCount(text);
  const allCapsCount = (text.match(/\b[A-Z]{2,}\b/g) || []).length;
  const acronymDensity = wordCount > 0 ? allCapsCount / wordCount : 0;
  const wordsPerEntity = entities > 0 ? wordCount / entities : Infinity;
  if (acronymDensity > 0.12 || (entities >= 15 && wordsPerEntity < 12)) {
    flags.push("rule_entity_stuffing");
  }

  // 3. Listicle inflation — many bullets with low information per item
  const listItemCount = extractListItems(raw, format);
  if (listItemCount > 0 && wordCount > 0 && listItemCount / wordCount > 1 / 25) {
    const texts = extractListItemTexts(raw, format);
    if (texts.length > 0) {
      const avgItemWords = texts.reduce((s, t) => s + countWords(t), 0) / texts.length;
      if (avgItemWords <= 8) flags.push("rule_listicle_padding");
    }
  }

  // 4. Hollow authority — vague authority claims with no adjacent source
  let hollowCount = 0;
  for (const pattern of HOLLOW_AUTHORITY_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const window = text.slice(m.index, m.index + 200);
      // Parenthetical "(Smith 2026)" is too easy to fabricate — only a real
      // URL or a scholarly marker (doi, ibid, et al) counts as a source.
      const hasSource =
        /https?:\/\/\S+/.test(window) ||
        /\b(?:ibid|et al\.?|doi)\b/i.test(window);
      if (!hasSource) hollowCount++;
    }
  }
  if (hollowCount >= 3) flags.push("rule_unsupported_claims");

  return flags;
}

export function scoreContentRules(input: RuleBasedInput, now: Date = new Date()): RuleBasedResult {
  const raw = input.content;
  const format = input.format ?? detectFormat(raw);
  const text = plainText(raw, format);
  const wordCount = countWords(text);

  // Gaming flags must be computed before entity scoring (anti-stuffing gate)
  const ruleGamingFlags = detectGamingPatterns(raw, text, format, wordCount);

  const authority = scoreAuthority(raw, text, format);
  const entity = scoreEntity(text, wordCount, ruleGamingFlags);
  const structural = scoreStructural(raw, text, format);
  const qSubheadings = scoreQSubheadings(raw, format);
  const freshness = scoreFreshness(raw, format, input.meta, text, now);

  const total = authority.score + entity.score + structural.score + qSubheadings.score + freshness.score;

  return {
    total,
    maxTotal: RULE_BASED_MAX,
    byDimension: { authority, entity, structural, qSubheadings, freshness },
    formatDetected: format,
    wordCount,
    parsedAt: now.toISOString(),
    ruleGamingFlags,
  };
}

export { RULE_BASED_MAX, DIMENSION_MAX };
