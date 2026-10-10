# Changelog

All notable changes to the D1A playground are listed here, newest first.

- **Versions** follow [Semantic Versioning](https://semver.org); the version lives in `package.json`.
- **Releases** are cut by pushing a `vX.Y.Z` tag. CI then checks that the tag, `package.json` and this file agree,
  lints and builds the app, and publishes a GitHub release whose text is that version's section below.
- The playground runs against a D1A model server; each release names the D1A version and checkpoints it was tested
  with.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- Next.js 16.3.6, which fixes a remote code execution in `next/og` ImageResponse (GHSA-vcvr-r3jv-pc5j). The
  playground does not render OG images, but every install now gets the fixed version.

### Added

- **Issue-label outcomes.** The CTO bot's labeler also labels issues (type and severity); `scripts/pr_outcomes.py` now
  collects those decisions' outcomes too. They are not in the labeler's mirror, so they are read from the model server's
  decision log (`--log`, which `mini.sh` sets to `FEEDBACK_LOG`) by their state's `kind: github-issue`, and matched to
  the one issue with that exact title and author in the labeled repositories' owners (one GitHub search per owner per
  run). Issues get no review, so their outcome is a person's type or severity labels between the call and the next one
  on the same issue, posted as `src` human with group `<repo>#<number>`. On the Mac mini's log (2026-10-09) 120 of 121
  labelled issues match; one of the 301 issue decisions has a person's labels in its window so far.
