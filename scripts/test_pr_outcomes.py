"""python3 -m unittest scripts/test_pr_outcomes.py: outcomes() on the label timeline of jonpol01/d1a#136 (2026-10-05), an
issue's (anonymised), and how often main() polls."""
import collections
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pr_outcomes  # noqa: E402
from pr_outcomes import outcomes  # noqa: E402

BOT, PERSON = "hermes-prbot[bot]", "jonpol01"
D1A = ["type/refactor", "review:blast-contained", "P3"]
CALLS = [("2026-10-05T11:50:13Z", "4a87ba73"), ("2026-10-05T12:00:17Z", "dfee9afe"), ("2026-10-05T12:20:17Z", "155bb4ad")]
REVIEWS = [{"user": BOT, "commit_id": h, "submitted_at": t} for h, t in
           (("4a87ba73", "2026-10-05T12:00:01Z"), ("dfee9afe", "2026-10-05T12:10:54Z"), ("155bb4ad", "2026-10-05T12:26:34Z"))]


def ev(t, kind, label, actor=BOT):
    return {"event": kind, "label": label, "actor": actor, "created_at": f"2026-10-05T{t}Z"}


EVENTS = [
    ev("11:45:15", "labeled", "type/refactor"), ev("11:45:16", "labeled", "review:blast-contained"), ev("11:45:18", "labeled", "P3"),
    ev("12:00:15", "unlabeled", "review:blast-broad"), ev("12:00:16", "labeled", "review:blast-contained"),   # labeler, new head
    ev("12:00:27", "unlabeled", "review:blast-contained"), ev("12:00:28", "labeled", "review:blast-broad"),   # reviewer, 4a87ba73
    ev("12:20:15", "unlabeled", "review:blast-broad"), ev("12:20:16", "labeled", "review:blast-contained"),   # labeler, new head
]


def decide(i, events=EVENTS):
    t, head = CALLS[i]
    nxt = CALLS[i + 1][0] if i + 1 < len(CALLS) else None
    return dict(outcomes({"ts": t, "head_sha": head, "applied_labels": D1A}, nxt, events, REVIEWS, [c[0] for c in CALLS]))


class Outcomes(unittest.TestCase):
    def test_reviewer_labels_after_its_review_of_the_same_head(self):
        # its "broad" lands 11 s after the labeler's next call and is still its answer for the head it reviewed
        self.assertEqual(decide(0), {"reviewer": {"type": "type/refactor", "blast": "review:blast-broad"}})
        # it set nothing new for dfee9afe: GitHub has no event for a label set again, so its own earlier "broad" stands
        self.assertEqual(decide(1), {"reviewer": {"type": "type/refactor", "blast": "review:blast-broad"}})
        # nothing changed after the last review: the reviewer agreed with D1A
        self.assertEqual(decide(2), {"reviewer": {"type": "type/refactor", "blast": "review:blast-contained"}})

    def test_no_reviewer_outcome_before_the_review_and_a_person_overrides_in_window(self):
        early = dict(outcomes({"ts": CALLS[2][0], "head_sha": "notreviewed", "applied_labels": D1A}, None, EVENTS, REVIEWS, [c[0] for c in CALLS]))
        self.assertEqual(early, {})
        edited = EVENTS + [ev("12:30:00", "unlabeled", "P3", PERSON), ev("12:30:01", "labeled", "P1", PERSON)]
        self.assertEqual(decide(2, edited)["human"], {"sev": "P1"})
        self.assertNotIn("human", decide(1, edited))      # after the next call: that edit is about a later head


