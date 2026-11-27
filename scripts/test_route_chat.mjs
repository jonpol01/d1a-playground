// The routing demo's Ask (src/lib/route-chat.ts): what a caller may send, the limits, and what the page may show.
// Run: node --test scripts/test_route_chat.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_GLOBAL, ALL_PER_CLIENT, checkBody, clientKey, differs, GLOBAL, Limiter, largeRoute, MAX_TOKENS, outcome, PER_CLIENT, PROMPT_MAX, send, shown, status } from "../src/lib/route-chat.ts";

const CARD = { routes: [{ name: "review", kind: "review", repos: ["o/*"], is_review_min_p: 0.8 }, { name: "large", kind: "openai", model: "gemma-4-31b", max_in_flight: 2, min_tier: "medium" }] };
const LARGE = { name: "large", model: "gemma-4-31b" };

test("only {prompt} is taken: no tools, messages or other fields, nothing empty or too long", () => {
  assert.deepEqual(checkBody({ prompt: "  What's the capital of Australia? " }), { ok: true, prompt: "What's the capital of Australia?" });
  for (const bad of [{ prompt: "hi", tools: [] }, { messages: [{ role: "user", content: "hi" }] }, { prompt: "hi", max_tokens: 9999 }, { prompt: "hi", stream: true }, { prompt: "hi", model: "x" }])
    assert.equal(checkBody(bad).status, 400, JSON.stringify(bad));
  assert.equal(checkBody({ prompt: 3 }).status, 400);
  assert.equal(checkBody({ prompt: "   " }).status, 400);
  assert.equal(checkBody([{ prompt: "hi" }]).status, 400);
  assert.equal(checkBody(null).status, 400);
  assert.equal(checkBody({ prompt: "a".repeat(PROMPT_MAX) }).ok, true);
  assert.equal(checkBody({ prompt: "a".repeat(PROMPT_MAX + 1) }).status, 413);
  assert.equal(checkBody({ prompt: "あ".repeat(PROMPT_MAX) }).ok, true, "characters, not bytes");
});

test("nothing that could reach the review route is sent: a PR link, #number or fenced block", () => {
  for (const p of ["Review https://github.com/o/r/pull/12 please", "look at o/r#12", "fix #3", "```py\nx = 1\n```", "~~~\ncode\n~~~", "see /PULL/4"])
    assert.equal(checkBody({ prompt: p }).status, 400, p);
  assert.equal(checkBody({ prompt: "Use C# for this" }).ok, true, "a # not followed by a digit is fine");
});

