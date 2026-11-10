# TODO.md

Priority: P0 blocking · P1 next · P2 later. Owner role in brackets (see AGENT_HANDOFF.md).

## Phase 0–1 follow-ups
- [x] T0-01 Phase 0–1 approved by İso (2026-11-10).
- [x] T0-02 Push access fixed; docs on main (2026-11-10).
- [x] T0-03 TD-012 decided: downloader cancelled (2026-11-10).
- [ ] P1 T0-04 Watch UmutcanFX public demo videos / blog / preview lessons; add any missing features and
      confirm which panel owns each tool (rows marked "inferred"). [architect]
- [ ] P2 T0-05 Optional: code-level audit of Creative Universe source if İso uploads `creative-universe/source`. [architect]
- [ ] P1 T0-06 Record AE version on İso's Mac. [İso]

## Phase 2 — in progress (branch phase-2-foundation)
- [ ] P0 T2-H1 İso runs tests/host/PHASE2_MAC_TEST_TR.md on his Mac; record results. [İso → QA]
- [~] P1 T2-S1 AE CEP spike — code done, waiting for H test: (comp + text + eased keyframes, one undo group). [AE dev]
- [~] P1 T2-S2 Premiere CEP spike — code done (razor/setSpeed only probed), waiting for H test: (markers, rebuild-from-ranges, QE razor, QE setSpeed on 26.5.x). [PR dev]
- [ ] P1 T2-S3 Premiere UXP spike (same ops). [PR dev]
- [~] P1 T2-S4 Engine spike — server + ffmpeg analysis done; whisper.cpp + Mac benchmark open: (launch, WS handshake, ffmpeg, whisper.cpp benchmark on Apple Silicon). [perf]
- [~] P1 T2-S5 MCP spike — server done + automated test; Claude Desktop H test (guide section C) pending.
- [~] P1 T2-06 Monorepo scaffold done; GitHub Actions CI open. [architect]
- [~] P1 T2-07 Core models: Recipe, Tool, ranges done; Preset, StyleCard, MotionSpec, Journal open. [architect]
- [ ] P1 T2-08 UI shell (palette, tabs, themes, TR/EN, review dialog). [UI]
- [ ] P1 T2-09 Preset/library v1. [architect]
- [~] P1 T2-10 Silence Cutter v0 (markers + rebuild) done, waiting for H test. [PR dev]
- [~] P1 T2-11 5 recipes + speed ramp done, waiting for H test. [AE dev / motion]
- [~] P1 T2-12 Dev folder + install-mac.sh done; signed ZXP open. [architect]
