# Security Policy

## Supported versions

| Version | Security fixes |
| --- | --- |
| `main` | Yes |
| 0.2.x (latest release) | Yes |
| Earlier versions | No |

Fixes ship in a patch release of the latest minor version. The D1A model server the playground runs is covered by [jonpol01/d1a's security policy](https://github.com/jonpol01/d1a/security/policy).

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub: **[Security → Report a vulnerability](https://github.com/jonpol01/d1a-playground/security/advisories/new)**. Only the maintainers can read the report, and GitHub can assign a CVE once it is confirmed. A problem in the model server itself (`d1a.serve`, `d1a.media`) goes to [jonpol01/d1a](https://github.com/jonpol01/d1a/security/advisories/new).

A useful report includes:

- the affected part: the web app, its API routes and proxies, `demo.sh` / `demo.ps1`, `mini.sh`, or the LM Studio adapter;
- the version or commit;
- what an attacker can do and what they need first;
- steps to reproduce;
- any fix you suggest.

Please use test data. Don't send real user data or credentials.

## What happens next

| Step | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Triage: confirmed or declined, with a severity | within 7 days |
| Status updates | at least every 14 days until resolved |

Severity uses [CVSS v4.0](https://www.first.org/cvss/v4-0/). Fix targets after confirmation:

| Severity | Fix released within |
| --- | --- |
| Critical | 7 days |
| High | 30 days |
| Medium | 90 days |
| Low | next regular release |

A vulnerability in a dependency, for example Next.js, is fixed by upgrading as soon as a fixed version exists. If a report is declined, we explain why.

## Coordinated disclosure

We follow coordinated vulnerability disclosure:

- We publish a GitHub Security Advisory when the fix is released, crediting the reporter unless you ask us not to.
- We ask you to keep the details private until then, or for **90 days** from your report, whichever comes first.
- If a fix needs more time, we agree a new date with you.
- A problem already being exploited may be disclosed sooner, together with a mitigation.

## Safe harbor

We will not pursue or support legal action against anyone who, in good faith:

- tests only their own installation of the playground, or one they are authorized to test, never someone else's deployment;
- avoids privacy violations, data destruction and service disruption;
- reports through the private channel above and gives us reasonable time to fix before disclosing.

If a third party takes legal action against you for research done under this policy, we will make it known that your actions followed it.

## Scope

**In scope:**
- **The web app:** its pages, the `/kev` and `/media` proxies, and the `/api/hw` route.
- **The start scripts:** `demo.sh`, `demo.ps1` and `mini.sh`, including the LaunchAgents `mini.sh` writes.
- **The LM Studio adapter** (`server/lmstudio_systemone.py`).

For example: script injection through a demo's input or a loaded pull request, a way to make `/api/hw` run anything but its fixed commands, a proxy that reaches beyond the configured model server, or a start script that exposes a port it should not.

**Out of scope:**
- **Wrong answers from the model.** That is model quality; open a normal issue.
- **Vulnerabilities in the model server.** Report those to [jonpol01/d1a](https://github.com/jonpol01/d1a/security/policy).
- **Vulnerabilities in Next.js, Node.js, LM Studio or other upstream software** that the playground does not make reachable.
- **Unauthenticated use of a playground you chose to publish** (see below), and denial of service by sending many valid requests.

## Security model

- **The playground is a demo with no accounts.** Anyone who can open the web app can use the model behind it and see the hardware panel (`/api/hw`: GPU, CPU and memory use).
  - `mini.sh` binds the web app to `127.0.0.1` unless you set `HOST`.
  - `demo.sh` and `demo.ps1` run Next.js's development server, which listens on every network interface: other devices on your network can open the demo while it runs.
  - Serve it beyond your machine (`HOST=0.0.0.0`, a reverse proxy, or the demo scripts on a shared network) only to people you would let use the model, or put authentication in the proxy.
- **The model server stays on loopback.** `mini.sh` and the demo scripts always bind it to `127.0.0.1`, and the web app reaches it only through its fixed proxies (`KEV_API`, `MEDIA_API`).
- **`/api/hw` runs fixed system commands** (`lsof`, `ioreg`, `memory_pressure`, `sysctl`, `footprint`, `nvidia-smi`) with fixed arguments. No request input reaches them.
- **What leaves your machine:**
  - Text, photos and voice clips you enter go only to your model server.
  - The PR labeler's "load from GitHub" fetches public pull requests from `api.github.com` directly in your browser, without a token.
  - Recording a voice note needs microphone permission, which browsers grant only on `localhost` or https.
- **Secrets stay out of the repository.** GitHub secret scanning and push protection are on for this repository.

## Recognition

We credit reporters in the published advisory and the release notes, unless you prefer to remain anonymous. There is no paid bug bounty.