test("behind a trusted proxy the client is the last x-forwarded-for hop; otherwise every caller is one client", () => {
  const req = (h) => new Request("http://x/api/route-chat", { method: "POST", headers: h });
  assert.equal(clientKey(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.9" }), true), "10.0.0.9");
  assert.equal(clientKey(req({ "x-forwarded-for": "10.0.0.9" }), true), "10.0.0.9");
  assert.equal(clientKey(req({}), true), "unknown");
  assert.equal(clientKey(req({ "x-forwarded-for": "1.2.3.4" })), "everyone", "the header alone is the caller's own word");
  assert.equal(clientKey(req({ "x-forwarded-for": "5.6.7.8" }), false), "everyone");
});

test("without a trusted proxy, rotating x-forwarded-for does not buy more sends", async () => {
  const L = new Limiter(); const s = server();
  const codes = [];
  for (let i = 0; i < PER_CLIENT.n + 1; i++) codes.push((await send(post({ prompt: "hi" }, { "x-forwarded-for": `10.0.0.${i}` }), deps(s, undefined, L))).status);
  assert.deepEqual(codes, [...Array(PER_CLIENT.n).fill(200), 429]);
  const T = new Limiter(); const trusted = [];
  for (let i = 0; i < PER_CLIENT.n + 1; i++) trusted.push((await send(post({ prompt: "hi" }, { "x-forwarded-for": `10.0.0.${i}` }), deps(s, { ROUTE_DEMO: "1", MODEL_API: "http://m", TRUST_FORWARDED_FOR: "1" }, T))).status);
  assert.deepEqual(trusted, Array(PER_CLIENT.n + 1).fill(200), "behind a trusted proxy each address is its own client");
});

test("every way of naming a pull request or a code block the review route reads is refused", () => {
  for (const p of ["https://github.com/o/r/pull/12/files", "github.com/O/R/pull/7#discussion_r1", "o/r#12", "Owner/Repo#7 please", "   ```diff\n+a\n   ```", "~~~\nx\n~~~", "review this:\n```\nx\n```"])
    assert.equal(checkBody({ prompt: p }).status, 400, p);
});

test("limits: 5 per client per 10 minutes, 30 for everyone per hour, one at a time", () => {
  let t = 0; const L = new Limiter(() => t);
  for (let i = 0; i < PER_CLIENT.n; i++) { const s = L.take("a"); assert.ok(s.ok); s.release(); }
  const sixth = L.take("a"); assert.equal(sixth.ok, false); assert.equal(sixth.why, "client"); assert.equal(sixth.retryAfterS, PER_CLIENT.ms / 1000);
  t += PER_CLIENT.ms; const later = L.take("a"); assert.ok(later.ok); later.release();
  let n = PER_CLIENT.n + 1;   // a's six so far count for everyone too
  t = GLOBAL.ms - 1;          // still inside the hour of the first five
  for (let c = 0; n < GLOBAL.n; c++) { const s = L.take(`c${c}`); assert.ok(s.ok, `client c${c}`); s.release(); n++; }
  const over = L.take("fresh"); assert.equal(over.ok, false); assert.equal(over.why, "everyone");
  t += GLOBAL.ms; const ok = L.take("fresh"); assert.ok(ok.ok);
  const second = L.take("other"); assert.equal(second.ok, false); assert.equal(second.why, "busy", "one in flight");
  ok.release(); ok.release();   // a second release changes nothing
  const third = L.take("other"); assert.ok(third.ok); third.release();
});

test("the large route is read from the card", () => {
  assert.deepEqual(largeRoute(CARD), LARGE);
  assert.equal(largeRoute({ routes: [CARD.routes[0]] }), null);
  assert.equal(largeRoute({}), null);
  assert.equal(largeRoute(null), null);
});

test("'forwarded' only for a clean large answer; a fallback says so; another route's text is never shown", () => {
  assert.deepEqual(shown("large", null, "gemma-4-31b", " Canberra. ", LARGE), { who: "large", answer: "Canberra." });
  assert.deepEqual(shown("large", "busy", "d1a-chat", "Canberra.", LARGE), { who: "d1a", answer: "Canberra.", note: "fallback" });
  assert.deepEqual(shown("large", null, "gemma-4-31b", null, LARGE), { who: "none", answer: "", note: "no-answer" }, "a reasoning model's empty content");
  assert.deepEqual(shown("large", null, "d1a-chat", "x", LARGE), { who: "none", answer: "", note: "no-answer" }, "not the large model's name");
  assert.deepEqual(shown("none", null, "d1a-chat", "Canberra.", LARGE), { who: "d1a", answer: "Canberra." });
  assert.deepEqual(shown("review", null, "x", "private review text", LARGE), { who: "none", answer: "", note: "not-shown" });
  assert.deepEqual(shown(null, null, "d1a-chat", "x", LARGE), { who: "none", answer: "", note: "not-shown" });
});

// a model server stand-in: its card, and its chat answer with the route headers
function server({ route = "large", error = null, model = "gemma-4-31b", content = "Canberra.", status: st = 200, card = CARD, throws = null } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/models")) return Response.json({ models: [card] });
    if (throws) throw Object.assign(new Error("x"), { name: throws });
    const h = { "x-d1a-route": route, ...(error ? { "x-d1a-route-error": error } : {}) };
    return Response.json({ model, choices: [{ message: { role: "assistant", content } }] }, { status: st, headers: h });
  };
  return { fetch, calls };
}
const post = (body, h = {}) => new Request("http://x/api/route-chat", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) });
const deps = (s, env = { ROUTE_DEMO: "1", MODEL_API: "http://m" }, limiter = new Limiter()) => ({ env, fetch: s.fetch, limiter, readKey: async () => "k3y\n" });

