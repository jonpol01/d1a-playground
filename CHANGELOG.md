# Changelog

All notable changes to the D1A playground are listed here, newest first.

- **Versions** follow [Semantic Versioning](https://semver.org); the version lives in `package.json`.
- **Releases** are cut by pushing a `vX.Y.Z` tag. CI then checks that the tag, `package.json` and this file agree,
  lints and builds the app, and publishes a GitHub release whose text is that version's section below.
- The playground runs against a D1A model server; each release names the D1A version and checkpoints it was tested
  with.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- The media demos' loading note says a cold load takes up to about 3 minutes on a GPU server (it said 2): a cold photo
  request there took 189 s once its weights had left the page cache.
- **The routing demo shows D1A's decision only.** The result is the tier D1A routes on (its fail-up rule on the three
  probabilities, with the threshold from the model server's card), the diagram and cost for that tier, and the answer:
  "D1A sent this to <model>" or "D1A answered this itself". The most likely tier on its own, the probability bars, the
  pick-vs-route line and the labelled-example box are gone from the default view; the probabilities and the rule are
  under "Why?". The Summary example no longer reads as a miss: D1A routes it to medium.
- **Model chips on the routing demo**: small · D1A, medium and large · the large route's model, each ready, busy (with
  slots in use and chats waiting) or offline, from D1A's card (`GET /api/models-status`: an allow-list of the card's
  fields, cached 5 s, never a chat). `LARGE_OFFLINE_WINDOW` (mini.env) names the nightly window in which "offline" says
  when the model is back.
