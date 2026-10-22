# AEO Scorer — Claude Code Plugin

Score any piece of content for AI Engine Optimization (AEO) — the discipline of writing so AI engines (Google AIO, ChatGPT, Perplexity, Bing) cite your content in their answers.

Built by [Juan Minoprio](https://www.linkedin.com/in/juanminoprio/) — marketer, systems thinker, builder.

---

## What It Scores

6 dimensions, 100 points total. The rubric is locked and calibrated against **37 cited 2026 studies** on what Google AI Overviews, ChatGPT, Perplexity, and Bing Copilot actually reward when picking citation candidates — each engine weights signals differently (Google AIO weights structure higher; Perplexity weights authority higher), and the score reflects that.

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

Requires [Claude Code](https://claude.ai/code). Pick one.

**Option A: plugin (recommended, gets updates)**

```
/plugin install aeo-scorer --marketplace JuanMinoprio/aeo-scorer
```

On Claude Code older than 2.1.275, use two steps instead:

```
/plugin marketplace add JuanMinoprio/aeo-scorer
/plugin install aeo-scorer@aeo-scorer
```

Run it as `/aeo-scorer:aeo-scorer`.

**Option B: single command file**

```bash
mkdir -p ~/.claude/commands && curl -fsSL -o ~/.claude/commands/aeo-scorer.md https://raw.githubusercontent.com/JuanMinoprio/aeo-scorer/main/aeo-scorer.md
```

Run it as `/aeo-scorer`.

> **Windows users**: Option B works in WSL or Git Bash. For a manual install, download `aeo-scorer.md` and copy it to `%USERPROFILE%\.claude\commands\`.

---

## Offline CLI (no Claude, no API key)

The repo also ships the deterministic rule engine that powers the [web scorer](https://juanminoprio.com/tools/aeo-scorer?utm_source=github&utm_medium=readme&utm_campaign=aeo-scorer). It covers 73 of the 100 points (everything that doesn't need LLM judgment), runs in milliseconds, and makes zero network calls. Use it to score a folder of drafts or to gate content in CI.

Requires Node.js 22.18 or later. No `npm install` step: there are no dependencies.

```bash
git clone https://github.com/JuanMinoprio/aeo-scorer && cd aeo-scorer
node cli/aeo-score.ts path/to/post.md          # human-readable report
node cli/aeo-score.ts --json drafts/*.md       # machine-readable
node cli/aeo-score.ts --min 45 drafts/*.md     # exit 1 if any draft scores below 45/73
curl -s https://example.com/post | node cli/aeo-score.ts -   # score HTML from stdin
```

Markdown front-matter dates (`date:`, `updated:`) count toward freshness, and full HTML pages are stripped of nav, footer, and scripts before scoring, the same way the web tool does it. Run `node cli/aeo-score.ts --help` for every flag. Tests: `npm test`.

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

This skill is part of the free **[Marketing Toolkit](https://github.com/JuanMinoprio/marketing-toolkit)** for Claude Code:

- **[Hook Lab](https://github.com/JuanMinoprio/hook-lab)** — Test a LinkedIn hook 20 ways with a 5-persona AI jury
- **[Advisory Board](https://github.com/JuanMinoprio/advisory-board)** — 6-persona AI advisory board for strategic decisions

---

## Privacy and secrets

Nothing in this repo needs an API key, token, or account. The skill runs inside your own Claude Code session, and the CLI never touches the network. If you fork it and add an integration that does need a key, keep it in a local `.env` file: `.gitignore` already blocks `.env` files from being committed.

---

## Want this built for your team?

I'm Juan Minoprio. I build AI tools and workflows for marketing teams: systems like this one, scoped to your stack, your data, and your compliance rules.

**[Start a conversation](https://juanminoprio.com/inquire?utm_source=github&utm_medium=readme&utm_campaign=aeo-scorer)** or email hello@juanminoprio.com.

---

## License

MIT. Use it, fork it, build on it. See [LICENSE](./LICENSE).
