# Changelog

All notable changes to the D1A playground are listed here, newest first.

- **Versions** follow [Semantic Versioning](https://semver.org); the version lives in `package.json`.
- **Releases** are cut by pushing a `vX.Y.Z` tag. CI then checks that the tag, `package.json` and this file agree,
  lints and builds the app, and publishes a GitHub release whose text is that version's section below.
- The playground runs against a D1A model server; each release names the D1A version and checkpoints it was tested
  with.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Three more live checks in the smoke test** (`scripts/openai_smoke.mjs`):
  - a tool call cut off by `max_tokens` must leave no Gemma markup in the text (d1a#278);
  - embeddings asked for in base64, as the openai Node SDK and n8n always do, must decode to the float vectors (d1a#282);
  - with `--decide`, a decision sent while a chat runs must still answer within `--wait-limit-ms` (30 s).

  CI shows each one fails a stand-in broken that way.
- **The smoke test checks the OpenAI port** (`scripts/openai_smoke.mjs`, jonpol01/d1a#274). With `OPENAI_PORT` set, it
  sends real requests through the port and judges the answers: chat, a stop string, streaming, a tool call, JSON mode and
  embeddings. It also checks that the System One and feedback routes are closed there, and that a decision is identical
  before and after the chats. `EMBED_REF` adds a match against reference embeddings (cosine at least 0.999). CI checks
  that it fails each kind of broken server. `openai_port.mjs` and `openai_smoke.mjs` also run when started through a
  symlink (macOS `/tmp`), where they used to exit 0 without running.
- **D1A on LM Studio's port.** `OPENAI_PORT=1234` (with `OPENAI_HOST`, `::` by default: IPv4 and IPv6) adds the LaunchAgent
  `io.github.jonpol01.d1a-openai` (`scripts/openai_port.mjs`), which serves only the model server's OpenAI chat,
  embeddings and model list on the LAN, with no key, so apps that used LM Studio there reach D1A unchanged
  (jonpol01/d1a#274). `EMBED_GGUF` gives the model server its embedding model. Both are off unless set.
- **The routing demo names its use case.** Its requests, in the UI and in the demo smoke test, send
  `"use_case": "routing"` (D1A jonpol01/d1a#214). A D1A model with a routing temperature (`use_case_temperatures` in
  `/v1/models`) answers them at that temperature, and the choice never moves. A model without one, or a D1A server older
  than #214, answers exactly as before. Every other demo sends no use case.
- **Pull-request checks:** a `verified commits` workflow (every commit signed; no AI attribution in the commits or the
  pull request body), and in the `scripts` job: `mini.sh`, `demo.sh` and `demo.ps1` must pin the same D1A commit, and no
  added line may hold a local machine path (`scripts/check_hygiene.py`, the same patterns as d1a's `d1a/core/hygiene.py`).

### Changed

- **D1A pinned to `9b7bd8b6`** (d1a#281, d1a#283):
  - `/v1/models` lists `d1a-chat` while an idle server has unloaded the model, so n8n's model dropdown finds it;
  - `/v1/embeddings` honours `encoding_format: "base64"`. The openai Node SDK (n8n) always asks for it, and used to
    decode D1A's float lists into 192 numbers instead of 768.

  `demo.sh` and `demo.ps1` move with it.
- **D1A pinned to `b4b36f41`** (d1a#279): an OpenAI chat answer cut off by `max_tokens` inside a tool call no longer
  returns the half-written Gemma 4 markup as text; it keeps the text before it, with `finish_reason` `"length"`.
  `demo.sh` and `demo.ps1` move with it.
- **D1A pinned to `24e0c3d4`** (d1a#277): the GGUF embedder runs on the GPU, so its vectors are LM Studio's for the same
  file (cosine 1.00000, from about 0.99 on the CPU). `demo.sh` and `demo.ps1` move with it.
- **The serving Mac serves D1A-E2B-it v0.6, one model for decisions and OpenAI chat** (jonpol01/d1a#274): an unmerged 8-bit
  build of `JohnP1/d1a-e2b-it@v0.6` with the media encoders, built locally (not published), with `OPENAI_PORT=1234` and
  `EMBED_GGUF` (nomic-embed-text-v1.5). LM Studio is off. mem0, n8n and the Hermes fallbacks reach D1A on port 1234. the maintainer
  accepted the PR labeler's regression from E4B v0.6.1 (severity 72.9% vs 79.1% on 487 newer PRs, P0/P1 found 3 of 30 vs
  13 of 30). Rollback: restore `.demo/mini.env.before-274` (`MODEL_RUN=JohnP1/d1a-e4b-mlx-q8@v0.6.1`, no `OPENAI_PORT`)
  and reinstall.
  - The demo baseline is re-recorded on the serving Mac with E2B-it: 145/145 PASS against it, max probability change 0.0000.
    Against the E4B v0.6.1 baseline, 26 entries changed (8 are evals score values). Worse: the photo demo's place is
    "on a sidewalk" for the front-door and mailbox photos, the crushed-truck photo and video are no longer "damaged", and
    two voice clips are now urgent. Also changed: the routing summary goes "small", the ambiguous gate case is "replace"
    instead of "deny", inbox emails 7 and 8, one Japanese bulk row, the Control demo's no-hint robot 3, and the PR
    labeler's blast radius on two examples.
- **D1A pinned to `eb0b99b4`** (d1a main, with d1a#275 and d1a#276): the model server answers OpenAI chat with an
  unmerged chat build (the adapter off for chat, on for decisions) and serves embeddings from a GGUF model. `demo.sh` and `demo.ps1` move with it.
- **D1A pinned to `5f771e17`** (d1a 0.5.0, plus d1a#248 and d1a#251): `feedback void` withdraws one source's outcomes with a reason
  without rewriting the log, and `outcomes.sources` can name sources per question. After this deploy, the 40 PR-author
  "human" outcomes are voided, and the review bot's severity becomes monitoring-only
  (`{"sev": ["human"], "*": ["reviewer", "human"]}`, jonpol01/d1a#252). The served model stays D1A-E4B v0.6.

### Fixed

- **`mini.sh start` survives launchd's "Bootstrap failed: 5".** Right after a `stop`, launchd refused to load an agent
  again while its bootout was still finishing. Under `set -e` the start ended there and every agent stayed down: on the
  serving Mac on 2026-10-15, after an evaluation window, the restart failed until it was run again by hand five minutes
  later. `start` now tries each agent up to six times, five seconds apart, and fails loudly if launchd never accepts.
- **No more 500s while the model server starts** (jonpol01/d1a#42). `mini.sh` now starts the model server first and
  waits, for up to 2 minutes, until it answers `/v1/models` before starting the web app. Until then the web app (ready
  in about 50 ms) proxied the page's first models poll to a closed port and returned a 500 (`ECONNREFUSED`): once per
  restart on the serving Mac, 13 of 21 restarts since 2026-10-03.
- **A PR's author labelling it while opening it is no longer a "human" outcome.** Agent sessions open most PRs on the maintainer's
  repositories under his account and label them in the same minute (`gh pr create --label`, or `gh pr edit` just after),
  so `scripts/pr_outcomes.py` read those labels as a person correcting D1A, ranked above the review bot: 40 such outcomes
  sit in the live log (1 on 10-05, 39 from one early run on 10-06), and no person has corrected D1A yet. The author's
  label events until 10 minutes after the first labeler call (`AUTHOR_LEAD`) no longer count; the author changing a label
  later, and any other person at any time, still do. The PR's or issue's author is read with one more API call per poll.
  The 40 records already logged are voided in D1A (d1a `feedback void`).
- **How often D1A's labels are changed** counted only decisions followed by a later labeler call on the same PR, so it
  missed every PR's last call: about two thirds of the review bot's grades (on the serving Mac, 44 of 154 type grades and 0 of 15
  severity grades were shown). A review bot grade now counts as soon as it is posted; a person's change counts once the
  decision is closed (the next call came over a day ago, or the PR's last call is older than `--days`, when the script
  stops checking it). `summary()` has a test for a PR with one call, red before this fix.

### Changed

- **The Learning page says what to expect from the gate.** At today's outcome volume it can only detect a gain about ten
  times larger than recalibration usually brings (around 0.02 in log loss, measured offline on 437 fresh PRs), so "nothing
  promoted" is the expected result until the next model; between models the loop works as drift monitoring. The Fable
  adviser's assessment, 2026-10-11.
- **D1A pinned to `2007cb17`**: the learned-flags serving (d1a#242, no flag configured), the 0.3 module-path shims removed and
  new runs saved without head.pt (d1a#243), and the fix for the Metal abort on overlapping media requests (d1a#245).
- **Severity gets a reviewer outcome.** Since 2026-10-11 04:49 JST the review bot decides P0-P4 in the same review
  pass as type and blast radius (no extra model call) and swaps the P-label when it disagrees. `scripts/pr_outcomes.py`
  reads it as the reviewer's grade of D1A's severity for reviews from that time only (`SEV_REVIEWED_SINCE`), so a P that
  merely stood through an older review is never taken as the reviewer's answer.
- **D1A pinned to `71d1bb81`** (d1a 0.4.0 + d1a#240, self-learning v2: the settings file, replay across versions, the
  data-triggered gate, `--show-config`); the served model stays D1A-E4B v0.6.

### Added

- **How often D1A's labels are changed** (the Learning page): per label family, over the PR labeler's decisions whose
  window has closed, how many the review bot graded and changed and how many a person changed. `scripts/pr_outcomes.py`
  writes it to `.demo/feedback/outcomes-summary.json` each run; nothing new is posted to D1A. Shown with the counts,
  since nobody changing a label is not proof it was right (the Fable adviser's monitor, d1a-playground#45).
- **The Learning page** (`/learning`, d1a#233): the self-learning settings with an edit form (validated by D1A; a value
  out of range is refused), each question's outcomes and how many it still needs, the last runs of the loop with the
  smallest log-loss gain each gate could detect, and every settings change.
- **The self-learning tick replaces the 04:00 promote.** Every 15 minutes `io.github.jonpol01.d1a-promote` runs
  `d1a.learning.feedback tick`. It reads `.demo/learning.json` (created once by `install`), replays earlier models'
  outcomes after a model switch, and runs the gate after 10 new outcomes or daily at 04:00.
  - Replays are invisible to `scripts/pr_outcomes.py` (a replay of an issue call is never a call) and to `/review`.
  - `outcomes.enabled` false stops the outcome poster.
- **`mini.sh` install, reinstall and update run D1A's disk and RAM preflight first**, when the serving Mac has it
  (`~/d1a-guard/preflight.sh`; elsewhere the line is skipped). It refuses unless free disk covers the ~2 GB install plus
  5 GB headroom and the RAM headroom holds, so an update can't fill the disk. It warns below the serving Mac's 10 GB target. On
  2026-10-10 both machines' disks filled. The serving Mac also runs a disk guard LaunchAgent: it pauses D1A's own jobs below 6 GB
  free or on fast swap growth and stops them below 3 GB, and never touches the live server on :8009, the bots, Docker or
  LM Studio.

### Changed

- **The serving Mac serves D1A-E4B v0.6** (`MODEL_RUN=JohnP1/d1a-e4b-mlx-q8@v0.6`; D1A pinned to `2a90e61f` in
  `mini.sh`, `demo.sh` and `demo.ps1`; jonpol01/d1a#230: `/v1/models` lists only `d1a-latest`). v0.6 is an
  explicit exception to D1A's veto, chosen for the serving Mac's live job of labelling current pull requests: on 487 PRs newer than
  all its training it labels severity 79.1% (v0.5: 74.7%) and type 90.6% (86.7%) (jonpol01/d1a#198, #225). Rollback:
  `MODEL_RUN=JohnP1/d1a-e4b-mlx-q8@v0.5`.
  - The demo baseline is re-recorded on the serving Mac: 145/145 PASS against it. Against the v0.5 baseline, 16 entries
    changed (several are score values only). The gate on this Mac listed 11 changed answers, and the serving Mac's M4 adds three
    borderline ones: the Control demo's "robot 3, target 10, no hint" now moves right (correct), Japanese rerank passage 5
    is now "not relevant", and the English evals "Good answer" now carries error = true (worse). Of the 11: Six look better: the evals demo ×4, the
    crushed-truck video now "damaged", and one English bulk row. Three are borderline: Japanese "as described", the CI
    PR's blast radius now "broad", and the Japanese Dependabot email now "later". Two are worse and known: the HR
    training-reminder email (English and Japanese) is now triaged "archive".
- **Only `d1a-latest`.** The demos send `d1a-latest` (was `kev-latest`), and the LM Studio bridge lists only `d1a-latest`
  on `/v1/models`. `src/lib/kev.ts` is now `src/lib/d1a.ts`.

### Security

- Next.js 16.3.6, which fixes a remote code execution in `next/og` ImageResponse (GHSA-vcvr-r3jv-pc5j). The
  playground does not render OG images, but every install now gets the fixed version.

### Added

- **Issue-label outcomes.** The CTO bot's labeler also labels issues (type and severity); `scripts/pr_outcomes.py` now
  collects those decisions' outcomes too. They are not in the labeler's mirror, so they are read from the model server's
  decision log (`--log`, which `mini.sh` sets to `FEEDBACK_LOG`) by their state's `kind: github-issue`, and matched to
  the one issue with that exact title and author in the labeled repositories' owners (one GitHub search per owner per
  run). Issues get no review, so their outcome is a person's type or severity labels between the call and the next one
  on the same issue, posted as `src` human with group `<repo>#<number>`. On the serving Mac's log (2026-10-09) 120 of 121
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
  the full test after a deploy and stop on a failure. Baseline recorded on the serving Mac (D1A `a84bd8c`,
  `d1a-e4b-mlx-q8@v0.4`): 145/145, in 77 s.
- The serving Mac runs D1A's promotion gate daily: with `LABEL_OUTCOMES=1` and `OUTCOME_CALIBRATOR` set, `mini.sh` adds the
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
  writing a decision; older servers ignore it, so on the serving Mac it takes effect when the D1A pin moves to the server
  change (jonpol01/d1a#221). On the serving Mac's log (2026-10-09) 1,879 of 2,290 decisions were demo
  and smoke traffic (726 of v0.5's 855), each one pending forever: `d1a.learning.feedback status` reported 2,181 pending
  decisions, 302 without them (v0.5: 818, 92). A local server on the tiny test checkpoint logged 131 decisions for one
  `--no-media` smoke run before the change and 0 after.
- **The outcome collector polls GitHub less.** Each run re-read every pull request of the last 14 days until a person
  relabelled it, which most never are: 67 reads per run on the serving Mac. A decision is now checked every run in its first
  day, hourly until its third, then every 6 hours, staggered per pull request, and a window that closed more than a day
  ago is not polled for a person's labels any more: 14 reads per run on average (5 to 23), plus about 20 for issues.
- **The D1A model server pin moves to jonpol01/d1a@140a3dea** (from `ff212c06`, jonpol01/d1a#186). The daily promote job
  now fits the outcome calibrator only on the decisions the served model made: `mini.sh` passes
  `--run "$MODEL_RUN"`, so after a model switch v0.5 is never corrected by v0.4's errors. A calibrator file moved aside
  now stops applying from the next answer. Checked with D1A's `scripts/quality_gate.py` on real weights
  (`--base ff212c06 --head 140a3dea`, `d1a-e4b-mlx-q8@v0.4`): every demo example and the labeler replay, 237 requests,
  0 changed answers, max |dp| 0, latency 1.004 against a 0.996 floor. `scripts/test_mini_update.sh` checks that the
  promote agent passes `--run MODEL_RUN`.
- **The serving Mac serves D1A-E4B v0.5** (`JohnP1/d1a-e4b-mlx-q8@v0.5`, jonpol01/d1a#175), set as `MODEL_RUN` in
  `.demo/mini.env`.
  - v0.5 against v0.4 on held-out data, MLX 8-bit:
    - better: hard decisions 55% → 71%, developer tools 64% → 70%, transfer +2.7, JGLUE +1.1, routing +1.5, decision
      +0.6, documents +0.9, PR change type +2.0;
    - worse: PR severity −2.2, and blast radius on the owner's repositories 87% → 74% (39 hand-checked PRs).
  - The full scorecard is on jonpol01/d1a#175.
  - `scripts/demo-baseline.json` is recorded on v0.5 on the serving Mac itself (M4, MLX 0.32.3), 145 requests, reproduced
    exactly there. 17 of 201 answers change from v0.4:
    - evals: quality scores move a little, and the wrong and partly correct answers are now flagged as errors;
    - the crushed-truck photo is now "damaged";
    - one each for inbox email 7, a rerank passage, a bulk row and the Japanese summary's route;
    - the CI-change PR's blast radius changes too.
    A first recording on an M1 Max (MLX 0.32.2) differed from the serving Mac's by up to 0.045 in probability, flipping three
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
  agent before installing anything. On 2026-10-07 the serving Mac's uv cache, owned by root, failed the install, and the
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
