// The Architecture page's model diagram draws one bar per backbone layer, the global ones taller. Its captions name the
// layer count and the sliding/global schedule in English and Japanese. A model change that updates one and not the
// other draws the wrong backbone, so this reads both from the source and requires them to agree.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("../src/components/architecture.tsx", import.meta.url), "utf8");
const one = (re) => {
  const all = [...src.matchAll(new RegExp(re, "g"))];
  assert.equal(all.length, 1, `expected one match of ${re}, found ${all.length}`);
  return all[0].slice(1).map(Number);
};

test("the model diagram draws the layer count and schedule its captions name", () => {
  const [bars] = one(/Array\.from\(\{ length: (\d+) \}, \(_, i\) => \{\s*const global = i %/.source);
  const [every, globalAt] = one(/const global = i % (\d+) === (\d+);/.source);
  assert.equal(globalAt, every - 1, "one global layer at the end of each group");
  const [enLayers] = one(/backboneSub: "(\d+) layers/.source);
  const [enSliding, enEvery, enGlobalEvery] = one(/layers: "(\d+) of every (\d+) layers: sliding window \d+ · 1 of (\d+): global"/.source);
  const [jaLayers] = one(/backboneSub: "(\d+) 層/.source);
  const [jaEvery, jaSliding] = one(/layers: "(\d+)層のうち(\d+)層: スライディングウィンドウ/.source);
  for (const n of [enLayers, jaLayers]) assert.equal(n, bars);
  for (const n of [enEvery, enGlobalEvery, jaEvery]) assert.equal(n, every);
  for (const n of [enSliding, jaSliding]) assert.equal(n, every - 1);
});
