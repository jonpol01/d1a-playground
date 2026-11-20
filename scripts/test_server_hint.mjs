import assert from "node:assert/strict";
import { test } from "node:test";
import { AWAY_HINT, serverHint } from "../src/lib/server-hint.ts";

const LOCAL = { en: "Start it with ./demo.sh.", ja: "./demo.sh で起動してください。" };

test("on the machine that runs the playground, the hint says how to start the server", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(serverHint(LOCAL, "en", host), LOCAL.en);
    assert.equal(serverHint(LOCAL, "ja", host), LOCAL.ja);
  }
});

test("anywhere else, the hint says to try again later and never points at ./demo.sh", () => {
  for (const host of ["203.0.113.7", "198.51.100.4", "playground.example.com"]) {
    assert.equal(serverHint(LOCAL, "en", host), AWAY_HINT.en);
    assert.equal(serverHint(LOCAL, "ja", host), AWAY_HINT.ja);
  }
  assert.ok(!AWAY_HINT.en.includes("demo.sh") && !AWAY_HINT.ja.includes("demo.sh"));
});
