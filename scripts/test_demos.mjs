import assert from "node:assert/strict";
import { test } from "node:test";
import { countWord, MEDIA_DEMO_IDS, visibleDemos } from "../src/lib/demos.ts";

const demos = ["routing", "photo", "voice", "prlabel", "video", "agent"].map((id) => ({ id }));

test("every demo is shown unless MEDIA_DEMOS is 0", () => {
  assert.deepEqual(visibleDemos(demos, undefined), demos);
  assert.deepEqual(visibleDemos(demos, ""), demos);
  assert.deepEqual(visibleDemos(demos, "1"), demos);
});

test("MEDIA_DEMOS=0 hides exactly the photo, voice and video demos", () => {
  const shown = visibleDemos(demos, "0").map((d) => d.id);
  assert.deepEqual(shown, ["routing", "prlabel", "agent"]);
  assert.ok(MEDIA_DEMO_IDS.every((id) => !shown.includes(id)));
});

test("the hero counts in words", () => {
  assert.equal(countWord(11), "Eleven");
  assert.equal(countWord(14), "Fourteen");
  assert.equal(countWord(21), "21");
});
