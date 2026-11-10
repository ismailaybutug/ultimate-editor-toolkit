# FEATURE_INVENTORY.md — UmutcanFX baseline audit and our implementation plan

Last updated: 2026-11-10 (Phase 0). Owner: orchestrator.

## 0. How to read this file

- **Every row is backed by evidence.** The primary source is the official product page
  <https://umutcancelikis.com/umutcanfx> (read 2026-11-10). Secondary: the public GitHub release list
  `github.com/umutcancelikis/umutcanfx-sfx/releases` (tags such as `panel-1.11.57` "UmutcanFX After 1.11.57",
  `premiere-1.0.128`), which shows two independently versioned panels (After Effects 1.11.x, Premiere 1.0.12x) and
  that the SFX library / version manifests are hosted on GitHub. Release bodies are empty, so they add no features.
- **Not yet inspected** (Phase 0 follow-up, see TODO.md T0-04): demo videos on the author's YouTube/Instagram/TikTok,
  the blog (`/blog.html`, includes a "Speed Ramp Rehberi"), course preview lessons. They may reveal more
  features or confirm which panel owns each tool. Until then, **App = "page" means the page says which panel;
  App = "inferred" means our reading.**
- We record *what a feature does*, never their assets, names of presets, visuals or code. All our presets, graphics,
  LUTs, SFX and UI are original or properly licensed (see TECHNICAL_DECISIONS.md TD-011).
- Difficulty: S (days), M (1–2 weeks), L (2–4 weeks), XL (>1 month or research risk).
- "Impl" codes: **AE-ES** = After Effects ExtendScript; **PR-ES** = Premiere ExtendScript (incl. QE DOM);
  **PR-UXP** = Premiere UXP `premierepro` API; **ENG** = our local Engine process (ffmpeg, whisper.cpp, analysis);
  **AI** = optional LLM call; **MOGRT** = Motion Graphics template built in AE, used in Premiere.
- Every feature's test plan has three levels: **U** unit tests (Node, no Adobe), **G** golden tests (generated
  host script compared to snapshot), **H** host test in the real app (manual or via the Premiere MCP bridge,
  results go to TEST_REPORT.md). Nothing counts as done without H.

Counts on the page (for scale, not to copy): 300 graphics in 9 sets, 105 titles (40 premium), 79 transitions in
6 categories, 80 layer animations, 55 text presets, 13 3D carousel layouts, 20 callout styles, 30 LUTs, 10 animated
backgrounds × 8 palettes, 21 speed-ramp shapes, 37 easing curves, 12 style cards, 8 premium subtitle looks,
35 subtitle languages, 30 TTS voices. Price $59 one-time, one computer, Windows + Mac. Our goal is fewer, better,
parametric tools rather than matching counts (brief §13).

---

## 1. AI layer

### F-AI-01 AI editing through an external AI desktop app
- **App:** both (page). **Original:** panel connects to the user's AI desktop app; the AI calls UmutcanFX tools in
  Premiere/AE; user approves each request with Enter. Three entry points: voice assistant, "YZ Kurgu" text tab with an
  Activity card listing each step, or chatting in the AI app directly. (The page does not name the AI app or protocol;
  the pattern matches an MCP server. Unverified.)
- **Workflow:** type/say request → AI plans → each tool call shown → user approves → change applied.
- **Impl:** our Engine exposes every tool through an **MCP server** (stdio + localhost) so Claude Desktop or any MCP
  client can drive it with the user's own subscription (zero API cost to us). In-panel chat uses the same tool registry
  with an optional user API key.
- **Our version:** typed tool registry shared by UI, MCP and AI Motion Generator; dry-run preview of every change
  (diff of what will be added/removed); per-step approve/skip; operation journal with replay; cost meter.
- **Deps:** Engine, tool registry, host adapters, journal. **Difficulty:** L. **Tests:** U schema validation of every
  tool; H scripted MCP session that runs 10 representative tools in both apps.

### F-AI-02 Voice assistant (UFX Assistant)
- **App:** both (page). **Original:** voice input in panel, spoken replies; 30 voices (male/female/neutral), two styles
  (cinematic/natural), TR + EN; listening toggle; support-request command with optional diagnostics. Fluent voice
  needs a personal key; otherwise limited local mode.
