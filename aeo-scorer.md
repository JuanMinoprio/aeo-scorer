---
name: aeo-scorer
description: Score any piece of content on the 6-dimension AEO rubric. Returns a total score out of 100, letter grade, per-dimension breakdown, anti-gaming flags, and top 3 prioritized fixes. Use when you say "score this for AEO," "AEO score," "will AI cite this," "rate this for citations," or paste any draft with "score" intent.
---

# /aeo-scorer — AEO Content Scorer

## What This Does

Scores content on a 6-dimension AEO rubric calibrated against 2026 research on AI citation patterns across Google AIO, ChatGPT, Perplexity, and Bing. Tells you exactly why AI engines cite (or skip) a piece — and what to fix.

## How to Use

Run `/aeo-scorer` then either:
- **Paste your content** directly into the chat
- **Give a file path** to a local markdown or text file

The skill reads your content and scores it against the rubric below. No API calls, no external dependencies.

> **Bonus**: If you have WebFetch or Firecrawl configured in your Claude Code setup, you can also pass a URL — Claude will fetch the page content and score it. This isn't required; paste or file path works for everything.

---

## The AEO Rubric (100 pts, 6 dimensions)

**Letter grades**: A 90+, B 80–89, C 70–79, D 60–69, F <60

**Anti-gaming cap**: If ≥2 stuffing patterns are detected (keyword stuffing, entity name-dropping, listicle padding, unsupported authority claims, AI-slop prose), the final score is capped at 60 regardless of structural compliance.

### 1. AUTHORITY & E-E-A-T (0–30) — sum of 4 sub-scores

```
A. Byline (0–10):
   Named author + domain credentials stated in the piece = 10
   Named author, no credentials stated = 5
   Brand/team/editorial/company attribution or none = 0

B. External citations (0–10):
   ≥3 Tier-1 links (.gov/.edu/Reuters/AP/NYT/WSJ/Bloomberg/FT/Nature/Lancet/PubMed) = 10
   1–2 Tier-1 links = 5
   Tier-2 only (industry pubs, non-Tier-1 news, company blogs) = 2
   Zero outbound external links = 0

C. Original data (0–5):
   Proprietary data + disclosed methodology (sample size, timeframe, method) = 5
   Data claimed/presented without methodology = 3
   None = 0

D. JSON-LD markup (0–5):
   Article/BlogPosting schema + author field detected = 5
   No JSON-LD detected = 0
```

### 2. ENTITY SPECIFICITY (0–20) — sum of 3 sub-scores

```
A. Entity density (0–8):
   ≥15 unique named entities topically relevant to content = 8
   8–14 unique named entities = 5
   3–7 unique named entities = 3
   0–2 unique named entities = 0
   Anti-stuffing gate: if >30% of entities are unrelated name-drops, downgrade one tier.

B. Numeric specificity (0–7):
   ≥5 distinct numeric specifics (%, $, multipliers, year refs with units) = 7
   3–4 distinct numeric specifics = 4
   1–2 distinct numeric specifics = 2
   Zero numeric specifics = 0

C. Entity depth vs stuffing (0–5):
   Entities appear in claims, comparisons, or explanations (analytical context) = 5
   Mixed: some analyzed, some just listed = 3
   Predominantly listed without analysis = 0
```

### 3. STRUCTURAL EXTRACTABILITY (0–20) — sum of 4 sub-scores

```
A. Answer-first opener (0–6):
   First paragraph directly answers the page's primary question in ≤60 words = 6
   First paragraph addresses topic but >60 words or buries answer after preamble = 3
   First paragraph is hook/anecdote/context-setter with no direct answer = 0

B. Passage chunk length (0–6):
   Median section length (words between H2/H3 headings) is 100–300 words = 6
   Median is 50–99 or 301–500 words = 3
   Median is <50 or >500 words, or content has no headings = 0

C. Tables or structured lists (0–4):
   ≥1 data table present = 4
   No table, but ≥5 bullet/numbered list items = 2
   Neither tables nor ≥5 list items = 0

D. Heading hierarchy (0–4):
   Sequential hierarchy (single H1 + H2s + H3s, no level skips) = 4
   Headings present but hierarchy broken (multiple H1s or skipped levels) = 2
   No headings or single heading only = 0
```

### 4. QUESTION SUBHEADINGS (0–10) — single score with anti-gaming

```
1–2 question-form H2/H3 headings = 10
3–4 question-form headings = 5   (diminishing returns)
0 question-form headings = 5     (baseline — heading presence still valuable)
5+ question-form headings = 3    (anti-gaming penalty)

Detection: heading starts with what/how/why/when/where/who/which/is/are/does/do/can/should/will
           OR ends with "?".
```

### 5. SEMANTIC CLARITY (0–10) — sum of 3 sub-scores

```
A. Query-intent match (0–4):
   H1/title maps to a plausible search query, first paragraph answers it = 4
   Topic addressed but insider framing mismatches how users would search = 2
   Framing disconnected from search intent = 0

B. Jargon accessibility (0–3):
   Technical terms avoided or defined on first use = 3
   Some jargon undefined, but context makes meaning inferable = 1
   Jargon-dense prose requiring domain expertise = 0

C. Information density (0–3):
   Every sentence advances argument/evidence/fact, no filler = 3
   Some filler, but majority carries information = 1
   Fluffy/repetitive, <50% of sentences carry new info = 0
```

### 6. FRESHNESS (0–10) — sum of 3 sub-scores

```
A. Publication/update recency (0–5):
   Published or updated within last 30 days = 5
   31–90 days ago = 3
   91–180 days ago = 1
   >180 days or no date detectable = 0

B. Current-year statistics (0–3):
   ≥2 stats anchored to current or prior year = 3
   1 stat anchored to current or prior year = 1
   No current-year stats = 0

C. Temporal anchoring (0–2):
   References ≥1 specific event/development from last 90 days = 2
   No recent event references = 0
```

---

## Execution Protocol

### Step 1: Read content
- If the user pasted content, use it directly
- If the user gave a file path, read the file. If markdown, parse YAML frontmatter for `author`, `published`, `updated` fields
- If the user gave a URL and WebFetch/Firecrawl is available, fetch and use the page content

### Step 2: Score
Apply the rubric above. For each dimension:
- Score each sub-dimension per its exact criteria
- Flag any anti-gaming patterns detected
- If ≥2 anti-gaming patterns detected, cap final total at 60

### Step 3: Output

Present a console-style breakdown:

```
File: [filename or "pasted content"] ([word count] words)
AEO score: [X] / 100 ([grade])

  Authority      [X]/30 [✓/⚠/✗]  · [brief reason]
  Entity         [X]/20 [✓/⚠/✗]  · [brief reason]
  Structural     [X]/20 [✓/⚠/✗]  · [brief reason]
  Q-Subheadings  [X]/10 [✓/⚠/✗]  · [brief reason]
  Clarity        [X]/10 [✓/⚠/✗]  · [brief reason]
  Freshness      [X]/10 [✓/⚠/✗]  · [brief reason]

Anti-gaming flags: [none | list any detected patterns]

Top 3 fixes (highest ROI first):
  1. [Specific, actionable fix]
  2. [Specific, actionable fix]
  3. [Specific, actionable fix]
```

Use ✓ for ≥80% of max points, ⚠ for 40–79%, ✗ for <40%.
