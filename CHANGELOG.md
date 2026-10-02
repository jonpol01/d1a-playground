# Changelog

All notable changes to the D1A playground are listed here, newest first.

- **Versions** follow [Semantic Versioning](https://semver.org); the version lives in `package.json`.
- **Releases** are cut by pushing a `vX.Y.Z` tag. CI then checks that the tag, `package.json` and this file agree,
  lints and builds the app, and publishes a GitHub release whose text is that version's section below.
- The playground runs against a D1A model server; each release names the D1A version and checkpoints it was tested
  with.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- `demo.sh` and `demo.ps1` install and run the D1A model server instead of the Kev fork's: on Apple Silicon the 8-bit
  MLX build (about 4 GB to download instead of 10 GB), elsewhere the PyTorch checkpoint; `MODEL_RUN` picks another one.
  `--media` also starts the photo and voice server, so the one-command setup runs all eleven demos.

### Changed

- `mini.sh` and the demo scripts pin D1A `d659835`, which reads Gemma 4's per-layer embeddings from disk (about 1.5 GB
  less memory for the E4B model on the Mac mini).
- CI also checks that `demo.ps1` parses.

## [0.2.0] - 2026-10-02

Eleven demos instead of nine: D1A now also answers questions about a photo or a voice note. The playground runs as an
always-on service on a Mac, with the model as a setting.

### What's new

- **Photo check.** Pick a delivery photo or upload your own: D1A says whether the parcel is damaged and where it was
  left.
- **Voice triage.** Pick a driver's voice note, record one or upload a clip, in English or Japanese: D1A says what the
  driver needs and whether it is urgent, with no speech-to-text step.
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
- CI: lint, type check, production builds at `/` and under `/d1a`, script syntax checks, and this release workflow.

### Changed

- `mini.sh` pins the D1A model server it is tested against; this release was tested with D1A 0.2.0 and
  `JohnP1/d1a-e4b-mlx-q8@v0.2-hybrid` (text) and `JohnP1/d1a-e2b@v0.2.1-2epoch-calibrated` (photo and voice)
  ([#4](https://github.com/jonpol01/d1a-playground/pull/4), [#6](https://github.com/jonpol01/d1a-playground/pull/6),
  [#9](https://github.com/jonpol01/d1a-playground/pull/9)).
- `mini.sh update` continues in the freshly pulled script instead of the old one
  ([#3](https://github.com/jonpol01/d1a-playground/pull/3)).

### Known issues

- `demo.sh` and `demo.ps1` (the one-command setup) still install the Kev fork's model server, so they run the nine text
  demos only; `mini.sh` and a manually started `d1a.serve` / `d1a.media` run all eleven.

## 0.1.0 - 2026-09-30

Not released. The first playground: nine live use cases (model routing, guardrails, tool-call gating, inbox triage,
reranking, LLM evals, bulk labeling, real-time control, confidence gate), a Japanese and English UI, a hardware monitor,
an architecture page, LM Studio mode, and `demo.sh` / `demo.ps1` to start everything with one command.

[Unreleased]: https://github.com/jonpol01/d1a-playground/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jonpol01/d1a-playground/releases/tag/v0.2.0
