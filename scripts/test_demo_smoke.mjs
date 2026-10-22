// scripts/demo_smoke.mjs against a stand-in web app: a run where every demo answers but answers differ from the baseline
// exits 3, one where a demo fails exits 1, so mini.sh can tell a moved near tie from a broken server; --baseline names the
// file both --record and the check use. Run: node --test scripts/test_demo_smoke.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SMOKE = join(dirname(fileURLToPath(import.meta.url)), "demo_smoke.mjs");

function answer(q, flip) {   // a well-formed answer; flip picks the other side
  if (q.type === "noul") return { type: "noul", noul: flip ? 0.2 : 0.8 };
  const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i + 1));
  const top = flip ? keys.length - 1 : 0, probabilities = Object.fromEntries(keys.map((k, i) => [k, i === top ? 0.7 : 0.3 / (keys.length - 1)]));
  return q.type === "choice" ? { type: "choice", choice: keys[top], confidence: 0.7, probabilities }
    : { type: "score", score: top + 1, confidence: 0.7, legend: {}, probabilities };
}

// mode: "" answers, "flip" answers every question the other way, "fail" answers the first request with a 500
async function standIn(mode) {
  let n = 0;
  const srv = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const json = (s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
      if (req.url === "/review") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<h1>PR label check</h1>"); }
      if (req.url === "/api/review") return json(404, { error: "review is off" });
      if (req.url !== "/kev/v1/systemone") return json(404, { error: "not here" });
      if (mode === "fail" && n++ === 0) return json(500, { error: "model server down" });
      const { questions } = JSON.parse(raw);
      json(200, { answers: Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, answer(q, mode === "flip")])) });
    });
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  return srv;
}

async function smoke(mode, ...flags) {
  const srv = await standIn(mode);
  try {
    return await new Promise((ok) => execFile(process.execPath, [SMOKE, `http://127.0.0.1:${srv.address().port}`, "--no-media", ...flags],
      { timeout: 120_000 }, (err, stdout, stderr) => ok({ code: err ? err.code : 0, out: stdout + stderr })));
  } finally { srv.close(); }
}

test("a moved answer exits 3, a failed demo 1, both against the --baseline file", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "smoke-")), "baseline.json");
  const rec = await smoke("", "--record", `--baseline=${file}`);
  assert.equal(rec.code, 0, rec.out);
  assert.ok(existsSync(file) && Object.keys(JSON.parse(readFileSync(file, "utf8"))).length > 10);

  const same = await smoke("", `--baseline=${file}`);
  assert.equal(same.code, 0, same.out);
  assert.match(same.out, /PASS: \d+ requests/);

  const flipped = await smoke("flip", `--baseline=${file}`);
  assert.equal(flipped.code, 3, flipped.out);
  assert.match(flipped.out, /CHANGED: \d+ differ from .*baseline\.json \(every demo answered\)/);

  const failed = await smoke("fail", `--baseline=${file}`);
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /FAIL: 1\n.*HTTP 500/);
});