- **Impl:** push-to-talk; local STT (whisper.cpp) → same tool registry; TTS via macOS/Windows system voices (free) or
  optional cloud TTS with user key. Diagnostics bundle = logs + versions, user-reviewed before sending.
- **Our version:** push-to-talk by default (no always-on mic), command grammar for frequent actions works offline
  without any LLM ("cut silences", "add subtitles") — LLM only for open requests.
- **Deps:** F-AI-01, ENG STT. **Difficulty:** M. **Tests:** U intent parser; H 20 TR + 20 EN spoken commands.

### F-AI-03 Safe edit: sequence backup and one-click revert
- **App:** both (page: "sequence is backed up before the first change; nothing deleted or overwritten; one click
  reverts").
- **Impl:** PR: duplicate sequence (`Sequence.clone()` in ES / UXP equivalent) into a `_UET Backups` bin before the
  first destructive op per session; AE: `app.beginUndoGroup` per op + optional comp duplicate. Journal records
  every op with inverse where possible.
- **Our version:** per-operation restore points, named history, diff view, auto-prune policy.
- **Difficulty:** M. **Tests:** H destructive op → revert → compare sequence structure hash.

### F-AI-04 Rough cut (pauses, filler words, retakes keeping the last take)
- **App:** Premiere (inferred). **Original:** AI removes pauses, "umm/uhh", and repeated takes, keeping the last.
- **Impl:** ENG transcript with word timestamps (whisper.cpp, local) + silence map (F-AU-01). Fillers by lexicon
  (TR: "ııı, eee, şey, yani…"; EN: "um, uh, like, you know…") + acoustic detector. Retake detection: deterministic
  n-gram similarity of adjacent sentences first; LLM only for ambiguous cases (cheap model, transcript only).
  Apply by rebuilding a new sequence from kept ranges (non-destructive) — avoids the missing razor API (TD-004).
- **Our version:** review list with play-preview per cut, confidence scores, "keep" pins, J/L-cut padding.
- **Deps:** F-AU-01, ENG STT, PR adapter "rebuild from ranges". **Difficulty:** L. **Tests:** U on fixture
  transcripts; H on 3 reference clips (TR talk, EN talk, podcast) with known ground-truth cuts.

### F-AI-05 Subtitles + translation (AI path) → see F-SUB-*.

### F-AI-06 Animated scene templates (hook titles, end cards, stickers, price tags, polls, chat bubbles, countdowns)
- **App:** both (inferred). **Impl:** parametric AE comps exported as MOGRT for Premiere; AE-ES builder for AE.
- **Our version:** each template is a *generator* with typed parameters (text, colors from Style Card, duration,
  aspect), not a static file. **Difficulty:** L (content-heavy). **Tests:** G + H render check in 3 aspects.

### F-AI-07 Titles, lower thirds and graphic placement by AI → uses F-MG-01/02 via tool registry.

### F-AI-08 Music, ducking under speech, loudness leveling by AI → uses F-AU-03/04.

### F-AI-09 Transitions, SFX, LUTs, shakes, zooms, callouts by AI → uses F-TR, F-AU-07, F-VFX-*.

### F-AI-10 Voiceover from video or from a script (30 voices, 2 styles)
- **App:** both (inferred). **Impl:** script from transcript (optional LLM summarise/rewrite) → TTS (system voices
  free; optional cloud TTS with user key) → WAV imported at playhead on empty track.
- **Our version:** per-line timing to picture, pronunciation dictionary, re-generate single line.
- **Difficulty:** M. **Tests:** H import + sync check.

### F-AI-11 Face/object tracking with blur or attached text → see F-VFX-06.

### F-AI-12 Shorts/Reels extraction (9:16) from long video
- **App:** Premiere (inferred). **Impl:** candidate segments from transcript (hooks, complete thoughts, energy) —
  deterministic scoring first, optional LLM ranking on transcript text only; then F-FMT-03 reframe + F-SUB styling.
- **Our version:** ranked candidate list with reasons, length targets (15/30/60 s), batch create sequences.
- **Difficulty:** L. **Tests:** H on a 20-min fixture.

### F-AI-13 Cover image + platform export (TikTok, Reels, Shorts, YouTube MP4)
- **Impl:** frame export (F-PROD-06) + title overlay; export via encoder presets (PR-ES `exportAsMediaDirect` /
  AME queue, PR-UXP `EncoderManager`). **Our version:** platform preset pack (resolution, bitrate, loudness check
  before export). **Difficulty:** M. **Tests:** H export each preset, verify with ffprobe.

### F-AI-14 Download from links with pacing analysis
- **Original:** download from YouTube/Instagram/TikTok/X/Vimeo etc.; quality Best/4K/2K/1080/720; video, MP3/WAV,
  cover JPG/PNG, SRT; drops at playhead on empty track; batch/playlist; rights warning. "Pacing analysis before
  copying" (analyse a reference video's cut rhythm).
- **STATUS: CANCELLED by İso on 2026-11-10 ("video indiriciyi iptal et"). Not in scope. Do not implement.**
- **Impl (for the record only):** technically yt-dlp + ffmpeg. **Legal/ToS risk** (platform terms prohibit downloading; Adobe Exchange may
  reject). **Decision needed from İso: TD-012.** Proposed: ship "Import from URL" only for direct media URLs and
  user's own cloud links; offer **Pacing Analyzer** on any local file (shot length histogram, cut rhythm, average
  shot length) which delivers the creative value without the downloader.
