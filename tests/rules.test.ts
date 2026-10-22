import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { scoreContentRules } from "../cli/engine/index.ts";
import { detectGamingPatterns } from "../cli/engine/rules.ts";

const NOW = new Date("2026-04-25T12:00:00Z");

const HIGH_AEO_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:updated_time" content="2026-04-10T08:00:00Z" />
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Article","author":{"@type":"Person","name":"Jane Doe","sameAs":"https://twitter.com/jane"}}
  </script>
</head>
<body>
  <article>
    <h1>How AI Search Engines Pick Citations in 2026</h1>
    <div class="byline">By Jane Doe</div>
    <time datetime="2026-04-10">April 10, 2026</time>
    <p>AI Overviews cite content with high E-E-A-T signals 81% of the time. Stanford research from 2026 shows authority is the top predictor.</p>
    <h2>What signals matter most?</h2>
    <p>According to <a href="https://hbr.org/article">HBR</a> and a <a href="https://nih.gov/study">NIH study</a>, byline credibility and citation quality drive 40% of ranking weight.</p>
    <ul>
      <li>Schema.org Article markup</li>
      <li>Outbound links to .edu/.gov sources</li>
      <li>Author bio with credentials</li>
    </ul>
    <h2>How does Perplexity differ from ChatGPT?</h2>
    <p>Perplexity's L3 reranker gates citations on authority. ChatGPT browsing weights freshness more heavily — 76% of cited content is under 90 days old per <a href="https://stanford.edu/research">Stanford</a>.</p>
    <table><tr><th>Engine</th><th>Top Signal</th></tr><tr><td>AI Overviews</td><td>E-E-A-T</td></tr></table>
    <div class="author-bio">About the author: Jane Doe is a marketing analyst.</div>
  </article>
</body>
</html>
`;

const SEO_STUFFED_HTML = `
<html><body>
<h1>Best AI Tools 2026</h1>
<h2>What is the best AI tool?</h2>
<h2>What are the best AI tools?</h2>
<h2>What AI tool is best?</h2>
<h2>What is best AI tool 2026?</h2>
<p>The best AI tools 2026 are great for AI tools needs. AI tools help with AI tasks.</p>
<ul><li>Tool one</li><li>Tool two</li></ul>
</body></html>
`;

const SHORT_MARKDOWN = `# AEO Signals Ranked: 2026 Research Synthesis

Authority is the top predictor. Stanford research from 2026 found a 0.81 correlation between E-E-A-T density and citation rate.

## What's the strongest AEO signal?

Authority and E-E-A-T. Byline + bio combinations show +12pp citation lift in HubSpot data.

## How can publishers optimize?

- Schema.org Article = +8pp
- 3+ .edu citations = +15pp

