export { scoreContentRules, RULE_BASED_MAX, DIMENSION_MAX } from "./rules.ts";

// Extraction helpers used by the batch endpoint to pull article text out of raw
// fetched HTML BEFORE the content cap (JUA-469 #19). detectFormat is re-exported
// so the endpoint can classify the stripped content explicitly.
export { stripBoilerplate, detectFormat, plainText } from "./extract.ts";
export type {
  ContentFormat,
  RuleBasedInput,
  RuleBasedResult,
  SubScore,
  DimensionKey,
  SemanticCoherenceBand,
  SemanticCoherenceSignals,
  SemanticCoherenceScore,
} from "./types.ts";
export { SEMANTIC_COHERENCE_MAX } from "./types.ts";

// Dimension 8 — Semantic Coherence (360Brew-aligned LinkedIn signals).
// Reported alongside the canonical 100-pt AEO score, never folded in.
export { scoreSemanticCoherence } from "./dimensions/semantic-coherence.ts";
