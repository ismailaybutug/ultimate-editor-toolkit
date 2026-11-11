# TECHNICAL_DECISIONS.md

Format: ID · decision · status · alternatives · reason · sources. Status: Proposed (needs İso), Accepted, Superseded.

## TD-001 Separate local Engine process for media/AI work — Accepted (2026-11-10), amended
- Amendment: in CEP the Engine module runs *inside the panel's Node context* (no extra process for the user to
  start) and also opens the WebSocket server for other clients. A stand-alone `dist/engine.mjs` exists for MCP/UXP.
- Alternatives: everything in CEP Node; Hybrid C++ plugin per app; cloud backend.
- Reason: one codebase for both apps, CEP and UXP, MCP and Windows; long jobs off the UI thread; no cloud cost or
  privacy issue (audio stays on device, matching UmutcanFX's local promise).

## TD-002 Premiere v1 on CEP + ExtendScript, UXP in parallel behind one adapter — Accepted (İso approved plan 2026-11-10)
- Alternatives: UXP-only now; CEP-only forever.
- Reason: UXP lacks razor/split, time remap, MOGRT param enumeration and QE today; CEP works until at least Dec 2028
  (disabled by default) and removal from Dec 2029. Building the adapter interface now makes migration per-operation.
- Revisit: every Premiere release; mandatory before Dec 2027 (Exchange stops new CEP submissions for Premiere).
- Sources: Adobe Developer blog 2026-09-24 "UXP comes to our flagship applications"; forums.creativeclouddeveloper.com
  threads 11375 (razor), 12026 (time remap, 26.3.0), 12131 (MOGRT params, ExtendScript status), 11397 (new APIs).

## TD-003 After Effects on CEP + ExtendScript; AE UXP tracked — Accepted (İso approved plan 2026-11-10)
- Reason: AE UXP only reached public beta ~Nov 2026; ExtendScript is complete for comp generation.
  Re-evaluate in Phase 6.

## TD-004 Non-destructive "rebuild from ranges" for cuts — Accepted (İso approved plan 2026-11-10)
- Alternatives: QE razor + ripple delete in place.
- Reason: works in both ES and UXP, never destroys the original, trivially revertible; QE kept as fallback.

## TD-005 Local transcription with whisper.cpp — Accepted (İso approved plan 2026-11-10)
- Alternatives: Premiere's own transcription (not reliably scriptable), cloud STT (cost, privacy).
- Reason: free, offline, Metal-accelerated on Apple Silicon, word timestamps, TR + EN support.

## TD-006 AI is optional and bring-your-own: MCP server first, API key second — Accepted (İso approved plan 2026-11-10)
- Reason: users with Claude Desktop (or another MCP client) drive our tools on their own subscription at zero cost to
  us; in-panel AI uses user's API key with a spending cap. No product feature *requires* AI except the Motion
  Generator's free-text planning, and even that has a template-only fallback.

## TD-007 LLM outputs structured plans, never host code — Accepted (İso approved plan 2026-11-10)
- Alternatives: let the model write ExtendScript.
- Reason: generated code is fragile, unsafe and expensive; a schema-constrained ScenePlan compiled by our own
  deterministic compiler is testable, cacheable and replayable without the model.

## TD-008 Map data: Natural Earth (public domain) + GeoNames cities (CC-BY 4.0) bundled offline — Accepted (İso approved plan 2026-11-10)
- Reason: no API cost, offline, licence-clean; attribution recorded in credits.

## TD-009 TypeScript everywhere; ExtendScript generated from TS (ES3 target) — Accepted with amendment (2026-11-10)
- Amendment: for the Phase 2 spikes the host libraries are hand-written ES3 `.jsx` (small, easy to debug in the
  apps), guarded by an ES3 syntax check (`pnpm lint:jsx`) and mock-DOM tests. Revisit TS→ES3 generation when the
  libraries grow (Phase 3).
- Reason: one language, types for Adobe DOM (types-for-adobe), shared core logic.

## TD-010 Monorepo with 13 root docs as source of truth — Accepted (brief §7)

## TD-011 Original assets only — Accepted (brief + coordinator note)
- We never copy UmutcanFX presets, graphics, names, LUTs, SFX or UI. SFX/LUT sources: own production, CC0, or
  licensed with records. Every asset has a licence entry in `/assets/LICENSES.json`.

## TD-012 URL downloader — **Decided 2026-11-10: cancelled by İso** ("video indiriciyi iptal et")
- No YouTube/TikTok/social downloader in scope. The proposed replacement (direct-URL import + local Pacing
  Analyzer) is NOT approved either; it stays an open idea only.
- Options: (a) full yt-dlp downloader like UmutcanFX; (b) direct-URL import + local Pacing Analyzer only (recommended);
  (c) skip.
- Reason for (b): platform terms of service forbid downloading; Adobe Exchange listing risk; legal exposure for a
  commercial product. (b) keeps the creative value (pacing analysis) without the risk.

## TD-013 Dual-mode preview strategy — Accepted (İso approved plan 2026-11-10)
- Panel previews are pre-rendered loops/thumbnails made at build time by an AE render script; no live rendering in
  panel (performance).
