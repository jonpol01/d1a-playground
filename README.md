# D1A playground — eleven use cases

[日本語](README.ja.md)

A small decision model reads one document, answers a few typed questions about it, and returns a probability for every option. This playground runs eleven real jobs on that idea, live, on your own machine: routing prompts to a model tier, blocking prompt injections, gating an agent's tool calls, triaging an inbox, reranking search results, grading LLM answers, labelling a table, steering a robot in real time, deciding when to act and when to ask a human, and, from a photo or a voice note, checking a delivery for damage and triaging a driver's message. Every example is editable, and every answer shows the full probability distribution behind it.

D1A is built on [Kev](https://github.com/jaredpalmer/kev) by Jared Palmer (Apache-2.0). D1A is not affiliated with or endorsed by Jared Palmer or the Kev project. The playground serves D1A-E2B v0.1, a one-epoch model on Gemma 4 E2B ([JohnP1/d1a-e2b](https://huggingface.co/JohnP1/d1a-e2b), tag `v0.1-1epoch`; formerly JohnP1/kev-gemma4-e2b), trained with the Gemma 4 support in the fork [jonpol01/kev](https://github.com/jonpol01/kev).

![The nine demos, one after another, each with the live model's answer](docs/demos.gif)

## The Eleven Demos

| # | Demo | What the model decides | Example answer from the live prototype |
|---|---|---|---|
| 1 | Model routing | How hard a prompt is: `small`, `medium` or `large` model, with an illustrative cost per 1,000 requests | "What's the capital of Australia?" → small (0.73); a replication-lag debugging question → large (0.70) |
| 2 | Guardrails | The message category (`safe`, `prompt_injection`, `abuse`, `off_policy`) and whether it should reach the LLM → ALLOW or BLOCK | "Ignore previous instructions…" → prompt_injection (0.59), BLOCK; a homework request → off_policy (0.98), BLOCK |
| 3 | Tool-call gating | `allow`, `ask` or `deny` for an agent's proposed tool call | `read_file` → allow (0.65); `rm -rf ~/` → deny (0.81); `send_email` to all staff → ask (0.49) |
| 4 | Inbox triage | `reply_now`, `later` or `archive` for each of eight emails, sorted | the production outage and the manager's deadline on top; the receipt and the flight sale archived |
| 5 | Reranking | p(this passage answers the query) for six passages, re-sorted | the "recover with phone" passage moves from #3 to #1 (0.77) |
| 6 | LLM evals | A 1–5 grade for an LLM answer, with the whole distribution | correct answer 4.7 / 5; wrong answer 3.0 / 5, spread across levels |
| 7 | Bulk labeling | `positive`, `neutral` or `negative` for 30 product reviews, with a p(label) column | 30 rows in 7–13 s at 3 requests in flight; the two rows below 0.60 are flagged for a human |
| 8 | Real-time control | `left`, `right` or `stay` for a robot chasing a target, every tick | 2–3 decisions per second at 250–450 ms each; ticks in between are skipped, never queued |
| 9 | Confidence gate | One question; your two thresholds put the answer in *act*, *act and confirm* or *send to a human* | a clear refund → refund (0.75), confirm lane; an ambiguous one → replace (0.41), human lane |
| 10 | Photo check | From a delivery photo: is the parcel damaged (`noul`), and where was it left (five places) | a wet, torn box on a sidewalk → damaged (0.89), on a sidewalk (0.78); the locker photo → 0.57, "check by hand" |
| 11 | Voice triage | From a short voice note, EN or JA, with no speech-to-text: is it urgent, and what does the speaker need | 「高速道路でタイヤがパンクしました…」 → urgent (0.77), a vehicle problem (0.71); a lost driver → routine (p(urgent) 0.30), directions to the address |

The numbers are from runs on an M1 Max; yours will differ a little. Each demo has its own picture of the answer (a lit route, a shield, a traffic light, inbox trays, sliding search results, stars, a progress ring, a little arcade robot, a slider track), and the probability bars stay underneath it. Screenshots of every demo, in light mode plus one on a phone in dark mode, are in [docs/screenshots](docs/screenshots).

### Each Demo Running

Short recordings of the live prototype in dark mode, with the page in English: each one picks an example, presses the button and shows the answer with its probabilities. The recordings are from one run; yours will differ a little.

**1. Model routing**

![Model routing demo: a hard Postgres debugging prompt is routed to the large model, with the probability of small, medium and large and the cost per 1,000 requests](docs/gifs/en/routing.gif)

**2. Guardrails**

![Guardrails demo: a prompt-injection message is labelled prompt_injection and blocked, with the probability of every category](docs/gifs/en/guardrails.gif)

**3. Tool-call gating**

![Tool-call gating demo: the call rm -rf ~/ is denied, shown as a red traffic light with the allow, ask and deny probabilities](docs/gifs/en/tools.gif)

**4. Inbox triage**

![Inbox triage demo: eight emails are sorted into Reply now, Later and Archive trays, each card showing its probability](docs/gifs/en/inbox.gif)

**5. Reranking**

![Reranking demo: six passages are scored against a query and re-sorted, the one that answers it moving to the top](docs/gifs/en/rerank.gif)

**6. LLM evals**

![LLM evals demo: a wrong answer about the Apollo 11 landing is graded from 1 to 5, with a stacked bar showing how the probability spreads across the levels](docs/gifs/en/evals.gif)

**7. Bulk labeling**

![Bulk labeling demo: 30 product reviews are labelled positive, neutral or negative in a few seconds, each row with a p(label) bar and the low-confidence rows flagged](docs/gifs/en/labeling.gif)

**8. Real-time control**

![Real-time control demo: a little robot chases a star along a track, one model decision per tick, with latency and decisions-per-second counters](docs/gifs/en/control.gif)

**9. Confidence gate**

![Confidence gate demo: an ambiguous support case gets a low top probability and lands in the send-to-a-human lane](docs/gifs/en/gate.gif)

**10. Photo check**

![Photo check demo: a wet, torn box on a sidewalk is judged damaged with p 0.89, left on a sidewalk with p 0.78](docs/gifs/en/photo.gif)

**11. Voice triage**

![Voice triage demo: a Japanese voice note about a flat tyre on the highway is judged urgent, a vehicle problem](docs/gifs/en/voice.gif)

## Quick Start

You need [git](https://git-scm.com/downloads), [Node.js](https://nodejs.org) 20.9 or newer and [uv](https://docs.astral.sh/uv/). You don't need Python: uv fetches Python 3.13 if it is missing. The scripts check all of this and say what to install.

**macOS, Linux, WSL**

```bash
git clone https://github.com/jonpol01/d1a-playground.git && cd d1a-playground
./demo.sh
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/jonpol01/d1a-playground.git; cd d1a-playground
powershell -ExecutionPolicy Bypass -File .\demo.ps1
```

The script installs the model server into `.demo/venv` (from [jonpol01/kev](https://github.com/jonpol01/kev), pinned to a commit), starts it on port 8009, starts the web app on port 3001 (or 3011, or 3021–3030 if those are busy), and opens your browser. The first run downloads about 1 GB of Python packages and the model (about 10 GB); after that a start takes about 20 seconds. Logs go to `.demo/`. Ctrl+C stops everything, and `./demo.sh stop` (or `.\demo.ps1 stop`) stops a run whose terminal you closed.

### Photo Check and Voice Triage

These two demos need a second model server, `d1a.media` from [jonpol01/d1a](https://github.com/jonpol01/d1a), which loads Gemma 4 with its vision and audio encoders (bf16, about 10 GB of memory) and answers the same questions about a photo or a voice clip. The web app forwards `/media/*` to it (`MEDIA_API`, default `http://127.0.0.1:8010`). Start it next to the playground:

```bash
# in a checkout of https://github.com/jonpol01/d1a, next to this one
uv run --extra serve --extra media python -m d1a.media --run JohnP1/d1a-e2b --port 8010
```

The checkpoint is trained on text only, so these answers are zero-shot: on the six sample photos it judged damage right on 6 of 6 and the drop-off place on 5 of 6 (it calls the mailbox a locker), and it read all four sample voice notes right. The voice samples were made with Qwen3-TTS; recording your own needs microphone access, which browsers allow on `localhost` or https only.

Other options: `--no-server` uses a model server that is already running on port 8009, `--no-browser` skips opening the browser, `KEV_PORT` and `PORT` change the two ports.

## Requirements

Measured on an M1 Max with 64 GB of memory:

- **Download:** about 10 GB on the first run (Gemma 4 E2B) plus the small adapter, and about 1 GB of Python packages (more on Linux and Windows with CUDA).
- **Memory:** the model server uses about 12 GB when idle and about 15 GB at its peak (no swap). A 16 GB machine is tight; with less, use LM Studio mode below.
- **Speed:** ready about 16 seconds after the download; a request with six questions takes 0.4–1 s, and a single question about 0.25–0.7 s.
- **Hardware:** an NVIDIA GPU is used automatically (the scripts install the CUDA build of PyTorch when a driver is present). On Apple Silicon the model runs on the GPU through PyTorch MPS, and the scripts cap PyTorch's share of unified memory (`PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.5` and `PYTORCH_MPS_LOW_WATERMARK_RATIO=0.4`; the low mark is needed because PyTorch refuses a high mark below its default low of 1.4). CPU-only machines work, but each request takes seconds.

## How It Works

The browser talks only to the web app, a Next.js app that forwards `/kev/*` to the model server (`KEV_API`, default `http://127.0.0.1:8009`), so there is no CORS setup. The model server is Kev's `kev.serve`, which implements TypeSafe's System One API: `POST /v1/systemone` with one `state` (the document: text or JSON) and a set of typed questions, `choice` (named options with descriptions), `noul` (yes/no) and `score` (ordered levels).

It is not a chat model. The checkpoint is a LoRA adapter and a pointer head on Gemma 4 E2B: it reads the state once, answers every question in the same forward pass without letting the questions see each other, and reads a probability for each option directly off the pointer head, with a temperature fitted on held-out data so the probabilities are calibrated. No text is generated, so there is nothing to parse and no format to break.

Everything the demos do with the answers (route, block, sort, grade, move a robot, pick a lane) is plain code in [src/components/uses](src/components/uses). Each demo's questions are in the same files, so you can see exactly what the model was asked. The batch demos send one request per item, a few in flight at a time; the control loop sends a new state only when the previous answer has come back.

### Inside the Model

The same diagrams as the `/architecture` page, from [jonpol01/d1a](https://github.com/jonpol01/d1a#how-it-works) (generated by its `docs/arch/make_svgs.py`).

**The input.** The document comes first, once; each question follows as its own branch, `<q>` and the instructions, one `<opt> … </opt>` span per option, then `<decide>`. Position ids restart for every question, so each question sees exactly what it would see alone.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/arch/layout-dark.svg">
  <img src="docs/arch/layout-light.svg" alt="Token layout: the document once, then per question <q>, the options and <decide>" width="100%">
</picture>

**The model.** A Gemma 4 backbone with a LoRA adapter, and a small pointer head that scores each option's `</opt>` against the question's `<decide>`. A temperature fitted on held-out data makes the probabilities calibrated.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/arch/model-dark.svg">
  <img src="docs/arch/model-light.svg" alt="Gemma 4 backbone with LoRA, pointer head, softmax over the options" width="100%">
</picture>

**Two ways to run it, same answers.** Packed runs the whole request as one sequence under a block-causal mask; rows reads the document once into a prefix cache and runs each question as its own short row.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/arch/forms-dark.svg">
  <img src="docs/arch/forms-light.svg" alt="Packed form with a block-causal mask, and rows over a cached document" width="100%">
</picture>

**Where it runs.** The text demos call `d1a.serve`; Photo check and Voice triage call `d1a.media`, where Gemma 4's own vision and audio encoders feed the same head.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/arch/serving-dark.svg">
  <img src="docs/arch/serving-light.svg" alt="Clients call d1a.serve; photos and voice notes go to d1a.media" width="100%">
</picture>

## LM Studio Mode (Not the Trained Model)

For machines without the memory for the model server, both scripts can point the playground at a chat model in [LM Studio](https://lmstudio.ai) instead:

```bash
./demo.sh --lmstudio http://127.0.0.1:1234                                      # macOS: gemma-4-e4b-it-mlx by default
./demo.sh --lmstudio http://127.0.0.1:1234 --lmstudio-model <id from /v1/models>   # Windows and Linux ids have no -mlx suffix
```

This runs [server/lmstudio_systemone.py](server/lmstudio_systemone.py), which asks each question as its own prompt and turns the chat model's letter probabilities into the same answer shape. **It is prompted Gemma, not the trained checkpoint:** no adapter, no pointer head, no calibration, and one chat request per question. The page shows a banner while it is in this mode. Start LM Studio's server (Developer tab) and load a Gemma 4 model first; the script lists the Gemma models it finds if the id doesn't match.

## Limitations

- The checkpoint is a **one-epoch prototype**. On the development partitions of Kev's suites it scores 0.794 on trained sources and 0.569 on new sources, against 0.817 and 0.622 for Kev's two-epoch Qwen3.5-0.8B base recipe (one epoch against two, so not like for like). The [model card](https://huggingface.co/JohnP1/d1a-e2b) has the details.
- It was trained on English data. Other languages are untested in these demos.
- Question wording matters. Some demos use the wording that worked best with this prototype, and the files say so: the inbox adds a yes/no urgency question because the three-way choice alone under-calls urgent mail; the control loop's state spells out which way the target is, because with positions alone the prototype drifts left (tick the box off in the demo to see it).
- Several answers are close calls (0.4–0.6). That is the point of showing probabilities: the demos route, flag or hand those to a human instead of pretending to be sure.

## Troubleshooting

- **"The model server is not answering"**: the server is not running or is still downloading. Check `.demo/kev-server.log`, or run `./demo.sh` again.
- **Port busy**: port 8009 must be free or already running a Kev server; the web app picks the first free port of 3001, 3011, 3021–3030. Set `KEV_PORT` or `PORT` to use others.
- **Out of memory, or the machine swaps hard**: close other apps, or use `--lmstudio`. On Apple Silicon the scripts already cap PyTorch's memory; a lower `PYTORCH_MPS_HIGH_WATERMARK_RATIO` makes it fail earlier instead of swapping.
- **The page loads but buttons do nothing**: open `http://localhost:<port>`, not `127.0.0.1` or a LAN address. The Next.js dev server only hydrates the pages for hostnames it trusts (`allowedDevOrigins` in `next.config.ts`).
- **Windows says scripts are disabled**: run it as `powershell -ExecutionPolicy Bypass -File .\demo.ps1`.
- **Slow on a PC with an NVIDIA GPU**: check the `serving ... on <device>` line in `.demo/kev-server.log`. If it says `cpu`, delete `.demo/venv` and run the script again after updating the NVIDIA driver, so uv picks the CUDA build of PyTorch.

## The Page

The UI is in Japanese by default, with an EN / JA switch in the header; the choice is remembered in the browser, and `?lang=en` or `?lang=ja` in the URL overrides it. In Japanese mode the examples are Japanese. The prototype model was trained on English data, so some demos keep their questions and option descriptions in English while the text they read is Japanese: with Japanese wording those demos gave weaker or less stable answers (the file of each demo says which). A hardware monitor under the header shows the backend, the latency of each request with a sparkline, throughput, and the model server machine's GPU use, memory and load (from `GET /api/hw`, which runs a few unprivileged commands such as `ioreg`, `footprint`, `memory_pressure` or `nvidia-smi`). `/architecture` explains how the model works.

## Self-hosting on a Mac

`mini.sh` runs the playground as an always-on service: the model server and a production build of the web app as two user LaunchAgents (`io.github.jonpol01.d1a-model` and `io.github.jonpol01.d1a-web`) that start at login and restart after a crash. On Apple Silicon the model server runs [JohnP1/d1a-e2b-mlx-q8](https://huggingface.co/JohnP1/d1a-e2b-mlx-q8) on MLX (about 4 GB of memory); elsewhere the PyTorch checkpoint JohnP1/d1a-e2b. Set `MODEL_RUN=JohnP1/d1a-e4b-mlx-q8` in `.demo/mini.env` for the larger, more accurate E4B (about 6.5 GB), then `./mini.sh reinstall`. It needs [Homebrew](https://brew.sh) `node` and `uv`.

```bash
git clone https://github.com/jonpol01/d1a-playground.git ~/d1a-playground && cd ~/d1a-playground
./mini.sh install    # D1A model server into .demo/d1a-venv, npm ci + build, write and load the LaunchAgents
./mini.sh status     # what is loaded and whether both ports answer
./mini.sh stop       # unload both;  ./mini.sh start loads them again
./mini.sh update     # git pull, reinstall, rebuild, restart
```

Logs go to `~/Library/Logs/d1a-model.log` and `~/Library/Logs/d1a-web.log`. Settings are read by `install` and `update` and kept in `.demo/mini.env`: `KEV_PORT` (8009), `PORT` (3031), `HOST` (127.0.0.1; use 0.0.0.0 to serve the LAN directly), `D1A_BASE_PATH` (empty), and the MPS memory cap `PYTORCH_MPS_HIGH_WATERMARK_RATIO` / `PYTORCH_MPS_LOW_WATERMARK_RATIO` (0.7 / 0.6, sized for a 32 GB Mac that runs other things; lower them to fail early instead of swapping), and the model server's cache of long states `KEV_PREFIX_CACHE` / `KEV_PREFIX_MAX_TOKENS` (4 / 65536). The model server always listens on 127.0.0.1 only. LaunchAgents run while the user is logged in, so turn on automatic login if the Mac must come back by itself after a reboot. uv's own settings apply to the install, for example `UV_SYSTEM_CERTS=1` on a network that inspects TLS, or `UV_CACHE_DIR` when the default cache is not writable.

**Photo check and Voice triage.** Set `MEDIA=1` in `.demo/mini.env` and run `./mini.sh reinstall` to add a third LaunchAgent, `io.github.jonpol01.d1a-media`: `d1a.media` on port `MEDIA_PORT` (8010, 127.0.0.1 only) with `MEDIA_RUN` (JohnP1/d1a-e2b@v0.2.1-2epoch-calibrated), logging to `~/Library/Logs/d1a-media.log`. It runs bf16 Gemma 4 with its vision and audio encoders on PyTorch MPS, under the same MPS cap. It loads the model only when someone uses Photo check or Voice triage (the first request then takes about 30 s, and the page says so) and frees it after 10 idle minutes, so it costs about 10 GB only while in use. `MEDIA=0` removes it again.

**Behind a reverse proxy, under a sub-path.** Build with `D1A_BASE_PATH=/d1a` (for example `D1A_BASE_PATH=/d1a ./mini.sh install`) and the app serves everything under `/d1a`: pages, assets, the model API proxy (`/d1a/kev/...`) and `/d1a/api/hw`. Point the proxy's `/d1a` prefix at `http://127.0.0.1:3031` with the path unchanged, e.g. `http://<your-mac-ip>/d1a`. `next build` and `next start` both need the same `D1A_BASE_PATH` (mini.sh sets it for both), so change it with `./mini.sh update` after editing `.demo/mini.env`.

## Development

```bash
npm ci
KEV_API=http://127.0.0.1:8009 npm run dev      # with a model server already running
npm run lint && npx next typegen && npx tsc --noEmit -p .
```

## Releases

Versions follow [Semantic Versioning](https://semver.org) and are published on [GitHub](https://github.com/jonpol01/d1a-playground/releases); [CHANGELOG.md](CHANGELOG.md) says what changed in each one. To release: write the version's section in CHANGELOG.md by hand, set the same version in `package.json` (`npm version X.Y.Z --no-git-tag-version`), merge, then push the tag `vX.Y.Z`; CI checks that all three agree, builds the app and publishes the release with that section as its text.

## Credits and License

- [Kev](https://github.com/jaredpalmer/kev) by Jared Palmer, Apache-2.0: the model architecture, training and serving code, the System One API client and the playground this app started from. Files carried over and changed say so in a header; [NOTICE](NOTICE) lists them.
- [Gemma 4](https://huggingface.co/google/gemma-4-E2B) by Google, Apache-2.0: the base model under the checkpoint.
- This playground, the Gemma 4 support in Kev and the [JohnP1/d1a-e2b](https://huggingface.co/JohnP1/d1a-e2b) checkpoint: John Soliva ([jonpol01](https://github.com/jonpol01)).

Licensed under the Apache License 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