Updated: April 20, 2026
`;

const PLAIN_TEXT_NO_SIGNALS = `
this is some random text that has no structure at all and no headings and no dates and no entities really just some words flowing along in a paragraph form without any markup or signals that an aeo scorer would pick up on
`;

const STALE_BUT_STRUCTURED = `
<html><body>
<h1>How AI Worked in 2018</h1>
<div class="byline">By Bob Smith</div>
<time datetime="2018-06-01">June 1, 2018</time>
<p>In 2018, machine learning relied heavily on supervised methods. Researchers at MIT and Stanford published 1,200 papers that year.</p>
<h2>What changed since then?</h2>
<p>Transformers, RLHF, and scale. See <a href="https://mit.edu/paper">MIT paper</a>.</p>
</body></html>
`;

describe("scoreContentRules", () => {
  it("scores a high-AEO HTML article close to the rule-based ceiling", () => {
    const result = scoreContentRules({ content: HIGH_AEO_HTML, url: "https://example.edu/post" }, NOW);
    expect(result.formatDetected).toBe("html");
    expect(result.total).toBeGreaterThan(30);
    expect(result.byDimension.authority.score).toBeGreaterThan(10);
    // Freshness: 5 (≤30d recency) + 1 (1 year stat "in 2026") = 6
    expect(result.byDimension.freshness.score).toBe(6);
    expect(result.byDimension.structural.score).toBeGreaterThan(8);
    expect(result.byDimension.qSubheadings.score).toBe(10);
  });

  it("applies diminishing-returns score (not zero) for 3-4 question subheadings", () => {
    const result = scoreContentRules({ content: SEO_STUFFED_HTML }, NOW);
    // Locked rubric: 3-4 question headings → 5 (diminishing returns), not 0
    expect(result.byDimension.qSubheadings.score).toBe(5);
    expect(result.byDimension.qSubheadings.evidence.join(" ")).toMatch(/diminishing|3-4/i);
    expect(result.total).toBeLessThan(25);
  });

  it("rewards 1-2 question subheadings with full points", () => {
    const result = scoreContentRules({ content: HIGH_AEO_HTML }, NOW);
    expect(result.byDimension.qSubheadings.score).toBe(10);
  });

  it("scores exactly 3 question subheadings as diminishing-returns (5)", () => {
    const html = `<h1>Title</h1><h2>What is X?</h2><h2>How does X work?</h2><h2>Why X?</h2><p>Body.</p>`;
    const result = scoreContentRules({ content: html }, NOW);
    // Locked rubric: 3-4 questions → +5 (diminishing returns, not anti-gaming penalty)
    expect(result.byDimension.qSubheadings.score).toBe(5);
  });

  it("scores plain text gracefully with low total", () => {
    const result = scoreContentRules({ content: PLAIN_TEXT_NO_SIGNALS }, NOW);
    expect(result.formatDetected).toBe("text");
    expect(result.total).toBeLessThan(10);
    expect(result.byDimension.freshness.score).toBe(0);
  });

  it("detects markdown format and parses headings + freshness", () => {
    const result = scoreContentRules({ content: SHORT_MARKDOWN }, NOW);
    expect(result.formatDetected).toBe("markdown");
    expect(result.byDimension.qSubheadings.score).toBe(10);
    // Freshness: 5 (≤30d recency) + 1 (1 year stat "2026 Research") = 6
    expect(result.byDimension.freshness.score).toBe(6);
    expect(result.byDimension.entity.score).toBeGreaterThan(0);
  });

  it("zeroes freshness on content >1 year old", () => {
    const result = scoreContentRules({ content: STALE_BUT_STRUCTURED }, NOW);
    expect(result.byDimension.freshness.score).toBe(0);
    expect(result.byDimension.freshness.evidence.join(" ")).toMatch(/stale/i);
  });

  it("uses meta.updatedAt over content date when both are present", () => {
    // meta.updatedAt wins as DATE SOURCE over <time datetime="2018-06-01">.
    // However, STALE_BUT_STRUCTURED mentions 2018 in the body — triggers
    // staleBodySignal, capping recency from 5 to 3. No current-year stats → 0.
    // Final: recency 3 + yearStat 0 = 3.
    const result = scoreContentRules(
      {
        content: STALE_BUT_STRUCTURED,
        meta: { updatedAt: "2026-04-20T00:00:00Z" },
      },
      NOW,
    );
    expect(result.byDimension.freshness.score).toBe(3);
    expect(result.byDimension.freshness.evidence.join(" ")).toMatch(/meta\.updatedAt/i);
    expect(result.byDimension.freshness.evidence.join(" ")).toMatch(/capped/i);
  });

  it("counts authority outbound links from .edu and .gov", () => {
    const result = scoreContentRules({ content: HIGH_AEO_HTML }, NOW);
    const ev = result.byDimension.authority.evidence.join(" ");
    expect(ev).toMatch(/authority|outbound/i);
  });

  it("returns total <= maxTotal", () => {
    const samples = [HIGH_AEO_HTML, SEO_STUFFED_HTML, SHORT_MARKDOWN, PLAIN_TEXT_NO_SIGNALS, STALE_BUT_STRUCTURED];
    for (const s of samples) {
      const r = scoreContentRules({ content: s }, NOW);
      expect(r.total).toBeLessThanOrEqual(r.maxTotal);
      expect(r.total).toBeGreaterThanOrEqual(0);
      Object.values(r.byDimension).forEach((d) => {
        expect(d.score).toBeLessThanOrEqual(d.max);
        expect(d.score).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it("is deterministic (same input → same output)", () => {
    const a = scoreContentRules({ content: HIGH_AEO_HTML }, NOW);
    const b = scoreContentRules({ content: HIGH_AEO_HTML }, NOW);
    expect(a.total).toBe(b.total);
    expect(a.byDimension).toEqual(b.byDimension);
  });

  it("exposes ruleGamingFlags in result", () => {
    const result = scoreContentRules({ content: HIGH_AEO_HTML }, NOW);
    expect(Array.isArray(result.ruleGamingFlags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectGamingPatterns
// ---------------------------------------------------------------------------

const REPETITION_STUFFED = `
<html><body>
<h1>AI Tools for Marketing</h1>
<p>The best AI tools for marketing help with AI marketing tasks. AI tools for marketing are the future of marketing AI.
Marketing teams use AI tools for marketing to boost their AI marketing results. AI tools for marketing save time on marketing AI workflows.
Every AI marketing professional needs AI tools for marketing in their AI marketing strategy. Our AI tools for marketing integrate with your existing marketing AI stack.
The best AI tools for marketing deliver AI marketing ROI across all AI tools for marketing channels. Choose AI tools for marketing wisely when building your AI marketing plan.
</p>
</body></html>
`.trim();

const ACRONYM_STUFFED = `
<html><body>
<h1>CRM, ERP, AI, ML, NLP, LLM, API, SDK, SaaS, PaaS, IaaS, B2B, B2C, ROI, KPI, OKR</h1>
<p>Our CRM integrates with ERP via API. AI and ML power NLP in our LLM-driven SDK. SaaS and PaaS options available on IaaS.
B2B and B2C ROI tracked via KPI and OKR dashboards. Our CRM ERP AI ML NLP LLM API SDK system drives ROI KPI OKR results.
CRM ERP integrations use AI ML models. LLM API SDK connects your SaaS PaaS IaaS stack. B2B ROI. B2C KPI. AI OKR.
Maximize ROI KPI and OKR with CRM ERP AI ML NLP LLM API SDK SaaS PaaS IaaS tools. Our CRM drives B2B ROI via AI ML NLP LLM OKR KPI dashboards.
</p>
</body></html>
`.trim();

const LISTICLE_PADDED = `
<html><body>
<h1>50 AI Tools You Need</h1>
<p>Here is a complete list of AI tools for marketers.</p>
<ul>
<li>Tool one</li><li>Tool two</li><li>Tool three</li><li>Tool four</li><li>Tool five</li>
<li>Tool six</li><li>Tool seven</li><li>Tool eight</li><li>Tool nine</li><li>Tool ten</li>
<li>Tool eleven</li><li>Tool twelve</li><li>Tool thirteen</li><li>Tool fourteen</li><li>Tool fifteen</li>
<li>Tool sixteen</li><li>Tool seventeen</li><li>Tool eighteen</li><li>Tool nineteen</li><li>Tool twenty</li>
</ul>
</body></html>
`.trim();

const HOLLOW_AUTHORITY = `
<html><body>
<h1>Why AI Marketing Works</h1>
<p>Studies show that AI marketing improves results dramatically. Research shows AI tools increase ROI by significant margins.
Experts agree that marketers who use AI outperform those who do not. According to experts, the AI revolution is here to stay.
Data shows that AI adoption is accelerating rapidly. Evidence shows that early adopters win in competitive markets.
Evidence suggests AI-first companies grow faster. Studies show consistent results across industries when AI is deployed correctly.
Research indicates brands that invest in AI see better outcomes than those that do not invest at all.
</p>
</body></html>
`.trim();

const CLEAN_SUBSTANTIVE = `
<html><body>
<h1>How AEO Scoring Works: A Technical Overview</h1>
<div class="byline">By Juan Minoprio</div>
<time datetime="2026-04-20">April 20, 2026</time>
<p>AEO scoring measures how likely AI engines will cite your content based on six validated dimensions.</p>
<h2>What signals predict AI citation?</h2>
<p>Authority (E-E-A-T) is the strongest signal, with a 0.81 correlation to citation rate according to
<a href="https://hbr.org/study">HBR's 2026 analysis of 6.8M citations</a>. Entity specificity and structural
extractability each contribute 20% of the total weighted score.</p>
<ul>
  <li>Authority and E-E-A-T account for 30% of the rubric weight, validated by Wellows (n=5,400 articles)</li>
  <li>Freshness within 90 days provides a 3.2× citation multiplier per Quattr's research</li>
  <li>Question-form subheadings in the 1-2 range maximize citation probability by 6pp over 3+ matches</li>
