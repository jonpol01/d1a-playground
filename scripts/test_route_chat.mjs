// The routing demo's "Send it" (src/lib/route-chat.ts): what a caller may send, the limits, and what the page may show.
// Run: node --test scripts/test_route_chat.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBody, clientKey, GLOBAL, Limiter, largeRoute, MAX_TOKENS, PER_CLIENT, PROMPT_MAX, send, shown, status } from "../src/lib/route-chat.ts";

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

test("the client is the last x-forwarded-for hop: a proxy appends the real peer after what the client wrote", () => {
  const req = (h) => new Request("http://x/api/route-chat", { method: "POST", headers: h });
  assert.equal(clientKey(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.9" })), "10.0.0.9");
  assert.equal(clientKey(req({ "x-forwarded-for": "10.0.0.9" })), "10.0.0.9");
  assert.equal(clientKey(req({})), "unknown");
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
  const L = new Limiter();
  const t = await send(post({ prompt: "hi" }), deps(server({ throws: "TimeoutError" }), undefined, L));
  assert.equal(t.status, 504); assert.match((await t.json()).error, /within 100 s/);
  const d = await send(post({ prompt: "hi" }), deps(server({ throws: "TypeError" }), undefined, L));
  assert.equal(d.status, 504);
  const e = await send(post({ prompt: "hi" }), deps(server({ status: 500 }), undefined, L));
  assert.equal(e.status, 502);
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
  assert.equal((await (await status(deps(server()))).json()).large, "gemma-4-31b");
});
