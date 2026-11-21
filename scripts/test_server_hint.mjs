import assert from "node:assert/strict";
import { test } from "node:test";
import { AWAY_HINT, isMediaPaused, MEDIA_PAUSED, serverHint } from "../src/lib/server-hint.ts";

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

test("a media pause is a 503 whose JSON body says paused; nothing else is", () => {
  assert.ok(isMediaPaused('503: {"paused": true, "detail": "a training run holds the memory"}'));
  for (const msg of ['503: {"paused": false}', '503: {"detail": "loading"}', "503: paused", '502: {"paused": true}',
    "502: D1A server: connect ECONNREFUSED 127.0.0.1:8010", "Failed to fetch", '503: {"paused": "yes"}'])
    assert.ok(!isMediaPaused(msg), msg);
  assert.ok(!MEDIA_PAUSED.en.includes("demo.sh") && !MEDIA_PAUSED.ja.includes("demo.sh"));
});
