// The human check's rules (src/lib/review.ts, d1a-playground#29), on synthetic decision logs: which decisions are shown,
// how the sample is stratified, what a posted answer turns into. Run: node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { candidates, feedbackBody, parseJsonl, prFields, sample, TARGET } from "../src/lib/review.ts";

const criteria = (keys) => ({ criteria: Object.fromEntries(keys.map((k) => [k, k])) });
const QS = { type: criteria(["type/bug", "type/feature", "type/docs"]), blast: criteria(["review:blast-contained", "review:blast-broad"]),
             sev: criteria(["P0", "P1", "P2", "P3", "P4"]) };
const pick = (type, blast, sev = "P3") => ({ type: { choice: type }, blast: { choice: blast }, sev: { choice: sev } });
const state = (n) => `title: PR ${n}\nauthor: someone\nstats: +1/-1 files=1\nbody:\n${"x".repeat(7000)}\nfiles:\nsrc/a.py (+1/-1)`;

function decision(id, ts, answers, extra = {}) { return { kind: "decision", id, ts, state: state(id), questions: QS, answers, meta: {}, ...extra }; }
function outcome(id, ts, labels, src, group) { return { kind: "outcome", id, ts, labels, meta: { src, ...(group && { group }) } }; }

function log(nAgree, nDisagree) {
  const ev = [];
  for (let i = 0; i < nAgree + nDisagree; i++) {
    const id = `d${i}`, agree = i < nAgree;
    ev.push(decision(id, i, pick("type/bug", "review:blast-contained")));
    ev.push(outcome(id, i + 0.5, { type: agree ? "type/bug" : "type/feature", blast: "review:blast-contained" }, "reviewer", `o/r#${i}`));
  }
  return ev;
}

test("only reviewer-resolved labeler decisions, the latest per pull request, with its group", () => {
  const ev = [
    decision("a1", 1, pick("type/bug", "review:blast-contained")), outcome("a1", 2, { type: "type/docs" }, "reviewer", "o/r#1"),
    decision("a2", 3, pick("type/docs", "review:blast-contained")), outcome("a2", 4, { type: "type/docs" }, "reviewer", "o/r#1"),
    decision("b", 5, pick("type/bug", "review:blast-contained")),                                        // no outcome yet
    decision("c", 6, pick("type/bug", "review:blast-contained")), outcome("c", 7, { sev: "P1" }, "human", "o/r#3"),   // no reviewer outcome
    decision("d", 8, pick("type/bug", "review:blast-broad")), outcome("d", 9, { blast: "review:blast-contained" }, "reviewer"),   // no group: the call log names it
    { ...decision("e", 10, { route: { choice: "x" } }), questions: { route: criteria(["x"]) } }, outcome("e", 11, { route: "x" }, "reviewer", "o/r#5"),
  ];
  const items = candidates(ev, [{ decision_id: "d", repo: "o/r", number: 4, ts: "" }]);
  assert.deepEqual(items.map((i) => [i.decision_id, i.group, i.disagree]).sort(), [["a2", "o/r#1", false], ["d", "o/r#4", true]]);
  assert.equal(candidates(ev).length, 1);                                                                  // without the call log, d has no pull request
  const d = items.find((i) => i.decision_id === "d");
  assert.deepEqual(d.d1a, { type: "type/bug", blast: "review:blast-broad", sev: "P3" });
  assert.deepEqual(d.reviewer, { blast: "review:blast-contained" });
  assert.deepEqual(d.options.blast, ["review:blast-contained", "review:blast-broad"]);
});

test("only the shown fields leave the server: the header, the body and the files, capped", () => {
  const f = prFields(state("x"));
  assert.deepEqual([f.title, f.author, f.stats, f.files], ["PR x", "someone", "+1/-1 files=1", "src/a.py (+1/-1)"]);
  assert.ok(f.body.length === 6002 && f.body.endsWith(" …") && !f.body.includes("files:"));   // the whole body up to a cap, without the files
  assert.equal(prFields("title: t\nbody:\nshort").body, "short");
  assert.deepEqual(prFields({ not: "text" }), { title: "", author: "", stats: "", body: "", files: "" });
  const [item] = candidates(log(1, 0));
  assert.deepEqual(Object.keys(item).sort(), ["d1a", "decision_id", "disagree", "group", "human", "options", "pr", "reviewer"]);
});