- **PR label check** (`/review`, #29). It is the human check of the PR labeler's labels, to measure how noisy the review
  bot's labels are; the outcome calibrator and outcome memory learn from them.
  - **What it shows:** 50 pull requests with a review-bot outcome, stratified half disagree, half agree. For each, D1A's
    and the reviewer's labels for type and blast radius, and D1A's severity.
  - **Answers:** the person's pick goes to the model server's `POST /v1/feedback` as `src` human with the PR's group.
    "unsure" leaves the reviewer's label standing.
  - **Where it runs:** on with `LABEL_OUTCOMES=1` (`mini.sh` passes the decision log as `REVIEW_FEEDBACK_LOG`); off
    (404) otherwise.
  - **Checks:** `node --test scripts/test_review.mjs` in CI (sampling, stratification, a checked decision kept across
    new heads, which posts are forwarded). The demo smoke test now also checks the page and its route, read only.
- **Demo smoke test** (`scripts/demo_smoke.mjs`, #26). Every demo's built-in examples (145 requests: the 9 text demos
  in English and Japanese, the PR labeler, fixed Control states, 6 photos, 4 voice clips and 4 videos) are sent through
  the web app and checked against `scripts/demo-baseline.json`. Each must answer, with every question answered, and give
  the baseline's choice. The requests come from the demos' own questions, presets and state builders
  (`src/components/uses/smoke.ts`), so the test follows the UI. Checks: CI's `--list` (no server) fails when an example
  is added or removed without re-recording the baseline. `mini.sh install|reinstall|update` and `./mini.sh smoke` run
  the full test after a deploy and stop on a failure. Baseline recorded on the Mac mini (D1A `a84bd8c`,
  `d1a-e4b-mlx-q8@v0.4`): 145/145, in 77 s.
- The Mini runs D1A's promotion gate daily: with `LABEL_OUTCOMES=1` and `OUTCOME_CALIBRATOR` set, `mini.sh` adds the
  `io.github.jonpol01.d1a-promote` LaunchAgent (04:00, `python -m d1a.feedback promote`), and removes it when either is off.
- Demo 13, **Video check**: the Photo check questions (is the parcel damaged, where was it left) about a short clip, with
  four sample clips and an upload (MP4, MOV, WebM up to 24 MB). The model reads 16 timestamped frames through Gemma 4's
  vision encoder (jonpol01/d1a#100); the sound is not used. Zero-shot, like the photos: right about the scene as a whole,
  not yet about the order of events. Needs a D1A model server with video support.

- Demo 12, **PR labeler**: pick an example, paste a pull request or load a public one from GitHub; D1A answers the three
  questions the CTO bot's labeling job asks on every open PR (change type, blast radius, severity P0–P4), built from the
  same document, and the page applies the job's rules: `review:needs-human` below p 0.7, and a committed `.env` forces
  `type/security` and at least P1.
- `scripts/pr_outcomes.py`, and `LABEL_OUTCOMES=1` in `mini.sh` to run it every 15 minutes. It turns the CTO bot's
  PR-labeling decisions into outcomes for D1A to learn from: the review bot's own type and blast-radius labels on the
  head it reviewed, and any label a person changes. Over the 142 labeling calls since 2026-10-02, the review bot kept
  D1A's type on 80 of 99 decisions and its blast radius on 71 of 102, and usually called the blast radius wider.
- `scripts/pr_outcomes.py` sends `group` `<repo>#<number>` with every outcome, the unit `d1a.feedback promote` bootstraps over.
- D1A pinned at jonpol01/d1a@a84bd8c2 (#151: `d1a.feedback promote`, `group` on `POST /v1/feedback`) in `mini.sh`, `demo.sh`
  and `demo.ps1`.
- The D1A model server pin moves to D1A 0.3.0 (`9c93afb`), which can learn from outcomes, and then to `9d6b9e8`
  (jonpol01/d1a#145): choice questions are recalibrated too, and `/v1/feedback` keeps each outcome's source. `mini.sh` passes two new
  settings to it, both off unless set in `.demo/mini.env`: `FEEDBACK_LOG` (log every decision and accept outcomes at
  `POST /v1/feedback`) and `OUTCOME_CALIBRATOR` (apply a calibrator fitted on those outcomes).
- The D1A model server pin moves to a commit whose state pass skips Gemma 4's KV-shared layers: long pull requests
  (Demo 12, the labeling job) answer about 30% faster on a Mac, with identical answers (jonpol01/d1a#104).
- **One model, loaded only while in use.** Photo check and Voice triage on a Mac are answered by the model server
  itself, with the same model, through Gemma 4's vision and audio encoders (~1 GB more while loaded) instead of a
  second bf16 Gemma 4 (~10 GB). `./demo.sh --media` starts no second server on Apple Silicon; `mini.sh` drops the
  `d1a-media` LaunchAgent, sends `/media` to the model server, and frees the model after `IDLE_UNLOAD` seconds without a
  request (600; it loads again in a few seconds). On PyTorch machines the demos still use `d1a.media`.
- The "waking up" note says a few seconds instead of about 30.

### Changed

- **Demo and smoke-test requests stay out of the learning log.** The demos (`src/lib/kev.ts`) and
  `scripts/demo_smoke.mjs` send `x-d1a-decision-log: off`, which a D1A model server that honours it answers without
  writing a decision; older servers ignore it, so on the Mac mini it takes effect when the D1A pin moves to the server
  change (jonpol01/d1a#221). On the Mac mini's log (2026-10-09) 1,879 of 2,290 decisions were demo
  and smoke traffic (726 of v0.5's 855), each one pending forever: `d1a.learning.feedback status` reported 2,181 pending
  decisions, 302 without them (v0.5: 818, 92). A local server on the tiny test checkpoint logged 131 decisions for one
  `--no-media` smoke run before the change and 0 after.
- **The outcome collector polls GitHub less.** Each run re-read every pull request of the last 14 days until a person
  relabelled it, which most never are: 67 reads per run on the Mac mini. A decision is now checked every run in its first
  day, hourly until its third, then every 6 hours, staggered per pull request, and a window that closed more than a day
  ago is not polled for a person's labels any more: 14 reads per run on average (5 to 23), plus about 20 for issues.
- **The D1A model server pin moves to jonpol01/d1a@140a3dea** (from `ff212c06`, jonpol01/d1a#186). The daily promote job
  now fits the outcome calibrator only on the decisions the served model made: `mini.sh` passes
  `--run "$MODEL_RUN"`, so after a model switch v0.5 is never corrected by v0.4's errors. A calibrator file moved aside
  now stops applying from the next answer. Checked with D1A's `scripts/quality_gate.py` on real weights
  (`--base ff212c06 --head 140a3dea`, `d1a-e4b-mlx-q8@v0.4`): every demo example and the labeler replay, 237 requests,
  0 changed answers, max |dp| 0, latency 1.004 against a 0.996 floor. `scripts/test_mini_update.sh` checks that the
  promote agent passes `--run MODEL_RUN`.
- **The Mac mini serves D1A-E4B v0.5** (`JohnP1/d1a-e4b-mlx-q8@v0.5`, jonpol01/d1a#175), set as `MODEL_RUN` in
  `.demo/mini.env`.
  - v0.5 against v0.4 on held-out data, MLX 8-bit:
    - better: hard decisions 55% → 71%, developer tools 64% → 70%, transfer +2.7, JGLUE +1.1, routing +1.5, decision
      +0.6, documents +0.9, PR change type +2.0;
    - worse: PR severity −2.2, and blast radius on the owner's repositories 87% → 74% (39 hand-checked PRs).
  - The full scorecard is on jonpol01/d1a#175.
  - `scripts/demo-baseline.json` is recorded on v0.5 on the Mac mini itself (M4, MLX 0.32.3), 145 requests, reproduced
    exactly there. 17 of 201 answers change from v0.4:
    - evals: quality scores move a little, and the wrong and partly correct answers are now flagged as errors;
    - the crushed-truck photo is now "damaged";
    - one each for inbox email 7, a rerank passage, a bulk row and the Japanese summary's route;
    - the CI-change PR's blast radius changes too.
    A first recording on an M1 Max (MLX 0.32.2) differed from the Mini's by up to 0.045 in probability, flipping three
    answers near a boundary: MLX rounds 8-bit matrix products differently per chip, so a baseline is recorded on the
    machine that serves it.
  - Rollback:
    1. Set `MODEL_RUN=JohnP1/d1a-e4b-mlx-q8@v0.4` in `.demo/mini.env`.
    2. `git revert` this change, which restores the v0.4 baseline.
    3. Run `./mini.sh reinstall`. No outcome calibrator has been promoted, so there is no file to restore.

- The D1A model server pin moves to jonpol01/d1a@ff212c06 (from `a84bd8c`): D1A's package layout (#60), so the
  launchers start `d1a.serving.serve`, `d1a.serving.media` and `d1a.learning.feedback`; plus the skills-training recipe and
  checkpoint tools. Checked with D1A's `scripts/quality_gate.py` on real weights (`d1a-e4b-mlx-q8@v0.4`): every demo
  example and the labeler replay, 237 requests, 0 changed answers, max |dp| 0, latency 0.996 against a 1.002 floor.

### Fixed

- **A failed `mini.sh update` no longer leaves the Mac down.** Before, `reinstall` (which `update` runs) stopped every
  agent before installing anything. On 2026-10-07 the Mac mini's uv cache, owned by root, failed the install, and the
  model server, the PR labeler and the demos stayed down until they were restarted by hand.
  - `reinstall` now installs the model server and writes the LaunchAgents while the old version still serves, and stops
    the agents only after both succeed.
  - If the web build or the start fails after the stop, the agents start again on whatever is installed.
  - `scripts/test_mini_update.sh` (CI's mini-macos job, under bash 3.2) forces each failure and checks that the services
    stay up or come back up.
- **`mini.sh` keeps uv's cache in `.demo/uv-cache`** unless `UV_CACHE_DIR` names another. A global `~/.cache/uv` that a
  `sudo` run left owned by root can no longer fail an install (#33). `scripts/test_mini_update.sh` checks that uv sees the
  path, with and without the override.

## [0.2.0] - 2026-10-02

Eleven demos instead of nine: D1A now also answers questions about a photo or a voice note. The playground runs as an
always-on service on a Mac, with the model as a setting.

### What's new

- **Photo check.** Pick a delivery photo or upload your own: D1A says whether the parcel is damaged and where it was
  left.
- **Voice triage.** Pick a driver's voice note, record one or upload a clip, in English or Japanese: D1A says what the
  driver needs and whether it is urgent, with no speech-to-text step.
- **One command runs D1A.** `./demo.sh` (or `.\demo.ps1`) installs the D1A server and, with `--media`, the photo and
  voice server too, so a friend's machine runs all eleven demos; a Mac gets the 4 GB MLX build instead of a 10 GB
  download.
- **Always on, on a Mac.** `mini.sh` runs the model server and the web app as LaunchAgents that start at login, serves
  D1A on MLX, and can run E4B or the photo and voice server (`MODEL_RUN`, `MEDIA=1`).
- **A README that shows it.** A GIF of every demo in English and Japanese, and animated diagrams of how D1A works.

### Added

- Photo check and Voice triage demos, with six sample photos and four EN/JA voice clips; images are scaled and audio
  converted to 16 kHz mono in the browser before upload; `/media/*` is forwarded to `d1a.media` (`MEDIA_API`)
  ([#7](https://github.com/jonpol01/d1a-playground/pull/7)).
- A note that the photo and voice model is waking up when the first request takes longer, and a 120 s proxy timeout
  for that first request ([#9](https://github.com/jonpol01/d1a-playground/pull/9)).
- `mini.sh`: an always-on install on a Mac (model server and web app as LaunchAgents) serving D1A on MLX
  ([#2](https://github.com/jonpol01/d1a-playground/pull/2), [#3](https://github.com/jonpol01/d1a-playground/pull/3));
  the model as a setting, `MODEL_RUN` ([#5](https://github.com/jonpol01/d1a-playground/pull/5)); `MEDIA=1` adds the
  photo and voice server as a third LaunchAgent ([#8](https://github.com/jonpol01/d1a-playground/pull/8)).
- README: a GIF of each demo in English and Japanese ([#1](https://github.com/jonpol01/d1a-playground/pull/1),
  [#7](https://github.com/jonpol01/d1a-playground/pull/7)) and the architecture diagrams from D1A
  ([#7](https://github.com/jonpol01/d1a-playground/pull/7)).
- `demo.sh` / `demo.ps1 --media`: also start the photo and voice server; `MODEL_RUN` picks the checkpoint
  ([#12](https://github.com/jonpol01/d1a-playground/pull/12)).
- CI: lint, type check, production builds at `/` and under `/d1a`, script syntax checks (`demo.ps1` included), and
  this release workflow ([#10](https://github.com/jonpol01/d1a-playground/pull/10),
  [#11](https://github.com/jonpol01/d1a-playground/pull/11), [#12](https://github.com/jonpol01/d1a-playground/pull/12)).

### Changed

- `demo.sh` and `demo.ps1` install and run the D1A model server (`d1a.serve`) instead of the Kev fork's, with the 8-bit
  MLX build on Apple Silicon and the PyTorch checkpoint elsewhere ([#12](https://github.com/jonpol01/d1a-playground/pull/12)).
- `mini.sh` and the demo scripts pin the D1A model server they are tested against (d1a `d659835`, which reads Gemma 4's
  per-layer embeddings from disk: about 1.5 GB less memory for E4B); this release was tested with D1A 0.2.0 and
  `JohnP1/d1a-e4b-mlx-q8@v0.2-hybrid` (text) and `JohnP1/d1a-e2b@v0.2.1-2epoch-calibrated` (photo and voice)
  ([#4](https://github.com/jonpol01/d1a-playground/pull/4), [#6](https://github.com/jonpol01/d1a-playground/pull/6),
  [#9](https://github.com/jonpol01/d1a-playground/pull/9)).
- `mini.sh update` continues in the freshly pulled script instead of the old one
  ([#3](https://github.com/jonpol01/d1a-playground/pull/3)).

## 0.1.0 - 2026-09-30

Not released. The first playground: nine live use cases (model routing, guardrails, tool-call gating, inbox triage,
reranking, LLM evals, bulk labeling, real-time control, confidence gate), a Japanese and English UI, a hardware monitor,
an architecture page, LM Studio mode, and `demo.sh` / `demo.ps1` to start everything with one command.

[Unreleased]: https://github.com/jonpol01/d1a-playground/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jonpol01/d1a-playground/releases/tag/v0.2.0
