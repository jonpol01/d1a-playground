#!/usr/bin/env node
// Every demo's built-in examples, sent through the web app (its /kev and /media proxies) as the UI sends them, checked
// against a committed baseline of the answers; and the PR label check (/review) answers, read only.
//
//   node scripts/demo_smoke.mjs http://127.0.0.1:3032/d1a             # check: exits 1 on any failure or changed answer
//   node scripts/demo_smoke.mjs http://127.0.0.1:3032/d1a --record    # (re)write scripts/demo-baseline.json
//   node scripts/demo_smoke.mjs --list                                # no server: the examples must be the baseline's (CI)
//   ... --no-media                                                    # skip photo, voice and video (a server without media)
//
// A request passes when it answers (HTTP 200), every question gets an answer of its type with probabilities that sum to
// 1, and every choice (a choice's option, a score's level, a yes/no answer's side of 0.5) is the baseline's. Probability
// moves are reported, not failed. Photos and voice clips go as the sample files: the UI re-encodes them in the browser
// (canvas, WebAudio), which Node cannot, so their answers can differ slightly from the page's, never from the baseline's.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts/demo-baseline.json");
const args = process.argv.slice(2), flags = args.filter((a) => a.startsWith("--")), base = args.find((a) => !a.startsWith("--"));
const record = flags.includes("--record"), list = flags.includes("--list"), noMedia = flags.includes("--no-media");
if (!base && !list) { console.error("usage: node scripts/demo_smoke.mjs <web app URL, with its base path> [--record] [--no-media] | --list"); process.exit(2); }

globalThis.React = (await import("react")).default;   // the demos' modules hold JSX text (classic runtime: React.createElement)
const jiti = createJiti(import.meta.url, { jsx: true, alias: { "@": join(ROOT, "src") } });
const { smokeRequests } = await jiti.import(join(ROOT, "src/components/uses/smoke.ts"));

const key = (r) => `${r.demo} | ${r.name}`;
const side = (a) => (a.type === "noul" ? (a.noul >= 0.5 ? "true" : "false") : a.type === "choice" ? a.choice : String(a.score));
const probs = (a) => (a.type === "noul" ? { true: a.noul, false: 1 - a.noul } : a.probabilities);

async function send(r) {
  const [url, body] = r.kind === "text"
    ? [`${base}/kev/v1/systemone`, r.body]
    : [`${base}/media/v1/systemone/media`, { model: "d1a-latest", questions: r.questions,
        media: { type: r.mediaType, data: readFileSync(join(ROOT, "public/samples", r.file)).toString("base64") } }];
  const t0 = performance.now();
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const ms = performance.now() - t0;
  if (!res.ok) return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, ms };
  return { answers: (await res.json()).answers, ms };
}

function check(r, got) {
  if (got.error) return [got.error];
  const qs = r.kind === "text" ? r.body.questions : r.questions, errs = [];
  for (const [qid, q] of Object.entries(qs)) {
    const a = got.answers?.[qid];
    if (!a) { errs.push(`${qid}: no answer`); continue; }
    if (a.type !== q.type) errs.push(`${qid}: ${a.type} answer to a ${q.type} question`);
    const sum = Object.values(probs(a)).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > 1e-3) errs.push(`${qid}: probabilities sum to ${sum.toFixed(4)}`);
  }
  return errs;
}