test("off unless ROUTE_DEMO=1", async () => {
  const s = server();
  assert.equal((await send(post({ prompt: "hi" }), deps(s, {}))).status, 404);
  assert.deepEqual(await (await status(deps(s, {}))).json(), { on: false });
  assert.equal(s.calls.length, 0);
});

test("the chat sent is fixed: one user message, the cap, no tools; the reply says who wrote it", async () => {
  const s = server();
  const r = await send(post({ prompt: "Walk through the race" }), deps(s));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.who, "large"); assert.equal(j.answer, "Canberra."); assert.equal(j.route, "large"); assert.equal(j.large, "gemma-4-31b");
  const chat = s.calls.find((c) => c.url === "http://m/v1/chat/completions");
  assert.deepEqual(JSON.parse(chat.init.body), { model: "d1a-chat", messages: [{ role: "user", content: "Walk through the race" }], max_tokens: MAX_TOKENS });
  assert.equal(chat.init.method, "POST");
});

test("a refused prompt never reaches the model server", async () => {
  const s = server();
  assert.equal((await send(post({ prompt: "review o/r#5" }), deps(s))).status, 400);
  assert.equal((await send(post({ prompt: "x".repeat(PROMPT_MAX + 1) }), deps(s))).status, 413);
  assert.equal((await send(post({ prompt: "hi", tools: [{}] }), deps(s))).status, 400);
  assert.equal(s.calls.length, 0);
});

test("a key file, where the host needs one, goes with both calls; CHAT_API wins over MODEL_API", async () => {
  const s = server({ route: "none", model: "d1a-chat" });
  const j = await (await send(post({ prompt: "hi" }), deps(s, { ROUTE_DEMO: "1", MODEL_API: "http://relay", CHAT_API: "http://direct/", CHAT_KEY_FILE: "/k" }))).json();
  assert.equal(j.who, "d1a");
  assert.deepEqual(s.calls.map((c) => [c.url, c.init.headers.Authorization]), [["http://direct/v1/models", "Bearer k3y"], ["http://direct/v1/chat/completions", "Bearer k3y"]]);
});

test("the slot is released on every path, and a timeout or a dead server is an error, not an answer", async () => {
  const roomy = { n: 99, ms: 60_000 };   // room in both buckets: this test is about the in-flight slot
  const L = new Limiter(undefined, { client: roomy, global: roomy, allClient: roomy, allGlobal: roomy, inFlight: 1 });
  const t = await send(post({ prompt: "hi" }), deps(server({ throws: "TimeoutError" }), undefined, L));
  assert.equal(t.status, 504); assert.match((await t.json()).error, /within 100 s/);
  const d = await send(post({ prompt: "hi" }), deps(server({ throws: "TypeError" }), undefined, L));
  assert.equal(d.status, 504);
  const e = await send(post({ prompt: "hi" }), deps(server({ status: 500 }), undefined, L));
  assert.equal(e.status, 502);
  for (const kind of [{ route: "none", model: "d1a-chat" }, { error: "busy", model: "d1a-chat" }, { route: "review" }, { route: "none", content: "" }])
    assert.equal((await send(post({ prompt: "hi" }), deps(server(kind), undefined, L))).status, 200, JSON.stringify(kind));
  assert.equal((await send(post({ prompt: "hi" }), deps(server(), undefined, L))).status, 200, "the in-flight slot came back each time");
});

test("over a limit: 429 with Retry-After, and no chat is sent", async () => {
  const L = new Limiter(); const held = L.take("someone");
  const s = server();
  const r = await send(post({ prompt: "hi" }, { "x-forwarded-for": "9.9.9.9" }), deps(s, undefined, L));
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "15"); assert.equal((await r.json()).error, "busy");
  assert.ok(!s.calls.some((c) => c.url.endsWith("/chat/completions")));
  held.release();
});

