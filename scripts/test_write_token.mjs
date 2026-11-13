// How the pages send the write token (src/lib/write-token.ts): the stored one goes with each call; a refusal that asks for
// it forgets a stored one, asks once and tries once more; only a token the server took is kept. Run: node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenFetch } from "../src/lib/write-token.ts";

const TOKEN = "0123456789abcdef0123";
const refuse = () => new Response("{}", { status: 401, headers: { "www-authenticate": "Bearer" } });

// a server that takes `accept` (null: takes anything), a browser store, and a person who answers `answers` in turn
function setup({ stored = null, answers = [], accept = TOKEN, other = null } = {}) {
  const sent = [], asked = [], kept = new Map(stored ? [["d1a-write-token", stored]] : []);
  const deps = {
    fetch: async (url, init) => {
      const auth = new Headers(init.headers).get("authorization");
      sent.push({ auth, type: new Headers(init.headers).get("content-type"), method: init.method });
      if (other) return other();
      return accept === null || auth === `Bearer ${accept}` ? Response.json({ ok: true }) : refuse();
    },
    storage: { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v), removeItem: (k) => kept.delete(k) },
    ask: (m) => { asked.push(m); return answers.shift() ?? null; },
  };
  return { deps, sent, asked, kept };
}
const call = (deps) => tokenFetch("/d1a/api/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, deps);

test("a stored token goes with the call, with the call's own headers, and nobody is asked", async () => {
  const s = setup({ stored: TOKEN });
  assert.equal((await call(s.deps)).status, 200);
  assert.deepEqual(s.sent, [{ auth: `Bearer ${TOKEN}`, type: "application/json", method: "POST" }]);
  assert.deepEqual(s.asked, []);
});

test("no token on a server without one: one call, no header, nobody asked", async () => {
  const s = setup({ accept: null });
  assert.equal((await call(s.deps)).status, 200);
  assert.deepEqual(s.sent.map((x) => x.auth), [null]);
  assert.deepEqual(s.asked, []);
  assert.equal(s.kept.size, 0);
});

test("refused for want of a token: asks once, tries once more, keeps the token the server took", async () => {
  const s = setup({ answers: [` ${TOKEN} `] });
  assert.equal((await call(s.deps)).status, 200);
  assert.deepEqual(s.sent.map((x) => x.auth), [null, `Bearer ${TOKEN}`]);
  assert.equal(s.asked.length, 1);
  assert.equal(s.kept.get("d1a-write-token"), TOKEN);
});

test("a stored token the server refuses is forgotten, and a cancelled prompt returns the refusal without another call", async () => {
  const s = setup({ stored: "old-token-0000000000" });
  assert.equal((await call(s.deps)).status, 401);
  assert.equal(s.sent.length, 1);
  assert.match(s.asked[0], /refused/);
  assert.equal(s.kept.size, 0);
});

test("a wrong answer is tried once and not kept", async () => {
  const s = setup({ answers: ["wrong-token-00000000", TOKEN] });
  assert.equal((await call(s.deps)).status, 401);
  assert.equal(s.sent.length, 2);
  assert.equal(s.asked.length, 1);
  assert.equal(s.kept.size, 0);
});

test("a 401 that does not ask for a bearer token, and any other refusal, come back as they are", async () => {
  for (const other of [() => new Response("{}", { status: 401 }), () => new Response("{}", { status: 403 }), () => Response.json({ error: "off" }, { status: 404 })]) {
    const s = setup({ other });
    assert.equal((await call(s.deps)).status, other().status);
    assert.equal(s.sent.length, 1);
    assert.deepEqual(s.asked, []);
  }
});

test("blocked storage: still asks and sends, keeps nothing, never throws", async () => {
  const s = setup({ answers: [TOKEN] });
  s.deps.storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal((await call(s.deps)).status, 200);
  assert.deepEqual(s.sent.map((x) => x.auth), [null, `Bearer ${TOKEN}`]);
});
