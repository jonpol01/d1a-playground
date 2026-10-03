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

- Demo 13, **Video check**: the Photo check questions (is the parcel damaged, where was it left) about a short clip, with
  four sample clips and an upload (MP4, MOV, WebM up to 24 MB). The model reads 16 timestamped frames through Gemma 4's
  vision encoder (jonpol01/d1a#100); the sound is not used. Zero-shot, like the photos: right about the scene as a whole,
  not yet about the order of events. Needs a D1A model server with video support.

- Demo 12, **PR labeler**: pick an example, paste a pull request or load a public one from GitHub; D1A answers the three
  questions the CTO bot's labeling job asks on every open PR (change type, blast radius, severity P0–P4), built from the
  same document, and the page applies the job's rules: `review:needs-human` below p 0.7, and a committed `.env` forces
  `type/security` and at least P1.

### Changed

- **One model, loaded only while in use.** Photo check and Voice triage on a Mac are answered by the model server
  itself, with the same model, through Gemma 4's vision and audio encoders (~1 GB more while loaded) instead of a
  second bf16 Gemma 4 (~10 GB). `./demo.sh --media` starts no second server on Apple Silicon; `mini.sh` drops the
  `d1a-media` LaunchAgent, sends `/media` to the model server, and frees the model after `IDLE_UNLOAD` seconds without a
  request (600; it loads again in a few seconds). On PyTorch machines the demos still use `d1a.media`.
- The "waking up" note says a few seconds instead of about 30.

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
