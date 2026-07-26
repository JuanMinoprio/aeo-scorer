# AEO Scorer — Claude Code Plugin

Score any piece of content for AI Engine Optimization (AEO) — the discipline of writing so AI engines (Google AIO, ChatGPT, Perplexity, Bing) cite your content in their answers.

Built by [Juan Minoprio](https://www.linkedin.com/in/juanminoprio/) — marketer, systems thinker, builder.

---

## What It Scores

6 dimensions, 100 points total:

| Dimension | Points | What It Checks |
|---|---|---|
| Authority & E-E-A-T | 30 | Byline, external citations, original data, JSON-LD |
| Entity Specificity | 20 | Named entity density, numeric specificity, analytical depth |
| Structural Extractability | 20 | Answer-first opener, passage length, tables/lists, heading hierarchy |
| Question Subheadings | 10 | Question-form H2/H3s (with anti-gaming diminishing returns) |
| Semantic Clarity | 10 | Query-intent match, jargon accessibility, information density |
| Freshness | 10 | Publication recency, current-year stats, temporal anchoring |

**Letter grades**: A 90+, B 80–89, C 70–79, D 60–69, F <60

**Anti-gaming**: If ≥2 stuffing patterns are detected (keyword stuffing, entity name-drops, listicle padding, unsupported authority claims, AI-slop prose), the score is capped at 60. The same signals that get pieces penalized by AI engines are detected and flagged here.

---

## Install (30 seconds)

Requires [Claude Code](https://claude.ai/code) to be installed.

```bash
mkdir -p ~/.claude/commands && curl -o ~/.claude/commands/aeo-scorer.md https://raw.githubusercontent.com/JuanMinoprio/aeo-scorer/main/aeo-scorer.md
```

> **Windows users**: This command works in WSL or Git Bash. For a manual install, download `aeo-scorer.md` and copy it to `%USERPROFILE%\.claude\commands\`.

---

## Usage

```
/aeo-scorer
```

Then either:
- **Paste your content** directly into the chat
- **Give a file path** to a local `.md` or `.txt` file

**Example output:**
```
File: pasted content (847 words)
AEO score: 74 / 100 (C)

  Authority      18/30 ⚠  · Named author but no Tier-1 citations
  Entity         16/20 ✓  · 12 entities, 6 numerics
  Structural     14/20 ⚠  · Opening paragraph buries answer after 3-line hook
  Q-Subheadings  10/10 ✓  · 2 question H2s (optimal range)
  Clarity         9/10 ✓
  Freshness       7/10 ✓  · Published 2026-05-01

Anti-gaming flags: none

Top 3 fixes (highest ROI first):
  1. Add 2 Tier-1 external citations (.gov, .edu, or major press) — worth up to 10 pts
  2. Compress your opening paragraph to ≤60 words and front-load the answer
  3. Add one proprietary data point with disclosed methodology for +5 on original data
```

**Bonus — URL scoring**: If you have WebFetch or [Firecrawl](https://firecrawl.dev) configured in Claude Code, you can pass a URL instead of pasting. Claude will fetch the page and score it live. Powerful for auditing a competitor's blog or your own published posts.

---

## Why AEO

Search is shifting. AI engines don't rank pages — they extract passages and synthesize answers. Content that earns citations shares specific structural traits: named authority, specific entities, answer-first structure, and fresh data. This rubric is calibrated against 2026 research on what gets cited vs. skipped across the four major AI engines.

---

## More Tools

This skill is part of a growing Claude Code toolkit for marketers:

- **[Hook Lab](https://github.com/JuanMinoprio/hook-lab)** — Test a LinkedIn hook 20 ways with a 5-persona AI jury
- **[Advisory Board](https://github.com/JuanMinoprio/advisory-board)** — 6-persona AI advisory board for strategic decisions

---

## License

MIT. Use it, fork it, build on it.
