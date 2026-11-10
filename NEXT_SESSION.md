# NEXT_SESSION.md — read this first

You are continuing the Ultimate Editor Toolkit (Adobe Premiere Pro + After Effects plugin ecosystem).
Talk to İso in **Turkish**, briefly. Write repo docs in English.

1. Read, in order: PROJECT_MASTER.md → PROJECT_STATUS.md → this file → ARCHITECTURE.md → TODO.md.
   Open FEATURE_INVENTORY.md / TECHNICAL_DECISIONS.md only for the item you work on.
2. Check PROJECT_STATUS.md "Blockers". **If İso has not approved Phase 0–1, do not start implementation.**
   Ask for approval in one short message. (TD-012 downloader: cancelled by İso.)
3. If approved: start Phase 2 spikes in this order: S4 Engine → S1 AE → S2 Premiere CEP → S3 Premiere UXP → S5 MCP
   (MASTER_ROADMAP.md). Each spike: smallest working code, a written H-test checklist for İso, results in
   TEST_REPORT.md. Use the local Premiere MCP bridge on İso's Mac for Premiere checks when Premiere is open
   (ask İso to open Premiere; don't launch apps without asking).
4. Do not redo research recorded in TECHNICAL_DECISIONS.md; re-check Adobe API status only for the specific API a
   spike needs.
5. After any meaningful change: update PROJECT_STATUS, TODO, CHANGELOG (+ TEST_REPORT/COMPLETED when tests ran).

Known facts: Premiere 26.5.2 on İso's MacBook Air (Apple Silicon); AE version unknown. Prototype (Creative Universe)
is browser-only; no code to reuse (EXISTING_PROJECT_AUDIT.md).
