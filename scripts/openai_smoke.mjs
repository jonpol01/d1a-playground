#!/usr/bin/env node
// The served D1A's OpenAI side, checked live (d1a#274): what apps that used LM Studio (mem0, n8n, Hermes) rely on, through
// the OpenAI port (scripts/openai_port.mjs), plus decisions on the model server, which must not change after chats.
//
//   node scripts/openai_smoke.mjs http://127.0.0.1:1234                                  # the OpenAI port only
//   node scripts/openai_smoke.mjs http://127.0.0.1:1234 --decide http://127.0.0.1:8009   # and decisions (mini.sh smoke)
//   ... --wait-limit-ms <ms>  how long a decision may wait behind a running chat (30000)
//   ... --embed-ref <file>   also compare embeddings with reference vectors ({"texts": [...], "vectors": [...]}, e.g. LM
//                            Studio's for the same GGUF): every cosine must be at least 0.999
//
// Each check sends real requests and judges the answers, not only the status: a chat must say the word or the sum it was
// asked for, a stream must arrive in pieces and end with [DONE], a tool call must name the tool and the city, similar
// sentences must embed closer than unrelated ones, and the System One and feedback routes must not answer on this port.
// Every chat must be D1A's own answer: where the model server routes chats (d1a's D1A_ROUTES), a chat it forwarded to another
// model (`x-d1a-route` other than "none") fails its check, so the checks' prompts are ones the router keeps (#147).
// Exits 1 when a check fails.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DECISION = {   // a labeler-shaped request; sent with the header the demos use, so the decision log skips it
  state: "PR: Escape user input in the SQL query builder (fixes injection in /search)\n\nFiles: src/db/query.py",
  questions: { sev: { type: "choice", instructions: "How severe is the problem this PR fixes?",
                      criteria: { P0: "critical", P1: "high", P2: "medium", P3: "low", P4: "trivial" } },
               security: { type: "noul", instructions: "Is this a security fix?" } },
};
const NO_LOG = { "x-d1a-decision-log": "off" };
const WEATHER = [{ type: "function", function: { name: "get_weather", description: "Current weather for a city",
  parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }];

const cos = (x, y) => { let d = 0, a = 0, b = 0; for (let i = 0; i < x.length; i++) { d += x[i] * y[i]; a += x[i] * x[i]; b += y[i] * y[i]; } return d / Math.sqrt(a * b); };
const norm = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0));
function must(ok, detail) { if (!ok) throw new Error(detail); }

async function post(url, body, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, type: r.headers.get("content-type") || "", route: r.headers.get("x-d1a-route"), routeError: r.headers.get("x-d1a-route-error"), text, json };
}

// "none": the router kept the chat; no header: the model server does not route chats. A route error with "none" means the
// router's own pass failed: D1A answered, but the router is broken, so that fails too.
function byD1A(route, routeError) {
  must(route === null || route === "none", `forwarded to the "${route}" route: not D1A's answer`);
  must(!routeError, `x-d1a-route-error: ${routeError}`);
}

