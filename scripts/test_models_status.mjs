// The routing demo's model chips (src/lib/models-status.ts) and D1A's decision rule (src/lib/route-rule.ts).
// Run: node --test scripts/test_models_status.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { CACHE_MS, chipsFrom, inWindow, parseWindow, resetCache, status } from "../src/lib/models-status.ts";
import { carried, decide, ruleFrom } from "../src/lib/route-rule.ts";
import { card as readCard } from "../src/lib/route-chat.ts";

const LARGE = { name: "large", kind: "openai", model: "gemma-4-31b", min_tier: "medium", max_in_flight: 3, state: "busy", in_flight: 3, waiting: 1 };
const card = (large = LARGE, extra = {}) => ({ run: "x", routes: [{ name: "review", kind: "review", state: "ready" }, large], ...extra });

test("only an allow-list of fields reaches the browser: never a URL, a key or an error text", () => {
  const leaky = { ...LARGE, url: "http://10.1.2.3:5030/v1/chat/completions", key: "sk-secret", error: "connect refused at 10.1.2.3", state: "offline" };
  const chips = chipsFrom(card(leaky, { api_key: "sk-secret", base: "/home/x" }), 600, undefined);
  const text = JSON.stringify(chips);
  for (const bad of ["10.1.2.3", "sk-secret", "refused", "/home/x", "url", "key", "error"]) assert.ok(!text.includes(bad), bad);
  const keys = new Set(chips.flatMap((c) => Object.keys(c)));
  for (const k of keys) assert.ok(["tier", "model", "d1a", "state", "inFlight", "maxInFlight", "waiting", "nightly", "backAt"].includes(k), k);
  assert.deepEqual(chipsFrom(card({ ...LARGE, model: "<script>x</script>" }), 600, undefined).map((c) => c.model), ["D1A", "D1A", "D1A"], "a model name that is not a plain name is not shown");
});

test("min_tier sets which tiers go to the large model; state and counts come from the card", () => {
  assert.deepEqual(chipsFrom(card(), 600, undefined).map((c) => [c.tier, c.model, c.state]),
    [["small", "D1A", "ready"], ["medium", "gemma-4-31b", "busy"], ["large", "gemma-4-31b", "busy"]]);
  const large = chipsFrom(card({ ...LARGE, min_tier: "large" }), 600, undefined);
  assert.deepEqual(large.map((c) => c.model), ["D1A", "D1A", "gemma-4-31b"]);
  assert.deepEqual(chipsFrom(card({ ...LARGE, min_tier: undefined }), 600, undefined).map((c) => c.model), ["D1A", "D1A", "gemma-4-31b"], "d1a's default is large");
  assert.equal(large[2].inFlight, 3); assert.equal(large[2].waiting, 1); assert.equal(large[2].maxInFlight, 3);
  assert.equal(chipsFrom(card({ ...LARGE, state: "sleepy" }), 600, undefined)[2].state, "unknown", "an older or odd state reads unknown");
  assert.deepEqual(chipsFrom({ routes: [] }, 600, undefined).map((c) => c.model), ["D1A", "D1A", "D1A"], "no large route: D1A answers every tier");
  assert.equal(chipsFrom(null, 600, undefined)[0].state, "offline", "no card: D1A itself is not answering");
});

test("offline inside the operator's nightly window says so, with when it is back; never outside it or when not offline", () => {
  assert.deepEqual(parseWindow("20:30-03:30"), { start: 1230, end: 210, endText: "03:30" });
  for (const bad of ["", undefined, "20:30", "25:00-03:00", "8:30-9:00"]) assert.equal(parseWindow(bad), null, String(bad));
  const w = parseWindow("20:30-03:30");
  assert.ok(inWindow(w, 21 * 60) && inWindow(w, 2 * 60) && !inWindow(w, 4 * 60) && !inWindow(w, 20 * 60));
  const off = { ...LARGE, state: "offline" };
  assert.deepEqual(pick(chipsFrom(card(off), 22 * 60, "20:30-03:30")[2]), { nightly: true, backAt: "03:30" });
  assert.deepEqual(pick(chipsFrom(card(off), 14 * 60, "20:30-03:30")[2]), {}, "offline in the day: just offline");
  assert.deepEqual(pick(chipsFrom(card(), 22 * 60, "20:30-03:30")[2]), {}, "busy at night: busy");
});
const pick = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => k === "nightly" || k === "backAt"));

test("the status path reads only the card, never a chat, and at most once per CACHE_MS", async () => {
  resetCache();
  const calls = []; let t = 1_000_000;
  const deps = { env: { MODEL_API: "http://m", ROUTE_DEMO: "1" }, readKey: async () => "k", fetch: async (url, init) => { calls.push([url, init?.method ?? "GET"]); return Response.json({ models: [card()] }); } };
  const go = () => status(() => readCard(deps), deps.env, () => t);
  const a = await go();
  t += CACHE_MS - 1; await go();
  t += 2; const b = await go();
  assert.deepEqual(calls, [["http://m/v1/models", "GET"], ["http://m/v1/models", "GET"]]);
  assert.equal(a.chips[2].model, "gemma-4-31b"); assert.deepEqual(a, b);
});

test("D1A's decision is the fail-up tier, with the card's thresholds", () => {
  const rule = ruleFrom({ route_rule: { small: 0.7, medium: 0.5 } });
  assert.equal(decide({ small: 0.59, medium: 0.41, large: 0 }, rule), "medium", "the Summary example: most likely small, but under 0.70");
  assert.equal(decide({ small: 0.91, medium: 0.08, large: 0.01 }, rule), "small");
  assert.equal(decide({ small: 0.2, medium: 0.2, large: 0.6 }, rule), "large");
  assert.deepEqual(ruleFrom({ route_rule: { small: 0.8547, medium: 0.5 } }), { small: 0.8547, medium: 0.5 }, "the card's own numbers");
  const fallback = ruleFrom({ temperature: 1.78, use_case_temperatures: { routing: 0.85 } });
  assert.ok(Math.abs(fallback.small - carried(0.7, 1.78 / 0.85)) < 1e-12 && fallback.medium === 0.5, "a card without route_rule: d1a's defaults at its routing temperature");
  assert.deepEqual(ruleFrom(null), { small: 0.7, medium: 0.5 });
});

test("only where the routing demo is on, and callers arriving together share one read of the card", async () => {
  resetCache();
  let reads = 0, release;
  const gate = new Promise((r) => { release = r; });
  const readCard = async () => { reads++; await gate; return card(); };
  assert.deepEqual(await status(readCard, {}), { chips: [] });
  assert.equal(reads, 0, "ROUTE_DEMO off: the card is not read");
  const many = Array.from({ length: 20 }, () => status(readCard, { ROUTE_DEMO: "1" }));
  release();
  const out = await Promise.all(many);
  assert.equal(reads, 1, "20 callers at once: one read");
  assert.ok(out.every((o) => o.chips[2].model === "gemma-4-31b"));
});