test("a model server with no large route: 503, and GET says the demo is not on", async () => {
  const s = server({ card: { routes: [] } });
  assert.equal((await send(post({ prompt: "hi" }), deps(s))).status, 503);
  assert.deepEqual((await (await status(deps(s))).json()).on, false);
  const on = await (await status(deps(server()))).json();
  assert.equal(on.large, "gemma-4-31b");
  assert.deepEqual(on.limits, { prompt: PROMPT_MAX, perClient: PER_CLIENT, everyone: GLOBAL, allPerClient: ALL_PER_CLIENT, allEveryone: ALL_GLOBAL });
});

// the kinds of reply a send can get, by what the page shows
const KINDS = {
  d1a: { route: "none", model: "d1a-chat", content: "Canberra." },
  large: {},
  fallback: { error: "busy", model: "d1a-chat" },
  "d1a, empty": { route: "none", model: "d1a-chat", content: "" },
  "another route": { route: "review", model: "x" },
  "5xx": { status: 500 },
  timeout: { throws: "TimeoutError" },
  "no server": { throws: "TypeError" },
};

test("only a clean D1A answer gives the tight slot back; a forward, a fallback, another route, an error or a timeout does not", async () => {
  for (const [name, kind] of Object.entries(KINDS)) {
    const L = new Limiter(); const s = server(kind);
    for (let i = 0; i < PER_CLIENT.n; i++) await send(post({ prompt: "hi" }), deps(s, undefined, L));
    const next = await send(post({ prompt: "hi" }), deps(server(KINDS.d1a), undefined, L));
    if (name === "d1a") assert.equal(next.status, 200, "five easy prompts leave the tight bucket untouched");
    else { assert.equal(next.status, 429, name); assert.equal((await next.json()).error, "client", name); }
  }
  // easy prompts between forwards: the five forwards still fit
  const L = new Limiter(); const codes = [];
  for (let i = 0; i < 2 * PER_CLIENT.n; i++) codes.push((await send(post({ prompt: "hi" }), deps(server(KINDS.d1a), undefined, L))).status);
  for (let i = 0; i < PER_CLIENT.n + 1; i++) codes.push((await send(post({ prompt: "hi" }), deps(server(), undefined, L))).status);
  assert.deepEqual(codes, [...Array(2 * PER_CLIENT.n + PER_CLIENT.n).fill(200), 429]);
});

test("a flood of easy prompts stops at the outer bucket, which is never given back", async () => {
  const L = new Limiter(); const codes = [];
  for (let i = 0; i < ALL_PER_CLIENT.n + 1; i++) codes.push(await send(post({ prompt: "hi" }), deps(server(KINDS.d1a), undefined, L)));
  assert.deepEqual(codes.map((r) => r.status), [...Array(ALL_PER_CLIENT.n).fill(200), 429]);
  assert.equal((await codes.at(-1).json()).error, "client-all");
  assert.equal(codes.at(-1).headers.get("retry-after"), String(ALL_PER_CLIENT.ms / 1000));
  // for everyone: 120 an hour across clients (behind a trusted proxy, one address each)
  let t = 0; const G = new Limiter(() => t);
  for (let i = 0; i < ALL_GLOBAL.n; i++) { const s = G.take(`c${Math.floor(i / ALL_PER_CLIENT.n)}`); assert.ok(s.ok, `send ${i}`); s.refund(); s.release(); }
  const over = G.take("fresh"); assert.equal(over.ok, false); assert.equal(over.why, "everyone-all");
  t += ALL_GLOBAL.ms; const ok = G.take("fresh"); assert.ok(ok.ok); ok.release();
});