const reqs = smokeRequests().filter((r) => !(noMedia && r.kind === "media"));
const baseline = record ? {} : JSON.parse(readFileSync(BASELINE, "utf8"));
const MEDIA_DEMOS = new Set(smokeRequests().filter((r) => r.kind === "media").map((r) => r.demo));
if (noMedia) for (const k of Object.keys(baseline)) if (MEDIA_DEMOS.has(k.split(" | ")[0])) delete baseline[k];
if (list) {   // the examples the UI ships against the baseline's: a removed or added example fails until it is recorded on purpose
  const sent = new Set(reqs.map(key)), kept = new Set(Object.keys(baseline));
  const gone = [...kept].filter((k) => !sent.has(k)), added = [...sent].filter((k) => !kept.has(k)), per = {};
  for (const r of reqs) per[r.demo] = (per[r.demo] ?? 0) + 1;
  console.log(`${reqs.length} requests: ${Object.entries(per).map(([d, n]) => `${d} ${n}`).join(", ")}`);
  if (gone.length || added.length) {
    console.log(`FAIL: the examples differ from scripts/demo-baseline.json (record it on purpose)\n  removed: ${gone.join("; ") || "none"}\n  added: ${added.join("; ") || "none"}`);
    process.exit(1);
  }
  console.log("PASS: every example is in the baseline, and every baseline entry is still sent"); process.exit(0);
}
const rows = {}, out = {}, failures = [];
let maxDp = 0;
for (const r of reqs) {
  const got = await send(r), k = key(r), errs = check(r, got);
  const row = (rows[r.demo] ??= { n: 0, pass: 0, ms: [] }); row.n++; row.ms.push(got.ms);
  if (!errs.length) {
    out[k] = Object.fromEntries(Object.entries(got.answers).map(([q, a]) => [q, { side: side(a), probs: probs(a) }]));
    const was = baseline[k];
    if (!record && !was) errs.push("not in the baseline (a new example: record it on purpose)");
    for (const [q, a] of Object.entries(was && !record ? out[k] : {})) {
      if (!was[q]) { errs.push(`${q}: not in the baseline`); continue; }
      if (was[q].side !== a.side) errs.push(`${q}: ${was[q].side} -> ${a.side}`);
      for (const [o, p] of Object.entries(a.probs)) maxDp = Math.max(maxDp, Math.abs(p - (was[q].probs[o] ?? 0)));
    }
  }
  if (errs.length) failures.push(`${k}: ${errs.join("; ")}`); else row.pass++;
}
if (!record) for (const k of Object.keys(baseline)) if (!reqs.some((r) => key(r) === k)) failures.push(`${k}: in the baseline but no longer sent (an example was removed)`);
if (!record) failures.push(...(await reviewCheck()));

// The human check (/review, d1a-playground#29): the page renders, and its route either serves the sample or is off.
// Read only: nothing is posted, so the live decision log gets no outcome from a smoke run.
async function reviewCheck() {
  const errs = [], page = await fetch(`${base}/review`).catch((e) => ({ ok: false, status: e.message }));
  if (!page.ok || !(await page.text()).includes("PR label check")) errs.push(`review page: HTTP ${page.status}`);
  const r = await fetch(`${base}/api/review`, { cache: "no-store" }).catch((e) => ({ ok: false, status: e.message, json: async () => ({}) }));
  const j = await r.json().catch(() => ({}));
  const shaped = r.ok && j.target === 50 && Array.isArray(j.items) && j.items.length <= 50 && j.items.every((i) => i.group && i.options?.sev && i.pr);
  const off = r.status === 404 && /review is off/.test(j.error ?? "");
  if (!shaped && !off) errs.push(`review route: HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  console.log(`review: page ${page.status}, route ${off ? "off (404)" : shaped ? `${j.done}/${j.target} checked, ${j.items.length} in the sample` : "BAD"}`);
  return errs.map((e) => `review | ${e}`);
}

const p50 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log("demo          requests  pass  p50 ms");
for (const [d, s] of Object.entries(rows)) console.log(`${d.padEnd(13)} ${String(s.n).padStart(8)}  ${String(s.pass).padStart(4)}  ${String(Math.round(p50(s.ms))).padStart(6)}`);
if (record) {
  if (failures.length) { console.error(`not recorded: ${failures.length} failed\n  ${failures.join("\n  ")}`); process.exit(1); }
  writeFileSync(BASELINE, JSON.stringify(out, null, 1) + "\n"); console.log(`recorded ${Object.keys(out).length} requests in scripts/demo-baseline.json`);
} else {
  console.log(`max probability change vs the baseline: ${maxDp.toFixed(4)}`);
  if (failures.length) { console.log(`FAIL: ${failures.length}\n  ${failures.join("\n  ")}`); process.exit(1); }
  console.log(`PASS: ${reqs.length} requests, every answer the baseline's`);
}