- **Difficulty:** M. **Tests:** U pacing analyzer on fixtures.

### F-AI-15 Style Cards (12 ready styles) + Style Studio
- **App:** both; "custom styles shared across both panels" (page). **Original:** one card sets subtitles, titles,
  motion, transitions, sound, colour, ending. Phone preview with TikTok/Reels/Shorts UI overlays and safe zones.
  Readability checks (contrast, line length, Turkish characters) with one-click fixes.
- **Impl:** `StyleCard` JSON schema in core (fonts, palette, subtitle look, title preset ids, transition family, SFX
  set, LUT, end card). Stored in shared user library (Engine) so both panels see the same file. Phone preview =
  HTML canvas mock of current frame (exported via F-PROD-06) with our own drawn safe-zone overlays.
- **Our version:** brand kits (logo, fonts, colours) → auto-generated Style Cards; WCAG contrast score; per-platform
  safe-zone presets as data; import/export `.uetstyle`.
- **Difficulty:** L. **Tests:** U schema + contrast math; H apply card to fixture sequence in PR and comp in AE.

---

## 2. Subtitles

### F-SUB-01 Local transcription, 35 languages, auto-detect, audio stays on device
- **Impl:** whisper.cpp (Metal on Apple Silicon, CPU/CUDA on Windows) in Engine; model download on first use
  (small → large-v3-turbo selectable). Word-level timestamps. **Cost: zero API.**