export async function run(base, { decide, embedRef, waitLimitMs = 30000, log = console.log } = {}) {
  const results = [], chat = { model: "d1a-chat" };
  const check = async (name, fn) => {
    const t0 = performance.now();
    try { const detail = await fn(); results.push({ name, ok: true, ms: Math.round(performance.now() - t0), detail }); }
    catch (e) { results.push({ name, ok: false, ms: Math.round(performance.now() - t0), detail: e.message }); }
  };
  const complete = async (body) => {
    const r = await post(`${base}/v1/chat/completions`, { ...chat, temperature: 0, ...body });
    must(r.status === 200 && r.json?.object === "chat.completion", `HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    byD1A(r.route, r.routeError);
    return { ...r.json.choices[0], usage: r.json.usage };
  };
  let before, embedId, callTokens;

  if (decide) await check("decision on the model server", async () => {
    const r = await post(`${decide}/v1/systemone`, DECISION, NO_LOG);
    must(r.status === 200 && r.json?.answers?.sev?.choice && typeof r.json.answers.security?.noul === "number", `HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    before = r.json.answers;
    return `sev ${before.sev.choice}, security ${before.security.noul}`;
  });
  await check("model list", async () => {
    const r = await fetch(`${base}/v1/models`), j = await r.json();
    const ids = (j.data || []).map((m) => m.id);
    must(r.status === 200 && j.object === "list" && ids.includes("d1a-chat"), `HTTP ${r.status}, ids ${JSON.stringify(ids)}`);
    embedId = ids.find((id) => id.includes("embed"));
    return ids.join(", ");
  });
  await check("System One and feedback not on this port", async () => {
    for (const path of ["/v1/systemone", "/v1/systemone/media", "/v1/feedback"]) {
      const r = await post(`${base}${path}`, DECISION);
      must(r.status === 404, `${path} answered HTTP ${r.status}`);
    }
    return "404 x3";
  });
  await check("chat follows an instruction", async () => {
    const c = await complete({ messages: [{ role: "user", content: "Reply with exactly one word: pong" }], max_tokens: 10 });
    must(c.message.role === "assistant" && /pong/i.test(c.message.content), `said ${JSON.stringify(c.message.content)}`);
    return c.message.content;
  });
  await check("chat answers a question", async () => {
    const c = await complete({ messages: [{ role: "system", content: "Answer with the number only." }, { role: "user", content: "What is 17 + 25?" }], max_tokens: 10 });
    must(/\b42\b/.test(c.message.content) && c.finish_reason === "stop", `said ${JSON.stringify(c.message.content)} (${c.finish_reason})`);
    return c.message.content;
  });
  await check("chat stops at a stop string", async () => {
    const c = await complete({ messages: [{ role: "user", content: "Count from 1 to 10, separated by commas." }], max_tokens: 60, stop: ["5"] });
    must(/1/.test(c.message.content) && !c.message.content.includes("5") && c.finish_reason === "stop", `said ${JSON.stringify(c.message.content)} (${c.finish_reason})`);
    return c.message.content;
  });
  await check("streaming", async () => {
    const r = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...chat, temperature: 0, stream: true, max_tokens: 40, messages: [{ role: "user", content: "Count from 1 to 5, separated by spaces." }] }) });
    must(r.status === 200 && (r.headers.get("content-type") || "").startsWith("text/event-stream"), `HTTP ${r.status} ${r.headers.get("content-type")}`);
    byD1A(r.headers.get("x-d1a-route"), r.headers.get("x-d1a-route-error"));
    const events = (await r.text()).split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6));
    must(events.at(-1) === "[DONE]", "no [DONE] at the end");
    const chunks = events.slice(0, -1).map((e) => JSON.parse(e)), text = chunks.map((c) => c.choices[0].delta.content || "").join("");
    const pieces = chunks.filter((c) => c.choices[0].delta.content).length;
    must(pieces >= 2 && /1/.test(text) && /5/.test(text) && chunks.at(-1).choices[0].finish_reason, `${pieces} pieces: ${JSON.stringify(text)}`);
    return `${pieces} pieces: ${text.trim()}`;
  });
  await check("tool call", async () => {
    const c = await complete({ messages: [{ role: "user", content: "What's the weather in Tokyo right now?" }], tools: WEATHER, tool_choice: "auto", max_tokens: 100 });
    const call = c.message.tool_calls?.[0];
    must(c.finish_reason === "tool_calls" && call?.function?.name === "get_weather" && /tokyo/i.test(JSON.parse(call.function.arguments).city || ""),
      `finish ${c.finish_reason}, ${JSON.stringify(c.message)}`.slice(0, 300));
    callTokens = c.usage?.completion_tokens;
    return `${call.function.name}(${call.function.arguments})`;
  });
  await check("JSON mode", async () => {
    const c = await complete({ messages: [{ role: "user", content: "Give the capital of Japan as JSON with the key capital." }], response_format: { type: "json_object" }, max_tokens: 60 });
    const text = c.message.content.trim().replace(/^```(json)?/, "").replace(/```$/, "");
    let j; try { j = JSON.parse(text); } catch { must(false, `not JSON: ${JSON.stringify(c.message.content)}`); }
    must(/tokyo/i.test(j.capital || ""), `capital ${JSON.stringify(j.capital)}`);
    return JSON.stringify(j);
  });
  await check("tool call cut off by max_tokens", async () => {   // d1a#278: no half-written Gemma markup in the text
    // the tool call check's request, cut short: at temperature 0 its first CUT tokens are the start of that call (14 tokens on
    // D1A-E4B-it; a cut after its closing "}", at 13, would parse as a complete call). A request to write a file was the old
    // prompt; the router sends it to the large model (#147).
    const CUT = 8;
    must(callTokens > CUT, `the tool call is ${callTokens ?? "an unknown number of"} tokens, so ${CUT} may not cut it`);
    const c = await complete({ messages: [{ role: "user", content: "What's the weather in Tokyo right now?" }], tools: WEATHER, tool_choice: "auto", max_tokens: CUT });
    const text = c.message.content || "";
    must(!text.includes("<|tool_call>") && !text.includes("call:") && !(c.message.tool_calls || []).length && c.finish_reason === "length",
      `finish ${c.finish_reason}, ${JSON.stringify(c.message)}`.slice(0, 300));
    return `finish length at ${CUT} of the call's ${callTokens ?? "?"} tokens, no markup, no partial call`;
  });
  const SENTENCES = ["The cat sat on the mat.", "A cat is sitting on a mat.", "Quarterly revenue grew by eight percent."];
  await check("embeddings", async () => {
    const get = async () => {
      const r = await post(`${base}/v1/embeddings`, { model: embedId || "text-embedding-nomic-embed-text-v1.5", input: SENTENCES });
      must(r.status === 200 && r.json?.data?.length === 3, `HTTP ${r.status}: ${r.text.slice(0, 200)}`);
      return r.json.data.map((d) => d.embedding);
    };
    const [a, b] = [await get(), await get()];
    must(a.every((v) => v.length === a[0].length && Math.abs(norm(v) - 1) < 1e-3), `dims ${a.map((v) => v.length)}, norms ${a.map((v) => norm(v).toFixed(4))}`);
    must(a.every((v, i) => cos(v, b[i]) > 0.99999), "the same input gave different vectors");
    const near = cos(a[0], a[1]), far = cos(a[0], a[2]);
    must(near > far + 0.1, `similar ${near.toFixed(3)} vs unrelated ${far.toFixed(3)}`);
    return `${a[0].length}-d, unit length, repeatable; similar ${near.toFixed(3)} > unrelated ${far.toFixed(3)}`;
  });
  await check("embeddings in base64 (Node SDK, n8n)", async () => {   // d1a#282: the openai Node SDK always asks for base64
    const ask = async (encoding_format) => {
      const r = await post(`${base}/v1/embeddings`, { model: embedId, input: SENTENCES, encoding_format });
      must(r.status === 200, `HTTP ${r.status}`); return r.json.data.map((d) => d.embedding);
    };
    const [b64, flt] = [await ask("base64"), await ask("float")];
    must(b64.every((e) => typeof e === "string"), `base64 asked, got ${typeof b64[0]}`);
    const vecs = b64.map((e) => { const buf = Buffer.from(e, "base64"); return Array.from({ length: buf.length / 4 }, (_, i) => buf.readFloatLE(4 * i)); });
    must(vecs.every((v, i) => v.length === flt[i].length && cos(v, flt[i]) > 0.99999), `dims ${vecs.map((v) => v.length)} vs ${flt.map((v) => v.length)}`);
    return `${vecs[0].length}-d, equal to the float vectors`;
  });
  if (decide) await check("a decision during a chat still answers", async () => {   // one model thread: answered between the chat's tokens (d1a#289) or after it, never forever, and never different
    // a chat of about 80 tokens that the router keeps (#147: it forwards a paragraph to write, and then nothing runs beside the decision)
    let chatEnd;
    const chatting = complete({ messages: [{ role: "user", content: "Count from 1 to 30, separated by spaces." }], max_tokens: 120 })
      .then(() => { chatEnd = performance.now(); return null; }, (e) => e.message);
    await new Promise((ok) => setTimeout(ok, 300));
    const t0 = performance.now();
    const r = await Promise.race([post(`${decide}/v1/systemone`, DECISION, NO_LOG), new Promise((ok) => setTimeout(() => ok(null), waitLimitMs))]);
    const waited = Math.round(performance.now() - t0);
    const chatFailed = await chatting;
    must(!chatFailed, `the chat beside it: ${chatFailed}`);
    must(chatEnd > t0, "the chat ended before the decision was sent");
    must(r && r.status === 200 && r.json?.answers?.sev?.choice, r ? `HTTP ${r.status}` : `no answer within ${waitLimitMs} ms`);
    must(!before || JSON.stringify(r.json.answers) === JSON.stringify(before), `before ${JSON.stringify(before)}, during the chat ${JSON.stringify(r.json.answers)}`);
    return `answered after ${waited} ms, identical to the decision before the chats`;
  });
  if (embedRef) await check("embeddings match the reference", async () => {
    const ref = JSON.parse(readFileSync(embedRef, "utf-8"));
    const r = await post(`${base}/v1/embeddings`, { model: embedId, input: ref.texts });
    must(r.status === 200, `HTTP ${r.status}`);
    const c = r.json.data.map((d, i) => cos(d.embedding, ref.vectors[i]));
    must(Math.min(...c) >= 0.999, `cosine ${c.map((x) => x.toFixed(5)).join(" ")}`);
    return `cosine >= ${Math.min(...c).toFixed(5)} on ${c.length} texts`;
  });
  if (decide) await check("decision unchanged after the chats", async () => {
    must(before, "no decision before the chats");
    const r = await post(`${decide}/v1/systemone`, DECISION, NO_LOG);
    must(r.status === 200, `HTTP ${r.status}`);
    must(JSON.stringify(r.json.answers) === JSON.stringify(before), `before ${JSON.stringify(before)}, after ${JSON.stringify(r.json.answers)}`);
    return "identical";
  });

  for (const r of results) log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(42)} ${String(r.ms).padStart(6)} ms  ${String(r.detail).replace(/\s+/g, " ").slice(0, 110)}`);
  const failed = results.filter((r) => !r.ok).length;
  log(failed ? `FAIL: ${failed} of ${results.length} checks` : `PASS: ${results.length} checks`);
  return { pass: failed === 0, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {   // realpath: run through a symlink (macOS /tmp) it is still the main module
  const args = process.argv.slice(2), opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const base = args[0];
  if (!base || base.startsWith("--")) { console.error("usage: node scripts/openai_smoke.mjs <OpenAI port URL> [--decide <model server URL>] [--embed-ref <file>]"); process.exit(2); }
  const { pass } = await run(base.replace(/\/$/, ""), { decide: opt("--decide"), embedRef: opt("--embed-ref"), waitLimitMs: Number(opt("--wait-limit-ms") || 30000) });
  process.exit(pass ? 0 : 1);
}