class Posting(unittest.TestCase):
    def test_each_outcome_is_posted_with_its_pr_as_the_group(self):
        """d1a.learning.feedback promote bootstraps over groups: every outcome of one PR carries group "<repo>#<number>"."""
        with tempfile.TemporaryDirectory() as tmp:
            decisions = Path(tmp) / "decisions.jsonl"
            now = "2099-01-01T00:00:00Z"
            decisions.write_text(json.dumps({"ts": "2026-10-05T12:20:17Z", "repo": "jonpol01/d1a", "number": 136, "head_sha": "155bb4ad",
                                             "decision_id": "d-1", "applied_labels": D1A}) + "\n", encoding="utf-8")
            sent = []
            fake_open = lambda req, timeout: (sent.append(json.loads(req.data)), mock.MagicMock(status=200, __enter__=lambda s: s, __exit__=lambda *a: None))[1]
            with mock.patch.object(pr_outcomes, "pr_history", return_value=(EVENTS + [ev("12:30:00", "unlabeled", "P3", PERSON), ev("12:30:01", "labeled", "P1", PERSON)], REVIEWS)), \
                 mock.patch("urllib.request.urlopen", fake_open):
                self.assertEqual(pr_outcomes.main(["--decisions", str(decisions), "--state", str(Path(tmp) / "posted.json"), "--log", str(Path(tmp) / "none.jsonl")],
                                                  now=pr_outcomes.ts("2026-10-05T13:00:00Z")), 0)
        self.assertTrue(sent)
        self.assertTrue(all(body["group"] == "jonpol01/d1a#136" and body["decision_id"] == "d-1" for body in sent), sent)



# An issue the labeler labelled (2026-10-05, repo and people anonymised; times relative to its call kept): it logs the call,
# writes its labels as the review bot's account, and the owner sets type and severity himself 89 s later.
ISSUE_CALLS = [1791215163.2, 1791215443.6]   # 15:46:03 and 15:50:43 UTC: a second call on the same issue closes the window
ISSUE_EVENTS = [ev("15:46:04", "labeled", "type/feature"), ev("15:46:06", "labeled", "P3"),
                ev("15:47:32", "labeled", "type/feature", "owner1"), ev("15:47:32", "labeled", "P3", "owner1"),
                ev("15:47:32", "labeled", "owner: dev", "owner1")]
ISSUE_STATE = "title: Ship the daily job\nauthor: owner1\nkind: github-issue\nbody:\nWhat: run it daily."


def decision_log(path, extra=()):
    """A model server decision log: the two issue calls, a PR call and a demo's request (neither an issue's)."""
    answers = {"type": {"choice": "type/feature"}, "sev": {"choice": "P3"}}
    rows = [{"kind": "decision", "id": f"i{i}", "ts": t, "run": "r@v0.5", "state": ISSUE_STATE, "answers": answers, "meta": {}}
            for i, t in enumerate(ISSUE_CALLS)]
    rows += [{"kind": "decision", "id": "pr", "ts": ISSUE_CALLS[0], "state": "title: x\nauthor: owner1\nstats: +1/-0\nbody:\n", "meta": {}},
             {"kind": "decision", "id": "demo", "ts": ISSUE_CALLS[0], "state": "Order A-1182, delivered 3 days ago.", "meta": {}}, *extra]
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")