- **Difficulty:** M. **Tests:** U WER on TR/EN fixtures; perf benchmark on MacBook Air (İso's machine).

### F-SUB-02 Premium stacked subtitles (8 looks), key-word emphasis
- **Impl (AE):** text layer + text animators per word (AE-ES fully supports animators and range selectors).
  **Impl (PR):** two paths — (a) native caption track (PR-ES `createCaptionTrack` from SRT; styling limited) or
  (b) MOGRT-per-phrase with parameters (rich styling; MOGRT param enumeration in UXP not yet available → use ES
  for param setting, TD-002). Key-word selection: heuristics (nouns, numbers, emphasis words) + optional LLM.
- **Our version:** look = data (font, stroke, shadow, box, emphasis rule, animation in/out); unlimited user looks.
- **Difficulty:** L. **Tests:** H 3 looks × 2 apps × 3 aspects.

### F-SUB-03 Karaoke highlighting in chosen colour
- **Impl:** per-word timing from F-SUB-01 → AE animator keyed to word times; PR via MOGRT with per-word timing
  params or AE comp via Dynamic Link. **Difficulty:** M.

### F-SUB-04 Translation to English; SRT import/export
- **Impl:** SRT import/export deterministic (core). Translation: whisper `translate` task (to EN only, free, local)
  or optional LLM for any-to-any with user key (cheap model, batched). **Difficulty:** S–M.

### F-SUB-05 Corrections list (repeatedly misheard words)
- **Impl:** user dictionary applied post-STT + passed as whisper initial prompt. **Difficulty:** S.

### F-SUB-06 Word Guard (don't cut inside words) → part of F-AU-01.

---

## 3. Audio (Sound Lab)

### F-AU-01 Silence Cutter
- **App:** Premiere (inferred). **Original:** measures room noise, auto threshold, marks silences, detects "umm/uhh",
  Word Guard, padding controls, Undo Cut; original audio never deleted.
- **Impl:** ENG: ffmpeg decode → RMS/VAD (WebRTC VAD or Silero VAD ONNX) with noise-floor estimate → ranges; word
  timestamps protect words. Apply: (1) markers only, (2) rebuild new sequence from kept ranges, (3) PR-ES QE razor +
  ripple delete on a duplicate (fallback). Never touches source media.
- **Our version:** multi-track aware (cut only when *all* mics are silent, for podcasts), min-silence / min-keep
  sliders with live waveform preview, presets per content type.
- **Difficulty:** L. **Tests:** U ranges on fixtures with ground truth; H on 3 clips; timing accuracy ±1 frame.

### F-AU-02 Dialogue separation (speech vs background onto two tracks)
- **Impl:** ENG optional ML model (Demucs/HT-Demucs or a lighter ONNX speech-separation model), downloaded on demand;
  writes two WAVs, imports to two tracks aligned. Heavy on CPU — show time estimate.
- **Difficulty:** L (model packaging). **Tests:** H + SDR metric on fixture.

### F-AU-03 Duck music under speech
- **Impl:** speech ranges from VAD → volume keyframes on music clip (PR-ES/UXP keyframes on Volume `Level`);
  attack/release/depth params. **Difficulty:** M. **Tests:** H keyframe count/positions.

### F-AU-04 Loudness targets (-14 / -16 / -23 LUFS)
- **Impl:** ffmpeg `ebur128` measure per clip / mixdown → gain adjustment on clip volume; true-peak check.
- **Our version:** measure the *rendered* mix (export temp WAV) for accurate integrated loudness, report card.
- **Difficulty:** M. **Tests:** U measurement vs reference files; H after-export LUFS within ±0.5.

### F-AU-05 Beat markers on music
- **Impl:** ENG onset + tempo tracking (aubio or own spectral-flux implementation) → sequence/clip markers.
- **Our version:** downbeat/bar detection, marker density control, sections (drop/chorus) by energy.
- **Difficulty:** M. **Tests:** U against annotated beats (F-measure).

### F-AU-06 Audio FX: phone, radio, underwater, megaphone
- **Impl:** presets built from native Premiere/AE audio effects (EQ, distortion, filters) applied via
  `AudioFilterFactory` (UXP) / QE (ES). **Difficulty:** S. **Tests:** H apply + audible check.

### F-AU-07 SFX library (whooshes, impacts, risers)
- **Impl:** our own or licensed SFX (CC0 / commissioned / user-owned), indexed by Engine with tags, loudness, length;
  drag or click → import at playhead. User folders can be added (brief §4E).
- **Our version:** auto-placement assistant: suggests SFX at transitions/cuts/beat markers. **Difficulty:** M
  (+ asset sourcing). **Tests:** H insert at playhead on free track.

---

## 4. Speed

### F-SP-01 Speed buttons 25%–1000% + one-click reverse
- **Impl:** PR-ES QE `setSpeed` (constant speed incl. reverse, ripple). PR-UXP has read-only speed (gap, TD-004).
  AE: time stretch / time remap. **Difficulty:** S (PR via QE, unverified on Premiere 2026). **Tests:** H.

### F-SP-02 Speed ramps (target 10–400%, ramp-in/out/both), Edit Machine (21 shapes, 37 easings), real keyframes
- **App:** After Effects (page says the AE panel has "speed curves"). **Original:** ramps built from real, hand-editable
  keyframes.
- **Impl (AE):** enable Time Remap, compute keyframes from a ramp curve, set temporal ease (AE-ES full support).
  **Impl (PR):** Premiere Time Remapping is **not scriptable** in ES or UXP as of Premiere 26.3 (Adobe forum,
  2026). Options: send clip to AE via Dynamic Link and ramp there; or simulate with segmented constant speeds via QE
  (approximation). Track Adobe's API for a native path.
- **Our version:** ramp *curve editor* (bezier on speed graph), beat-synced ramps (ramp peaks on beat markers), frame-
  accurate duration preservation option, library of shapes as data, unlimited user shapes.
- **Difficulty:** M (AE) / XL (PR native). **Tests:** U curve→keyframe math; H AE keyframes equal expected values.

---

## 5. Transitions

### F-TR-01 Transition library (79 in 6 families: Camera, Glitch, Shapes, Light, Film, Flash), strength 50–200%,
custom colours for light/shape, placed as separate layers above cuts, replacing swaps the previous one
- **App:** both (page).
- **Impl (AE):** layer-based transitions generated by script: adjustment layer with native effects (Transform,
  Directional Blur, Displacement, Turbulent Displace, Glow, Shape layers) keyed around the cut; strength scales
  amplitudes. **Impl (PR):** "above-the-cut" clip: adjustment-layer + effect presets (where effect params are
  scriptable) or MOGRT / pre-rendered alpha overlays (ProRes 4444) for light/flash/film families. Swapping = find
  our tagged clip at the cut and replace.
- **Our version:** **Transition Builder** — a transition is a JSON recipe (layers, effects, keyframe curves,
  parameters); users can edit and save; direction-aware (whip left/right), motion-matched (match whip direction to
  shot motion via optical flow — Phase 4).
- **Difficulty:** L (+ content). **Tests:** G recipe→script; H apply/replace/remove in both apps.

---

## 6. Motion graphics and titles

### F-MG-01 Titles library (105, 40 premium); "/" splits text lines into template fields; auto-fit vertical/square/landscape
- **Impl:** parametric title generators (AE-ES builds text + shape layers + animators); for PR, the same generators
  exported as MOGRTs with Essential Graphics params. Auto-fit = layout engine in core computing positions per aspect.
- **Our version:** responsive layout rules, Style Card driven, live preview thumbnails rendered once and cached.
- **Difficulty:** L. **Tests:** H 3 aspects.

### F-MG-02 Graphics library (300 in 9 sets: logos, social, notifications, lower thirds, chat, badges, …)
- **Impl:** same generator approach; vector shapes authored as our own SVG→shape-layer converter input.
- **Our version:** fewer, parametric, brand-aware items; SVG import as editable AE shape layers.
- **Difficulty:** L (content). **Tests:** H.

### F-MG-03 Layer animations: 80 in / emphasis / out moves
- **App:** AE (inferred). **Impl:** keyframe recipes applied to selected layers (position/scale/rotation/opacity/
  mask/effects) with easing curves; relative to layer's current values.
- **Our version:** recipe editor, stagger across multiple layers, apply to text by word/char.
- **Difficulty:** M. **Tests:** U recipe math; H on selection of 5 layers.

### F-MG-04 Text presets: 55 animations with live previews
- **Impl:** AE text animators (range selectors by char/word/line), saved as recipes + `.ffx` export.
- **Our version:** preview = pre-rendered small looping WebM per preset (rendered once in AE by a build script).
- **Difficulty:** M. **Tests:** H.

### F-MG-05 3D Carousel: 13 spinning 3D layouts
- **Impl:** AE-ES: 3D layers parented to a null, arranged on circle/arc/helix; camera optional; rotation keyframes.
- **Our version:** layout math in core (any N items, radius, tilt, focus item), auto-camera.
- **Difficulty:** M. **Tests:** H.

### F-MG-06 Callouts: 20 styles with number counters
- **Impl:** AE-ES: leader line (shape path trim), dot, label; counter via Slider + `sourceText` expression.
- **Our version:** track-attached callouts (attach to F-VFX-06 tracking data), arrow/pointer family.
- **Difficulty:** M. **Tests:** H.

### F-MG-07 Animated backgrounds: 10 × 8 palettes, vertical/landscape, HD/4K
- **App:** Premiere (page lists backgrounds under the Premiere panel). **Impl:** procedural AE comps (Fractal Noise,
  gradients, shapes) rendered to ProRes/H.264 loops in all sizes at build time, or MOGRT with colour params.
- **Our version:** palette from Style Card; seamless loops; procedural so infinite variations.
- **Difficulty:** M. **Tests:** H.

### F-MG-08 Shake: presets or custom saveable shakes
- **Impl:** AE: wiggle expressions or baked noise keyframes on position/rotation/scale + motion blur. PR: Transform
  effect keyframes (baked noise) on adjustment layer.
- **Our version:** shake from audio (impact on beat/SFX), decay envelope. **Difficulty:** S–M. **Tests:** H.

---

## 7. Visual effects and colour

### F-VFX-01 LUTs: 30 cinematic with previews, custom `.cube`
- **Impl:** our own LUTs (built from colour-science tools, not copied) applied with Lumetri (PR) / Apply Color LUT (AE).
  Previews: render current frame through LUT in Engine (ffmpeg `lut3d`) for live thumbnails.
- **Difficulty:** S–M. **Tests:** H + U preview pipeline.

### F-VFX-02 Built-in Glow (no extra plugin)
- **Impl v1:** effect-stack preset of native effects (blur + levels + blend) on duplicated layer / adjustment layer.
  **v2 (Phase 6):** own GPU effect via AE/Premiere C++ SDK (Metal/CUDA/OpenCL) for quality/perf.
- **Difficulty:** S (v1) / XL (v2). **Tests:** H visual + perf.

### F-VFX-03 Tracker: faces or objects → blur, attach text/images, or stabilise
- **Impl:** host trackers are not reliably scriptable. ENG tracking: face detection (ONNX, e.g. YuNet/BlazeFace) +
  object tracker (OpenCV CSRT/KCF or ByteTrack-style) on decoded frames → position/scale keyframes written to target
  layers; blur via mask path keyframes (AE) / Gaussian Blur + mask (PR, mask path scripting limited → use AE).
- **Our version:** multiple faces auto-blur (privacy), track review UI, smoothing.
- **Difficulty:** XL. **Tests:** U tracking accuracy on fixtures; H keyframe application.

### F-VFX-04 Camera shake / zoom / punch-ins → F-MG-08 + auto punch-in on emphasis words (Phase 4).

---

## 8. Formats and publishing

### F-FMT-01 Podcast: 1–4 speakers, auto-cut to active speaker, 9:16 / 1:1 / 4:5 / 16:9
- **App:** Premiere (page). **Impl:** per-mic VAD (or diarization on single mic) → active-speaker timeline → build
  multicam-like edit on a new sequence with min shot length, reaction-shot rules; per-aspect framing.
- **Our version:** wide-shot fallback on crosstalk, shot-length rules, works with PR multicam source sequences.
- **Difficulty:** L. **Tests:** H 2- and 3-speaker fixtures.

### F-FMT-02 Multiscreen: split one video into several screens
- **Impl:** PR: duplicate clips on tracks with Motion/Crop params; AE: precomps in grid. **Difficulty:** S–M.

### F-FMT-03 Reframe: new sequence in 9:16, 1:1, 4:5, 16:9
- **Impl:** new sequence with target frame size (ES `createNewSequence` + settings / UXP `createSetSettingsAction`);
  subject-aware positioning using ENG face/saliency tracking → Motion position keyframes. (Premiere's native Auto
  Reframe is not scriptable reliably → our own.)
- **Difficulty:** L. **Tests:** H.

### F-FMT-04 Safe Zone Guides (not rendered)
- **Impl:** PR: guides are not scriptable in all versions → panel overlay on our phone preview + optional disabled
  guide layer/adjustment clip that is excluded from render. AE: guide layer (`guideLayer = true`).
- **Difficulty:** S. **Tests:** H export confirms not rendered.

### F-FMT-05 Timestamps: chapter list with suggestions from speech
- **Impl:** transcript → topic segmentation (deterministic text-tiling first; optional cheap LLM for titles) →
  markers + YouTube chapter text export. **Difficulty:** M.

---

## 9. Workflow / productivity

| ID | Feature (original) | App | Impl | Our improvement | Diff. |
|---|---|---|---|---|---|
| F-PROD-01 | Quick Search ⌘K / Ctrl+K | both | panel command palette over tool registry | fuzzy + recent + actions with args | S |
| F-PROD-02 | Project Tidy: sort project into folders by type, with undo | PR (inferred) | ES/UXP bins, journal for undo | rule editor, naming conventions | S–M |
| F-PROD-03 | Quick Paste: screenshots, images, SVG or text from clipboard | both | Engine reads clipboard, saves file, imports at playhead | SVG → editable AE shapes | M |
| F-PROD-04 | Scene Detect: cut or add markers at shot changes | PR | ffmpeg `scdet` / PySceneDetect-style content detector in Engine → markers or rebuild | threshold preview, flash-frame filter | M |
| F-PROD-05 | Library: template folder shown as cards | both | Engine indexes user folders | tags, search, previews | S |
| F-PROD-06 | Frame Export: save playhead frame as image | PR (+AE) | PR-ES `exportFramePNG` via QE / AE `saveFrameToPng` | batch at markers, sizes | S |
| F-PROD-07 | 7 themes; TR/EN interface | both | design tokens, i18n | follows host brightness | S |
| F-PROD-08 | One-click updates keeping licence and settings | both | updater in Engine, signed packages | delta updates, rollback | M |
| F-PROD-09 | Auto Edit: cut and align clips to music beats (Main tab) | PR | F-AU-05 + rebuild sequence | patterns (every beat/2 beats/bar), energy-matching | M |
| F-PROD-10 | Licence: 1 computer | both | licence service (out of scope until Phase 6) | — | M |

**Not a software feature:** the 51-lesson After Effects course (training product). Out of scope; we can provide
in-panel help and tooltips instead.

---

## 10. Brief categories with **no public evidence** in UmutcanFX (our additions, brief §4)

These were listed in the brief's audit checklist but nothing in the public sources shows UmutcanFX offering them
(as of 2026-11-10). We implement them as our own advanced systems, not as "baseline":

| Brief item | Status in UmutcanFX evidence | Our system |
|---|---|---|
| Maps & geographic animation | not found | Motion Engine + AI Motion Generator (TD-008, Phase 5; map layer in Phase 4) |
| Infographics, data viz, animated diagrams | not found (only "callouts with counters") | Motion Engine chart/diagram generators |
| Document-style graphics (paper, highlight, redaction) | not found | Motion Engine document kit |
| Arrows & pointers, visual indicators | callouts only | callout/arrow family F-MG-06+ |
| 3D elements (beyond carousel) | 3D carousel only | 3D layer systems, camera rigs |
| Alignment, anchor point tools, composition utilities, layer management | not found | AE utility module (anchor to corners/center, align/distribute, precompose helpers, rename/sort) |
| Multi-cam beyond podcast | podcast auto-switch only | multicam assistant (Phase 4) |
| Audio sync (dual-system sound) | not found | waveform cross-correlation sync in Engine (Phase 3 bonus, low cost) |
| Custom transition builder | not found | F-TR-01 Transition Builder |
| Text on path, animated text masks | not found | Typography engine (Phase 4) |

If later evidence (videos, blog) shows any of these exist in UmutcanFX, move them into sections 1–9.

---

## 11. Coverage summary

- Baseline features identified: **53** (sections 1–9, counting sub-rows; AI-routed duplicates F-AI-05/07/08/09/11
  point to their real implementations).
- Highest technical risk (needs Phase 2 spikes): Premiere speed ramps (no time-remap API), Premiere razor/split
  (no UXP API; QE in ES), MOGRT parameter control in UXP, tracking, dialogue separation packaging, URL downloader
  legality.
- Lowest-cost, highest-value first candidates for Phase 3: Silence Cutter, local subtitles, loudness, beat markers,
  scene detect, AE layer/text animation recipes, AE speed ramps, LUTs, safe zones, frame export, quick search.
