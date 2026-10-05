<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# D1A playground: quality bar (mandatory)

Every change is checked by the test suites, with the numbers in the PR. Nothing downgrades and no feature is removed silently:
- `npm run lint`, the type check and both builds pass (CI).
- `node scripts/demo_smoke.mjs <web app URL>` passes: every demo's built-in examples answer through the web app with the
  choices in `scripts/demo-baseline.json`. `mini.sh update` runs it after every deploy. A change of answers is recorded
  on purpose (`--record`) in the same PR, with the reason and the numbers.
- A demo, example, endpoint or setting is never dropped silently: the smoke test fails on a removed example. Remove it
  in the same PR that re-records the baseline, and say why.
- A new demo or example ships with its smoke requests (`src/components/uses/smoke.ts`) and an updated baseline.
- A D1A pin move also replays the PR labeler's states (`d1a/runs/labeler-replay`): identical answers, and interleaved latency within noise.
