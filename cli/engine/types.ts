export type ContentFormat = "html" | "markdown" | "text";

export interface RuleBasedInput {
  content: string;
  format?: ContentFormat;
  url?: string;
  meta?: {
    publishedAt?: string;
    updatedAt?: string;
    author?: string;
  };
}

export interface SubScore {
  score: number;
  max: number;
  evidence: string[];
  breakdown?: Record<string, number>;
}

export type DimensionKey =
  | "authority"
  | "entity"
  | "structural"
  | "qSubheadings"
  | "freshness";

export interface RuleBasedResult {
  total: number;
  maxTotal: number;
  byDimension: Record<DimensionKey, SubScore>;
  formatDetected: ContentFormat;
  wordCount: number;
  parsedAt: string;
  ruleGamingFlags: string[];
}

// Rule-layer ceiling per dimension (what the deterministic layer can award)
export const DIMENSION_MAX: Record<DimensionKey, number> = {
  authority: 20,
  entity: 15,
  structural: 20,
  qSubheadings: 10,
  freshness: 8,
};

export const RULE_BASED_MAX = 73;

// ---------------------------------------------------------------------------
// Dimension 8 — Semantic Coherence (360Brew-aligned LinkedIn signals).
//
// Semantic Coherence is a LinkedIn-platform-specific research-aligned signal,
// reported alongside the canonical 100-pt AEO score, never folded in.
// Backward-compatible for all existing API consumers.
// ---------------------------------------------------------------------------

/** Band labels for Dim 8 reporting. */
export type SemanticCoherenceBand = "pass" | "warn" | "fail";

/** Individual sub-signal ceilings for Dim 8. */
export interface SemanticCoherenceSignals {
  /** 0-6: paragraph density + logical progression + no front-loaded CTA bait */
  dwellTimeProxy: number;
  /** 0-4: Jaccard overlap of top-15 tokens between first and last paragraph */
  topicAuthority: number;
  /** 0-6: explanatory connectives + mechanism/causal explanation paragraphs */
  semanticDepth: number;
  /** 0-4: starts at 4, minus one per detected engagement-bait phrase, floor 0 */
  engagementBaitPenalty: number;
}

/**
 * Dimension 8 result.
 *
 * Semantic Coherence is a LinkedIn-platform-specific research-aligned signal,
 * reported alongside the canonical 100-pt AEO score, never folded in.
 * Backward-compatible for all existing API consumers.
 */
export interface SemanticCoherenceScore {
  /** Total score 0-20 */
  total: number;
  band: SemanticCoherenceBand;
  /** 1-2 sentence plain-language summary, research-aligned framing. */
  rationale: string;
  signals: SemanticCoherenceSignals;
}

export const SEMANTIC_COHERENCE_MAX = 20;