</ul>
<h2>How do different engines weight these signals?</h2>
<p>Perplexity weights authority at 35%, the highest of any engine. ChatGPT prioritizes freshness more than
Google AIO, requiring content updated within 90 days for consistent citation in 76% of cases.</p>
</body></html>
`.trim();

describe("detectGamingPatterns", () => {
  it("flags rule_keyword_stuffing on repetitive phrase content", () => {
    const text = REPETITION_STUFFED.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const flags = detectGamingPatterns(REPETITION_STUFFED, text, "html", text.split(/\s+/).length);
    expect(flags).toContain("rule_keyword_stuffing");
  });

  it("flags rule_entity_stuffing on extreme acronym density", () => {
    const text = ACRONYM_STUFFED.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const flags = detectGamingPatterns(ACRONYM_STUFFED, text, "html", wordCount);
    expect(flags).toContain("rule_entity_stuffing");
  });

  it("flags rule_listicle_padding on many short bullet items", () => {
    const text = LISTICLE_PADDED.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const flags = detectGamingPatterns(LISTICLE_PADDED, text, "html", wordCount);
    expect(flags).toContain("rule_listicle_padding");
  });

  it("flags rule_unsupported_claims on repeated vague authority phrases", () => {
    const text = HOLLOW_AUTHORITY.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const flags = detectGamingPatterns(HOLLOW_AUTHORITY, text, "html", wordCount);
    expect(flags).toContain("rule_unsupported_claims");
  });

  it("does NOT flag clean, substantive content", () => {
    const text = CLEAN_SUBSTANTIVE.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const flags = detectGamingPatterns(CLEAN_SUBSTANTIVE, text, "html", wordCount);
    expect(flags).not.toContain("rule_keyword_stuffing");
    expect(flags).not.toContain("rule_entity_stuffing");
    expect(flags).not.toContain("rule_listicle_padding");
    expect(flags).not.toContain("rule_unsupported_claims");
  });

  it("does NOT flag clean content via scoreContentRules", () => {
    const result = scoreContentRules({ content: CLEAN_SUBSTANTIVE }, NOW);
    expect(result.ruleGamingFlags).toEqual([]);
  });

  it("scoreContentRules returns ruleGamingFlags array on all inputs", () => {
    const inputs = [HIGH_AEO_HTML, SEO_STUFFED_HTML, REPETITION_STUFFED, LISTICLE_PADDED, HOLLOW_AUTHORITY];
    for (const content of inputs) {
      const result = scoreContentRules({ content }, NOW);
      expect(Array.isArray(result.ruleGamingFlags)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Stress-test fixes — Sprint 1/2/3
// ---------------------------------------------------------------------------

describe("Sprint 1.4 — URL field injection fix", () => {
  it("url field does not affect authority score (host-domain bonus removed from locked rubric)", () => {
    // The .edu/.gov host-domain bonus was removed when the rubric locked to 4
    // explicit sub-scores (byline, citations, original-data LLM, JSON-LD).
    // The url parameter is still accepted but has no scoring effect.
    const withDotEdu = scoreContentRules({ content: HIGH_AEO_HTML, url: ".edu" }, NOW);
    const withoutUrl = scoreContentRules({ content: HIGH_AEO_HTML }, NOW);
    expect(withDotEdu.byDimension.authority.score).toBe(withoutUrl.byDimension.authority.score);
  });
});

describe("Sprint 2.2 — fake citations bypass fix", () => {
  const PARENTHETICAL_ONLY = `
