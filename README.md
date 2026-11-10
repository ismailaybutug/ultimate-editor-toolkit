# Ultimate Editor Toolkit

Professional plugin ecosystem for Adobe Premiere Pro and After Effects. Status: Phase 2 (core foundation).
Start with [NEXT_SESSION.md](NEXT_SESSION.md) and [PROJECT_MASTER.md](PROJECT_MASTER.md).

```
pnpm install
pnpm check          # typecheck + ES3 check + tests + build
pnpm build          # -> dist/com.uet.toolkit (CEP extension) and dist/engine.mjs
bash tools/install-mac.sh   # (run next to a built com.uet.toolkit folder) installs the dev panel on macOS
```
Nothing is verified in the Adobe apps until TEST_REPORT.md records it.