class Issues(unittest.TestCase):
    def run_main(self, events, found):
        with tempfile.TemporaryDirectory() as tmp:
            log, calls = Path(tmp) / "decisions.jsonl", Path(tmp) / "calls.jsonl"
            decision_log(log)
            calls.write_text(json.dumps({"ts": "2026-10-05T12:20:17Z", "repo": "owner1/other", "number": 1, "head_sha": "a", "decision_id": None}) + "\n")
            sent = []
            fake_open = lambda req, timeout: (sent.append(json.loads(req.data)), mock.MagicMock(status=200, __enter__=lambda s: s, __exit__=lambda *a: None))[1]
            with mock.patch.object(pr_outcomes, "find_issues", return_value=found) as find, \
                 mock.patch.object(pr_outcomes, "issue_history", return_value=(events, [])), \
                 mock.patch.object(pr_outcomes, "pr_history", side_effect=AssertionError("no PR call to check")), \
                 mock.patch("urllib.request.urlopen", fake_open):
                code = pr_outcomes.main(["--decisions", str(calls), "--log", str(log), "--state", str(Path(tmp) / "posted.json")],
                                        now=pr_outcomes.ts("2026-10-05T16:00:00Z"))
        self.assertEqual(code, 0)
        self.assertEqual(find.call_args.args[0], ["owner1"])   # the owners of the labeler's repositories
        return sent

    def test_a_person_setting_an_issues_labels_after_the_call_is_its_outcome(self):
        """Issue calls are found in the decision log by their state's kind, matched to the issue by title and author, and
        resolved by the PR rules without a reviewer: the person's labels between this call and the next."""
        found = {("Ship the daily job", "owner1"): [("owner1/repo", 24)]}
        self.assertEqual(self.run_main(ISSUE_EVENTS, found), [{"decision_id": "i0", "labels": {"type": "type/feature", "sev": "P3"}, "src": "human", "group": "owner1/repo#24"}])
        corrected = ISSUE_EVENTS + [ev("15:52:00", "unlabeled", "P3", "owner1"), ev("15:52:01", "labeled", "P1", "owner1")]   # after the 2nd call
        self.assertEqual([(b["decision_id"], b["labels"]) for b in self.run_main(corrected, found)],
                         [("i0", {"type": "type/feature", "sev": "P3"}), ("i1", {"sev": "P1"})])

    def test_an_issue_title_that_names_no_single_issue_is_skipped(self):
        two = {("Ship the daily job", "owner1"): [("owner1/repo", 24), ("owner1/fork", 3)]}
        self.assertEqual(self.run_main(ISSUE_EVENTS, two), [])
        self.assertEqual(self.run_main(ISSUE_EVENTS, {}), [])


class Polling(unittest.TestCase):
    """mini.sh runs the collector every 15 minutes; re-reading every PR of the last 14 days on each run was ~67 GitHub
    reads per run on the Mac mini (2026-10-09). Young decisions are polled every run, older ones less often, and a window
    that closed long ago not at all."""

    def polled(self, now, calls, posted=None):
        with tempfile.TemporaryDirectory() as tmp:
            decisions, state = Path(tmp) / "calls.jsonl", Path(tmp) / "posted.json"
            decisions.write_text("".join(json.dumps(c) + "\n" for c in calls), encoding="utf-8")
            state.write_text(json.dumps(posted or {}))
            with mock.patch.object(pr_outcomes, "pr_history", return_value=([], [])) as history, \
                 mock.patch.object(pr_outcomes, "find_issues", side_effect=AssertionError("no issue calls")):
                pr_outcomes.main(["--decisions", str(decisions), "--state", str(state), "--log", str(Path(tmp) / "none.jsonl"), "--dry-run"], now=now)
        return sorted(c.args[1] for c in history.call_args_list)

    def test_young_decisions_every_run_older_ones_backed_off_closed_windows_never(self):
        t0 = datetime(2026, 10, 9, 0, 0, tzinfo=timezone.utc)
        call = lambda n, age, did, head="h": {"ts": (t0 - age).isoformat(), "repo": "o/r", "number": n, "head_sha": head, "decision_id": did}
        calls = [call(1, timedelta(hours=2), "young"), call(2, timedelta(days=2), "two-days"), call(3, timedelta(days=5), "five-days"),
                 call(4, timedelta(days=5), "closed"), call(4, timedelta(days=4), "closer", "h2")]
        # PR 4: its first window closed 4 days ago with no person's label in it, and the second has both outcomes
        posted = {"closed": {"reviewer": {"type": "type/bug"}}, "closer": {"reviewer": {"type": "type/bug"}, "human": {"sev": "P2"}}}
        runs = collections.Counter(n for i in range(24) for n in self.polled(t0 + i * timedelta(minutes=15), calls, posted))
        self.assertEqual(runs, {1: 24, 2: 6, 3: 1})   # 6 hours of runs: every one, hourly, once; never PR 4


if __name__ == "__main__":
    unittest.main()
