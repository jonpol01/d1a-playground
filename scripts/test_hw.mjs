// The hardware monitor's fallbacks for hosts that report less (src/lib/hw.ts): an ARM Linux CPU without a model name, a GPU
// that shares the system's memory, whose memory.used reads [N/A], and a model server whose own process the app cannot see.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chipName, gpuAppsMemBytes, hostMemUsedBytes } from "../src/lib/hw.ts";

test("the CPU's own name wins; an unknown one falls back to the machine's product name", () => {
  assert.equal(chipName("Apple M4", "Some Desktop"), "Apple M4");
  assert.equal(chipName("unknown", "Example_GPU_Server\n"), "Example GPU Server");
  assert.equal(chipName("", null), null);
  assert.equal(chipName("unknown", ""), null);
});

test("GPU memory in use is the sum of its processes' memory, or unknown", () => {
  assert.equal(gpuAppsMemBytes("602386, 14903\n658691, 53625\n"), (14903 + 53625) * 1024 ** 2);
  assert.equal(gpuAppsMemBytes(""), null);
  assert.equal(gpuAppsMemBytes(null), null);
  assert.equal(gpuAppsMemBytes("No running processes found"), null);
});

test("memory in use on the machine comes from its total and free share", () => {
  assert.equal(hostMemUsedBytes({ ramBytes: 100, memFreePct: 32 }), 68);
  assert.equal(hostMemUsedBytes({ ramBytes: 100, memFreePct: null }), null);
});