- **D1A pinned to `6d303303`** (d1a#439): with chat routes on, a hard chat over the large route's `max_in_flight` waits
  for a free slot (up to 30 s, as many waiting as `max_in_flight`) instead of being answered by D1A at once; the notes
  say what happened (at capacity, did not answer in time, starting up), and an agent's chat gets a retryable 503 while
  the large model starts. Without routes nothing changes: the quality gate on the D1A-E4B-it QAT build answered bit for
  bit the same on every demo (photos, voice and video included) and on the labeler replay, 0 flips, max |dp| 0, 271
  requests; all-text latency 1.0008 against a base/base floor of 1.0050. No dependency changes.
- The media demos wait out a cold model load: the proxy timeout for the model and media routes is 240 s (was 120 s),
  and the note shown while waiting says a load takes up to about 2 minutes on a GPU server (it said 30 s). A cold load
  there took about 95 s, and the first photo after an idle spell failed at the proxy.
- **The routing demo has one button, Ask** (JA 送信), in place of Pick and Send it (#152). A second button read as if
  a person had to press it before a prompt was forwarded; in use it is one chat call that decides, forwards and answers.
  - One click sends the pick request and, where `ROUTE_DEMO=1`, the chat call together; the pick shows while the chat
    runs, which says only "D1A is deciding…".
  - The headline is the route from the reply: D1A answered it itself, D1A forwarded it to the large model, or the
    fallback. The pick sits underneath as D1A's reasoning, with one line when it differs from the route.
  - When nothing is sent (the demo off, a refused prompt, a limit), the pick still shows with "No answer sent" and why.
  - Limits: every send counts toward 20 per visitor per 10 minutes and 120 an hour for everyone, never given back.
    The 5 per visitor and 30 an hour now count only sends that were forwarded or failed: a clean D1A answer gives its
    slot back. Three chats at once for everyone, was one (the model server waits for a free large-model slot).
  - "The route differs" reads the large route's `min_tier` from the card (`large` when it does not say, as in d1a).
- **D1A pinned to `773db0ea`** (d1a#437): OpenAI-format chat reads a tool call only where the chat template writes it,
  right after its `<|tool_call>` marker; text elsewhere that looks like a call is no longer returned as one. The quality
  gate on the D1A-E4B-it QAT build answered bit for bit the same on every demo (photos, voice and video included) and
  on the labeler replay: 0 flips, max |dp| 0, 271 requests. All-text latency was 0.996 against a base/base floor of
  0.994. No dependency changes.
- The routing demo's caption and README section say what Send it does where the model server routes chats; the old
  caption said the demo sends the prompt nowhere.

### Fixed

- Dev dependencies, for two advisories in tools the app never serves:
  - minimatch 11.0.9 under ts-morph (the shadcn CLI) and typescript-estree (lint), through npm `overrides`
    (GHSA-g3hv-75wg-m249: a glob pattern can make minimatch before 11.0.1 take excessive time). Both packages' latest
    releases already require it.
  - shadcn 4.21.0 → 4.23.0, which takes zod 4.6.6 (GHSA-mrhx-c7xc-m3w5: zod before 4.6.6 can exhaust memory validating
    oversized constrained collections). shadcn 4.21 declares zod 3, which has no fixed release, and fails to start with
    zod 4 forced on it. 4.23 drops its old MCP SDK and that SDK's HTTP server packages (71 packages fewer) and takes
    newer browser-support data (caniuse-lite, baseline-browser-mapping). Versions resolved from before 2026-11-13.
- `./mini.sh update` no longer fails, and rolls back, where the model server routes chats (`ROUTES`, #147). The OpenAI
  smoke test's cut-off tool call asked to write a file, which the router sends to the large model. Every smoke chat is now
  one the router keeps on D1A, and a chat answered with an `x-d1a-route` other than `none`, or with an
  `x-d1a-route-error`, fails its check. So the checks still test D1A itself with routes on, and a forwarded chat can no
  longer pass a check in its place:
  - the cut-off check is the tool call check's own request, cut at 8 tokens, inside the call;
  - the chat beside the decision counts to 30, still running when the decision is sent. The paragraph it asked for before
    was forwarded, so with routes on nothing ran beside the decision and the check passed without testing anything.

### Added

- `ROUTE_DEMO=1` (mini.sh setting, off by default): the routing demo's "Send it" sends the prompt through the model server's
  chat routes (`POST /api/route-chat`) and shows the answer and the model that wrote it. One prompt only (no tools, no
  system prompt, no history), up to 2,000 characters, nothing that could reach the review route; 5 sends per client per 10
  minutes (a client is told apart only behind a trusted proxy, `TRUST_FORWARDED_FOR`), 30 an hour and one at a time for
  everyone. A demo route takes no write token (`demoRefusal`, named in
  `src/lib/guard.ts`); every other POST still checks it.
- `DATE_FACTS` and `JA_DATES` (mini.sh settings, 0 or 1, off by default): pass d1a's `D1A_DATE_FACTS` and `D1A_JA_DATES` to
  the model server, so date preprocessing survives `./mini.sh update` and `reinstall`, which rewrite the model server's
  agent.
- `MEDIA_DEMOS=0` (build time): leave out the photo, voice and video demos next to a model server that cannot answer
  them (a PyTorch server without `d1a.serving.media`); the headline counts the demos shown.
- Demo 14, An agent's day: one task through an agent factory (intake, every tool call, a judge of the report, a router),
  each step one D1A call with D1A's own agent presets and their fail-safe advice; with its smoke requests.
- `SHOGI_URL` (mini.sh setting): a shogi page served by its own static server, shown under `/shogi` with a header link and
  asking D1A through this app's `/model` proxy. Unset, there is no route and no link.
- `AGENT_LAB_URL` (mini.sh setting): an agent lab served by its own server, shown under `/agent-lab` with a header link to
  its warehouse page, and as demo 14 (Agent lab: a 3PL shift) in place of An agent's day. Unset, there is no route and
  no link, and demo 14 stays An agent's day.
- `ROUTES` (mini.sh setting): a d1a chat-routes file passed to the model server as `D1A_ROUTES` (d1a#419). Chats that
  ask for a review or need a larger model go to the targets it names; the rest stay with D1A. A file that is not there
  stops `./mini.sh update`. Unset, D1A answers every chat.

### Changed

- **`scripts/demo-baseline.json` holds the served build's answers** (#142). It now holds the answers recorded on the
  serving host at the pinned D1A, which the deploy's smoke test reproduced exactly. Before, they came from another
  machine and build: 28 of 179 differed, and one audit scored them by mistake.
  - `scripts/demo-baseline.source.json` says where and when they were recorded.
  - `node scripts/demo_smoke.mjs --list` prints that source, and warns when mini.sh's pin has moved past it.
  - mini.sh's smoke test notes when the host's recorded answers differ from the committed file.
- **Known misses are marked in the demos.** The playground's own text examples were scored on the served build against
  a blind expert label. 213 of 236 answers match (90.3%), and 9 of 11 demos are at 80% or above; the PR labeler (7/12)
  and the refund gate (2/4) are below.
  - The 13 answers D1A gets wrong show a small "D1A got this wrong" note on their result: routing (English
    "Summary"), the refund gate's "Ambiguous case", inbox emails 7 and 8, the agent judge on two scenarios, and the
    PR labeler's three. The note appears only when the example runs unchanged.
  - The examples are kept as they are, not swapped. The refund gate's note says its lane still sends the case to a
    person.
  - The PR labeler is described as a first-pass labeler a person reviews.
  - README and README.ja give the rate.

- **Wording matches what the demos do:**
  - The model-routing demo says it shows the model D1A picks ("Pick", "← D1A's pick") and that it sends the prompt
    nowhere. Before, it read "← routed here".
  - The guardrails demo says it flags prompt injection as a second opinion (D1A catches about 60% of public
    injections), not a security boundary. Before, it said it stops them.
  - README and README.ja follow. The recorded demo GIFs still show the old labels.

- **D1A pinned to `c1d58fca`** (d1a#420, d1a#419): the model server can route chats (`D1A_ROUTES`, the new `ROUTES`
  setting here): reviews to a review service, chats that need a larger model to one, the rest to D1A. Off unless
  `ROUTES` is set. With it off, no answer moves. The quality gate on the D1A-E4B-it QAT build answered bit for bit the
  same on every demo (photos, voice and video included) and on the labeler replay: 0 flips, max |dp| 0, 271 requests.
  All-text latency was 0.998 against a base/base floor of 1.002. `httpx` joins D1A's `serve` extra; it was installed
  already, so `scripts/d1a-constraints.txt` stays as recorded.

- **A model server that does not answer, seen from another machine:** the notice says the machine serving the page can
  pause the model while it runs other work and to try again later, instead of telling the visitor to run `./demo.sh` on
  port 8009. On localhost it still says how to start the server.
- **A paused media server reads as a pause, not a fault.** When the machine serving the page pauses its photo, voice and
  video server for a large job (its media route answers 503 with `"paused": true`), those demos say they are paused and
  that the text demos still work, instead of "the media model server is not answering".
- **The agent demo says what it does and what a real agent does.** It shows D1A's decisions and runs none of the
  commands; a note says how D1A's Claude Code hook and MCP tools put the same checkpoints in front of a real agent's tool
  calls, with a link to D1A's docs.
- **The "About D1A" box and the Architecture page describe the current model.** They described the one-epoch D1A-E2B v0.1
  prototype, with a comparison against another hosted model. The About box now says what D1A takes in and returns and
  where it runs, and links D1A's model list. The Architecture page gives D1A-E4B-it QAT's backbone, adapter, head and
  temperature, a serving path that fits PyTorch and MLX servers, and where D1A runs (PyTorch, Apple Silicon, Android).
- **A `MEDIA_DEMOS=0` build no longer promises photo, voice and video.** The headline's "three of them read a photo, a
  voice note or a video" shows only when those demos do, and the page description names no count.
- **No text describes the old prototype's behaviour as the model's.** The Japanese note on English questions and the
  control demo's note no longer speak of the prototype checkpoint.

### Fixed

- **The hardware monitor fills in on a Linux GPU server.** On ARM Linux the CPU card showed "unknown"; it now shows the
  machine's product name. When the model
  server's own process is out of sight (another container), the memory card shows the memory in use on the machine
  instead of a dash. The latency bars no longer run past a narrow card.
- **The outcome poster credits a blind PR's labels to the review bot only when the bot set them** (`scripts/pr_outcomes.py`,
  d1a-playground#128). On a blind-arm PR where the review bot added no label of a family, the poster fell back to the label
  standing there. That label could be the author's or a person's, set before the review and in the bot's view, and it was
  posted as the bot's unanchored `reviewer-blind` answer. Now a kept label counts only if the bot added it. Ordinary PRs
  are unchanged.

### Security

- **Pillow 13.0.0 in the tested environment** (`scripts/d1a-constraints.txt`, which every launcher installs). 12.3.0 has
  more than 40 published advisories that 13.0.0 fixes, most in decoders that read the photos the Photo check sends (heap
  overflows in TIFF, BMP and JPEG 2000 among them). Pillow only decodes the photo there; resizing runs in torchvision.
  12.3.0 and 13.0.0 decode every sample photo, and its JPEG re-encode, to identical pixels, so no answer moves.
  Only Pillow changes: the other patch-level fixes come with the next pin move, which records the file again.
- **Patched development dependencies** (`package-lock.json` only; `package.json` unchanged): undici 7.30.1, hono 4.13.16,
  @hono/node-server 2.1.6, systeminformation 5.33.16, qs 6.16.1, fast-uri 3.1.9, body-parser 2.4.0 and zod 4.6.6. Each
  is the oldest release that fixes its advisory. They come in through the `shadcn` and `eslint` tooling, which the
  running app never loads, but `npm ci` installs them on the serving Mac. 19 of the 21 open Dependabot alerts are fixed,
  and `npm audit` drops from 20 to 13 findings. What remains has no fix yet:
  - minimatch 10 under typescript-eslint and ts-morph, whose newest releases still require it;
  - deepmerge, which has no fixed release;
  - shadcn's own zod 3 (`npm audit` only), which no 3.x release fixes.
- **A write token for the Learning page and the PR label check** (`WRITE_TOKEN` in `.demo/mini.env`, #77). Until now
  anyone on the network who could reach the web app could change the self-learning settings and post labels marked human:
  the cross-site check stops other websites only. With the token set, `POST /api/learning`, `POST /api/review` and the
  label check's sample (`GET /api/review`) need `Authorization: Bearer <token>`. Each browser asks for it once and keeps
  it. `mini.sh` refuses a token shorter than 16 characters or one with characters outside `A-Z a-z 0-9 . _ ~ -`, keeps
  `mini.env` and the web app's LaunchAgent readable by your user only, never prints the token, and hands it to the smoke
  test, which checks that the label check refuses a request without it. Unset, nothing changes, and `mini.sh` says the
  pages are open. SECURITY.md lists what it does not cover.
- **`mini.sh` warns when the write token guards one run only:** a token given to `update` or `reinstall` on the command
  line that `.demo/mini.env` does not hold. The next plain update would open the pages again. The test that every write route
  checks the token now also reads `PUT`, `PATCH`, `DELETE` and `export const` handlers, and reports a re-exported one.

### Added

- **Blind-arm outcomes** (`scripts/pr_outcomes.py`, d1a#299). On a PR whose mirror line says `"blind": true`, the
  labeler shows none of D1A's type, blast or P answers, so the review bot labels it without seeing them. Its labels there
  post as `src` reviewer-blind, not reviewer. The live settings name their sources, so these reach no calibrator.
  - `outcomes-summary.json` gains a `blind` section: PRs per arm, blind PRs reviewed and still unreviewed after a day,
    and the PRs to leave out (a flag that disagrees with the arm's fixed hash, or a bot label of D1A's families in the
    labeler's write window).
  - Lines without the flag are read as before.
- **Issue outcomes still match when the decision log is reworded** (`scripts/pr_outcomes.py`, d1a#377): with
  `D1A_LOG_REWRITE` set, the live GitHub issue title is reworded with the same rules before it is matched to the logged call.
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

- **D1A pinned to `c54b87d8`** (d1a#401): POST /v1/feedback refuses an outcome for a replayed decision with a
  422 that names the original decision, to post it to; before, the outcome was stored but never read, because a replay
  takes its original's outcomes. The Review page and `scripts/pr_outcomes.py` already skip replays, so neither posts
  one. No answer moves. The quality gate on the D1A-E4B-it QAT build, the serving host's files checked by sha256:
  every demo, photos, voice and video included, and the labeler replay answer bit for bit the same (0 flips, max |dp| 0,
  237 requests); all-text latency 1.010 against a base/base floor of 1.000. With the live decode rule, the same 59
  severity answers flip P2 → P1 as on `082cfbfa`, and nothing else moves. D1A's dependencies do not change, so
  `scripts/d1a-constraints.txt` stays as recorded.
- **D1A pinned to `082cfbfa`** (d1a#400): outcomes posted with `src: "judge"` count only for a reader that names that
  source; a reader that names none counts every other source, as before the judge existed. No answer moves. The quality
  gate on the D1A-E4B-it QAT build, the serving host's files checked by sha256: every demo, photos, voice and video
  included, and the labeler replay answer bit for bit the same (0 flips, max |dp| 0, 237 requests); all-text latency
  1.004 against a base/base floor of 0.998. With the live decode rule (the serving host's learning settings), the same
  59 severity answers flip P2 → P1 as on `e9482b75`, and nothing else moves. D1A's dependencies do not change, so
  `scripts/d1a-constraints.txt` stays as recorded.
- **D1A pinned to `e9482b75`** (d1a#398, d1a#397): the model server decodes a photo only as JPEG, PNG or WebP, the
  formats the API documents, before any other Pillow decoder runs; another format or a photo that does not decode gets a
  422 instead of a 500. The page always sends JPEG. The quality gate on the D1A-E4B-it QAT build from `22d53bf5`, the
  serving host's files checked by sha256: every demo, photos, voice and video included, and the labeler replay answer
  bit for bit the same (0 flips, max |dp| 0, 237 requests); all-text latency 0.995 against a base/base floor of 1.003.
- **D1A pinned to `22d53bf5`** (d1a#394): with a model folder that carries `media_pad_row.safetensors`, photos, voice
  and video read Gemma 4's per-layer pad row as stored instead of from the 4-bit table; on D1A-E2B-it QAT the largest
  change against full precision goes 0.140 → 0.085. The quality gate on the D1A-E4B-it QAT build from `1daab721`: every
  text demo and the labeler replay answer bit for bit the same; the 14 media demos move (largest 0.11, one top answer:
  an intact parcel in a mailbox, delivery locker → mailbox), so a host's demo baseline is recorded again.
- **D1A pinned to `1daab721`** (d1a#377): `D1A_LOG_REWRITE` can keep the self-learning decision log in general wording.
  The new `.demo/mini.env` setting `LOG_REWRITE=<file>` (a private JSON list of `{"pattern", "replace"}` rules) passes it to
  the model server, and to the outcome poster, which rewords issue titles with the same rules before matching them.
  Unset, nothing changes.
- **The Learning page edits the gate's two new settings** (#107, d1a#364): `promotion.min_held_out`, the held-out pull
  requests the gate needs before it may promote, and `schedule.growth`, how much the outcomes must grow before the gate
  runs again. The schedule rows say that either trigger now waits for that growth.
- **The models page lists the QAT builds** (`/models`, English and Japanese, #105). D1A-E2B-it QAT and D1A-E4B-it QAT join
  the family diagram (a third trunk under E2B and E4B: Google's 4-bit quantization-aware-trained -it), the scores section
  (D1A-E4B-it QAT against v0.6, and a column in its table) and the builds table; D1A-E4B-it QAT is the newest. Each trunk
  label is now a title with a line under it, so three fit side by side.
- **The README describes the model the playground serves today.** The newest D1A-E2B release (its MLX build on Apple
  Silicon) instead of the v0.1 one-epoch prototype, with D1A's model list for every version's scores; the memory and
  download figures are split into MLX (the Apple Silicon default) and PyTorch; Japanese training since v0.6 is noted.
  AGENTS.md: docs ship with every change.
- **The model server's names are D1A's own, and the old ones still work.** The settings are `MODEL_PORT`, `MODEL_API`,
  `MODEL_PREFIX_CACHE` and `MODEL_PREFIX_MAX_TOKENS` (was `KEV_*`, now matching `MEDIA_PORT` and `MEDIA_API`), the web app
  proxies the model server under `/model` (was `/kev`), and `server/kev/` is `server/systemone/`. The LM Studio adapter
  is titled `d1a-lmstudio` and a request without a `model` gets `d1a-latest`; `kev-latest` is still accepted.
  - Every `KEV_*` name is still read when its `MODEL_*` name is unset (`demo.sh`, `demo.ps1` and `mini.sh` say so once;
    the `MODEL_*` name wins when both are set).
  - `/kev/*` is an alias for `/model/*`: the same four routes the pages use, never `POST /v1/feedback`, so a reverse
    proxy or script that still sends `/d1a/kev/...` keeps working.
  - `mini.sh install`, `reinstall` and `update` rename the `KEV_*` lines of `.demo/mini.env` in place: the value is kept
    byte for byte, and the line is dropped when a `MODEL_*` line is there already. The file as it was stays beside it as
    `.demo/mini.env.before-rename`. The build and the LaunchAgents carry the new names after the next `update`, and
    `.demo/mini.env` is still the record: a command-line value it contradicts is ignored, under either name.
  - The README names no Kev fork and no longer compares the checkpoint with Kev's recipe; the credit to Kev stays.
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