test("a refund gives back one tight entry, once, and never the outer one", () => {
  const tight = { n: 2, ms: 1000 }, outer = { n: 3, ms: 1000 };
  let t = 0; const L = new Limiter(() => t, { client: tight, global: { n: 99, ms: 1000 }, allClient: outer, allGlobal: { n: 99, ms: 1000 }, inFlight: 1 });
  const a = L.take("a"); a.release(); a.refund(); a.refund();   // a second refund changes nothing
  t++; const b = L.take("a"); assert.ok(b.ok); b.release();
  t++; const c = L.take("a"); assert.ok(c.ok); c.release();
  t++; const d = L.take("a"); assert.equal(d.ok, false); assert.equal(d.why, "client-all", "three sends in all: the outer bucket is full");
  const e = L.take("b"); assert.ok(e.ok); e.release(); e.refund();
  const f = L.take("b"); assert.ok(f.ok); f.release();
  const g = L.take("b"); assert.ok(g.ok); g.release();
  const h = L.take("b"); assert.equal(h.ok, false); assert.equal(h.why, "client-all");
  let u = 0; const M = new Limiter(() => u, { client: tight, global: { n: 99, ms: 1000 }, allClient: outer, allGlobal: { n: 99, ms: 1000 }, inFlight: 1 });
  for (let i = 0; i < 2; i++) { const s = M.take("x"); s.release(); u++; }
  const third = M.take("x"); assert.equal(third.ok, false); assert.equal(third.why, "client", "two kept sends fill the tight bucket");
});

test("the page reads a reply as an answer, nothing sent and why, or sent with no answer", () => {
  const reply = { who: "large", answer: "x", model: "gemma-4-31b", route: "large", routeError: null, large: "gemma-4-31b", ms: 900 };
  assert.deepEqual(outcome(200, reply, "hi"), { phase: "answered", reply });
  assert.deepEqual(outcome(404, { error: "the routing demo is off on this playground" }, "hi"), { phase: "not-sent", why: "off" });
  assert.deepEqual(outcome(503, { error: "the model server routes no chat to a large model" }, "hi"), { phase: "not-sent", why: "off" });
  assert.deepEqual(outcome(413, { error: "too long" }, "hi"), { phase: "not-sent", why: "long" });
  assert.deepEqual(outcome(400, { error: "refused" }, "fix #3"), { phase: "not-sent", why: "trap" });
  assert.deepEqual(outcome(400, { error: "prompt must be text" }, "hi"), { phase: "not-sent", why: "invalid", detail: "prompt must be text" });
  for (const why of ["client", "everyone", "client-all", "everyone-all", "busy"])
    assert.deepEqual(outcome(429, { error: why, retryAfterS: 42 }, "hi"), { phase: "not-sent", why, retryAfterS: 42 });
  assert.deepEqual(outcome(429, { error: "?" }, "hi"), { phase: "not-sent", why: "busy", retryAfterS: 60 });
  assert.deepEqual(outcome(502, { error: "model server: HTTP 500" }, "hi"), { phase: "failed", detail: "model server: HTTP 500" });
  assert.deepEqual(outcome(504, { error: "no answer within 100 s" }, "hi"), { phase: "failed", detail: "no answer within 100 s" });
  assert.deepEqual(outcome(500, null, "hi"), { phase: "failed", detail: "HTTP 500" });
});

test("the pick and the route differ only when small goes up or medium/large stays with D1A", () => {
  const kept = { who: "d1a", answer: "x" }, forwarded = { who: "large", answer: "x" }, fallback = { who: "d1a", answer: "x", note: "fallback" };
  assert.equal(differs("small", kept), false);
  assert.equal(differs("small", forwarded), true, "a close call sent up a tier");
  assert.equal(differs("small", fallback), true, "the router forwarded it; the large model was busy");
  assert.equal(differs("medium", forwarded), false);
  assert.equal(differs("large", forwarded), false);
  assert.equal(differs("large", fallback), false);
  assert.equal(differs("medium", kept), true);
  assert.equal(differs("large", { who: "none", answer: "", note: "no-answer" }), false, "no route to compare");
  assert.equal(differs("small", { who: "none", answer: "", note: "not-shown" }), false);
  assert.equal(differs(null, forwarded), false, "no pick yet");
});