<html><body>
<h1>Why Marketing Works</h1>
<p>Studies show that content marketing improves results significantly. According to experts, the ROI is high.
Research shows that well-optimized content earns more citations (Smith 2026).
Experts agree that consistent publishing drives growth (Jones 2025). Data shows adoption is accelerating (Brown 2026).
Evidence shows early movers win the most (Taylor 2024). Studies show consistent results across industries (Wilson 2026).
</p>
</body></html>`.trim();

  it("parenthetical citations (Smith 2026) alone do NOT suppress hollow authority flag", () => {
    const result = scoreContentRules({ content: PARENTHETICAL_ONLY }, NOW);
    expect(result.ruleGamingFlags).toContain("rule_unsupported_claims");
  });
});

describe("Sprint 3.2 — listicle threshold at exactly 8 words", () => {
  const EIGHT_WORD_BULLETS = `
<html><body>
<h1>50 Tools You Should Use Right Now</h1>
<p>Here is the complete list for marketers who need help.</p>
<ul>
${"<li>This tool is great for your marketing team</li>\n".repeat(20)}
</ul>
</body></html>`.trim(); // each item is exactly 8 words

  it("bullet items averaging exactly 8 words ARE flagged (threshold is <=8)", () => {
    const result = scoreContentRules({ content: EIGHT_WORD_BULLETS }, NOW);
    expect(result.ruleGamingFlags).toContain("rule_listicle_padding");
  });
});

describe("Sprint 2.3 — meta.updatedAt freshness gaming cap", () => {
  const STALE_BODY_FRESH_META = `
<html><body>
<h1>AI Marketing Guide</h1>
<p>This guide was originally written in 2020 and draws on research from 2019 and 2018.
The fundamentals covered here have been the standard approach since 2017.
We cover everything marketers needed to know about AI tools back in those early days.</p>
</body></html>`.trim();

  it("freshly-stamped meta.updatedAt over stale body content is capped at 6, not 10", () => {
    const result = scoreContentRules(
      { content: STALE_BODY_FRESH_META, meta: { updatedAt: "2026-04-01" } },
      NOW,
    );
    expect(result.byDimension.freshness.score).toBeLessThanOrEqual(6);
  });

  it("fresh meta.updatedAt with current-year body earns recency + year-stat bonus", () => {
    // recency: 5 days → 5; year stats: "in 2026" from H1 → 1; total = 6
    const result = scoreContentRules(
      { content: HIGH_AEO_HTML, meta: { updatedAt: "2026-04-20" } },
      NOW,
    );
    expect(result.byDimension.freshness.score).toBe(6);
  });
});