test("the sample: half disagree and half agree, a short stratum filled from the other, stable as decisions arrive", () => {
  const big = sample(candidates(log(80, 60)));
  assert.equal(big.length, TARGET);
  assert.equal(big.filter((i) => i.disagree).length, TARGET / 2);
  const few = sample(candidates(log(30, 9)));                                                              // what the Mini has today
  assert.deepEqual([few.length, few.filter((i) => i.disagree).length], [39, 9]);
  const short = sample(candidates(log(10, 70)));
  assert.deepEqual([short.length, short.filter((i) => i.disagree).length], [50, 40]);
  assert.deepEqual(sample(candidates(log(80, 60))).map((i) => i.decision_id), big.map((i) => i.decision_id));   // a reload shows the same list
  // an answered decision stays in the sample when many new ones arrive
  const answered = candidates(log(3, 3)).map((i) => i.decision_id);
  const ev = [...log(200, 200), ...answered.map((id, k) => outcome(id, 1e6 + k, {}, "human", `o/r#${id.slice(1)}`))];
  const ids = sample(candidates(ev)).map((i) => i.decision_id);
  assert.ok(answered.every((id) => ids.includes(id)));
});

test("a human answer marks a decision checked and is kept over the reviewer's, per question", () => {
  const ev = [...log(1, 0), outcome("d0", 5, { sev: "P1" }, "human", "o/r#0")];
  const [item] = candidates(ev);
  assert.deepEqual(item.human, { sev: "P1" });
  assert.deepEqual(item.reviewer, { type: "type/bug", blast: "review:blast-contained" });
  assert.deepEqual(candidates([...log(1, 0), outcome("d0", 5, {}, "human", "o/r#0")])[0].human, {});      // all "unsure": checked, nothing changed
  // a new head of a checked pull request does not replace the checked decision
  const later = [decision("new", 9, pick("type/docs", "review:blast-broad")), outcome("new", 10, { type: "type/docs" }, "reviewer", "o/r#0")];
  assert.equal(candidates([...ev, ...later])[0].decision_id, "d0");
  assert.equal(candidates([...log(1, 0), ...later])[0].decision_id, "new");                                // unchecked: the latest head
});

test("a posted answer: only sampled decisions and their own options; unsure left out; src and group from the server", () => {
  const items = sample(candidates(log(2, 2)));
  const id = items[0].decision_id, group = items[0].group;
  assert.deepEqual(feedbackBody(items, { decision_id: id, labels: { type: "type/docs", blast: "unsure", sev: "P0" }, src: "reviewer", group: "evil#1" }),
                   { ok: true, body: { decision_id: id, labels: { type: "type/docs", sev: "P0" }, src: "human", group } });
  assert.deepEqual(feedbackBody(items, { decision_id: id, labels: { type: "unsure", blast: "unsure", sev: "unsure" } }).body.labels, {});
  for (const [bad, why] of [[{ decision_id: "nope", labels: {} }, "not a decision"], [{ decision_id: id, labels: { type: "P0" } }, "not one of its options"],
                            [{ decision_id: id, labels: { route: "x" } }, "unknown question"], [{ decision_id: id, labels: ["type/bug"] }, "must be an object"],
                            [null, "not a decision"]]) {
    const r = feedbackBody(items, bad);
    assert.equal(r.ok, false); assert.match(r.error, new RegExp(why));
  }
});

test("a log line still being written is skipped", () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"b":'), [{ a: 1 }]);
});

test("a replay (d1a#233) is never a decision to check, even though its original's outcomes reach it", () => {
  const ev = [
    decision("a", 1, pick("type/bug", "review:blast-contained")), outcome("a", 2, { type: "type/docs" }, "reviewer", "o/r#1"),
    decision("r", 3, pick("type/docs", "review:blast-contained"), { replay_of: "a", run: "r@v0.6" }),
    outcome("r", 4, { type: "type/docs" }, "reviewer", "o/r#1"),   // even if something posted to the replay, it is not shown
  ];
  assert.deepEqual(candidates(ev).map((i) => i.decision_id), ["a"]);
});

test("the Learning page reads `config show` and keeps only what it shows of a tick report", async () => {
  const { parseShow, summarize } = await import("../src/lib/learning.ts");
  const shown = parseShow('# from: /x/learning.json\n{\n  "version": 1,\n  "promotion": {"auto": false}\n}\n# 2026-10-11 03:27 page: promotion.auto true -> false\n');
  assert.deepEqual(shown, { source: "/x/learning.json", error: null, settings: { version: 1, promotion: { auto: false } } });
  assert.equal(parseShow("# from: f\n# ERROR in the file: promotion.held_out: 0.9 is not allowed\n{\n}\n").error, "promotion.held_out: 0.9 is not allowed");
  const r = summarize({ ts: 1, gate: { reason: "daily at 04:00", report: { type: { fit: 9 } }, power: "type: kept", promoted: [] }, replay: { replayed: 3, left: 0, excluded: {}, candidates: 3 } });
  assert.deepEqual(r.gate, { reason: "daily at 04:00", skipped: undefined, outcomes: undefined, replayed: undefined, promoted: [], written: undefined, auto: undefined, power: "type: kept" });
  assert.equal(r.replay.replayed, 3); assert.equal("report" in r.gate, false);
});
