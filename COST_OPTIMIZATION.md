# COST_OPTIMIZATION.md

Two separate cost areas: **(A) building the product** with AI coding agents, and **(B) AI used by the product**.
Prices: Anthropic first-party API list prices, cached 2026-11-03 (verify before budgeting; subscription usage limits
are separate from API billing — switching models does not make usage free).

| Model | ID | Input $/MTok | Output $/MTok | Cache read $/MTok |
|---|---|---|---|---|
| Fable 5.2 | `claude-fable-5-2` | 8.00 | 40.00 | 0.20 |
| Opus 5.5 | `claude-opus-5-5` | 4.00 | 20.00 | 0.20 |
| Sonnet 5.5 | `claude-sonnet-5-5` | 2.00 | 10.00 | 0.10 |
| Haiku 5.5 | `claude-haiku-5-5` | 0.10 | 0.50 | — (see docs) |
Batch API: ~50% off for non-urgent jobs. Prompt caching: stable prefix (tools → system → messages), max 4 breakpoints.

## A. Development (AI coding agents)

| Work type | Model tier | Why |
|---|---|---|
| Architecture changes, hard debugging, ScenePlan/compiler design, phase checkpoints | Fable / Opus | Rare, high-leverage reasoning |
| Feature implementation from a clear spec, tests, refactors | Opus or Sonnet | Bulk of the work |
| Docs updates, changelog, file moves, boilerplate, asset manifests | Sonnet / Haiku or plain scripts | Cheap, mechanical |
| Formatting, lint, packaging, renaming | scripts (no model) | Deterministic |

Context rules: read NEXT_SESSION.md + the files named there, not the whole repo; keep task briefs small with
explicit acceptance criteria; cache research in docs (never re-research what TECHNICAL_DECISIONS.md already
records); no sub-agents unless İso approves (each starts cold and re-reads context).

Budget split guidance: ≤10% of available budget on research/planning (Phase 0–1 used roughly one session),
≥70% on implementation + tests, ≥20% reserve for debugging after H tests.

## B. Product runtime AI

Principle: **AI is optional**; every deterministic path works offline with zero API cost.

| Task | Default (free) | AI use (optional) | Model | Est. tokens / call | Est. cost / call* |
|---|---|---|---|---|---|
| Transcription, silence, beats, scenes, loudness, tracking | local (whisper.cpp, ffmpeg, ONNX) | none | — | 0 | $0 |
| Filler words | lexicon + acoustic | ambiguous cases only | Haiku | 2k in / 0.3k out | ~$0.0004 |
| Retake detection | n-gram similarity | ambiguous pairs | Haiku/Sonnet | 4k / 0.5k | $0.0007–$0.013 |
| Translation (non-EN target) | whisper EN translate | other languages | Haiku (batched) | 10 min video ≈ 3k / 3k | ~$0.002 |
| Chapters / shorts ranking | text-tiling, heuristics | titles + ranking | Haiku | 8k / 1k | ~$0.0013 |
| Motion Generator plan | template-only mode | ScenePlan JSON | Sonnet (Opus for complex) | 10k cached system + 0.5k user / 3k out | Sonnet ≈ $0.051 uncached, ≈ $0.032 with cache hit |
| Plan self-check | none | optional | Haiku | 4k / 0.3k | ~$0.0006 |
*Computed from the table above; to be measured in Phase 5 with real prompts.

Controls:
- **MCP path costs us nothing**: the user's own AI app (e.g. Claude Desktop) calls our tools.
- In-panel AI needs the user's own key, with a monthly cap and a per-call cost preview.
- Cache: identical normalised prompt + context hash → reuse ScenePlan; saved Motion Recipes re-run without any model.
- Prompt caching on the fixed system prompt + generator catalogue + schema.
- Structured outputs (schema-constrained JSON) to avoid retries.
- Never send media to the model; only transcripts/metadata, and only when the user triggers an AI action.
- Log tokens per feature (local only) to tune routing.
