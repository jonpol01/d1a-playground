"""python3 -m unittest scripts/test_pr_outcomes.py: outcomes() on the label timeline of jonpol01/d1a#136 (2026-10-05), an
issue's (anonymised), and how often main() polls."""
import collections
import io
import json
import subprocess
import sys
import tempfile
import unittest
import urllib.error
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


    def test_severity_is_the_reviewers_only_from_the_review_that_decides_it(self):
        # the same timeline after the review bot started deciding P0-P4 (SEV_REVIEWED_SINCE): a P that stands through its
        # review is its agreement, a P it swaps in is its answer; before that date (the tests above) severity gets none
        later = lambda s: s.replace("2026-10-05", "2026-10-12")
        events = [{**e, "created_at": later(e["created_at"])} for e in EVENTS]
        reviews = [{**r, "submitted_at": later(r["submitted_at"])} for r in REVIEWS]
        calls = [later(c[0]) for c in CALLS]
        def at(i, evs):
            nxt = calls[i + 1] if i + 1 < len(calls) else None
            return dict(outcomes({"ts": calls[i], "head_sha": CALLS[i][1], "applied_labels": D1A}, nxt, evs, reviews, calls))
        self.assertEqual(at(2, events)["reviewer"]["sev"], "P3")
        swapped = events + [{"event": "unlabeled", "label": "P3", "actor": BOT, "created_at": "2026-10-12T12:26:40Z"},
                            {"event": "labeled", "label": "P2", "actor": BOT, "created_at": "2026-10-12T12:26:41Z"}]
        self.assertEqual(at(2, swapped)["reviewer"]["sev"], "P2")
        self.assertNotIn("sev", decide(2)["reviewer"])


class Author(unittest.TestCase):
    def test_the_authors_own_labels_while_opening_the_pr_are_not_a_correction(self):
        """jonpol01/d1a#151 (2026-10-05): an agent session opened the PR as its author and added its labels 13 s after the
        labeler's call. Those are the author's labels, not a person correcting D1A; the same author changing one later is."""
        call = {"ts": "2026-10-05T15:45:18Z", "head_sha": "b254c686", "applied_labels": D1A}
        opening = [ev2("2026-10-05T15:45:31Z", "type/feature"), ev2("2026-10-05T15:45:31Z", "review:blast-contained"), ev2("2026-10-05T15:45:32Z", "P3")]
        self.assertNotIn("human", dict(outcomes(call, None, opening, [], [call["ts"]], author=PERSON)))
        later = opening + [{**ev2("2026-10-05T17:00:00Z", "P3"), "event": "unlabeled"}, ev2("2026-10-05T17:00:01Z", "P1")]
        self.assertEqual(dict(outcomes(call, None, later, [], [call["ts"]], author=PERSON))["human"], {"sev": "P1"})
        self.assertIn("human", dict(outcomes(call, None, opening, [], [call["ts"]], author="someone-else")))   # another person: counts


def ev2(at, label, actor=PERSON):
    return {"event": "labeled", "label": label, "actor": actor, "created_at": at}


class Summary(unittest.TestCase):
    def test_changes_are_counted_per_family_over_closed_windows_only(self):
        now = datetime(2026, 10, 12, tzinfo=timezone.utc)
        calls = [{"ts": "2026-10-05T11:50:13Z", "repo": "o/r", "number": 1, "decision_id": "a", "applied_labels": D1A},
                 {"ts": "2026-10-05T12:00:17Z", "repo": "o/r", "number": 1, "decision_id": "b", "applied_labels": D1A},
                 {"ts": "2026-10-09T00:00:00Z", "repo": "o/r", "number": 1, "decision_id": "c", "applied_labels": D1A}]
        posted = {"a": {"reviewer": {"type": "type/refactor", "blast": "review:blast-broad"}},      # blast changed
                  "b": {"reviewer": {"type": "type/refactor", "blast": "review:blast-contained", "sev": "P3"},
                        "human": {"sev": "P1"}},                                                  # a person changed sev
                  "c": {"human": {"sev": "P0"}}}                                                  # no next call: still open
        s = pr_outcomes.summary(calls, posted, now)
        self.assertEqual(s["blast"], {"closed": 2, "reviewed": 2, "reviewer_changed": 1, "person_changed": 0})
        self.assertEqual(s["type"], {"closed": 2, "reviewed": 2, "reviewer_changed": 0, "person_changed": 0})
        self.assertEqual(s["sev"], {"closed": 2, "reviewed": 1, "reviewer_changed": 0, "person_changed": 1})   # a: no reviewer sev (before the cutover)

    def test_a_prs_last_call_counts_its_review_at_once_and_a_persons_change_once_checking_stops(self):
        """Most PRs get one labeler call: its review bot grade counts as soon as it is posted, and a person's change once
        the call is older than --days (14), when nothing more is checked; before that it is still open."""
        now = datetime(2026, 10, 12, tzinfo=timezone.utc)
        calls = [{"ts": "2026-10-11T00:00:00Z", "repo": "o/r", "number": 2, "decision_id": "d", "applied_labels": D1A},
                 {"ts": "2026-09-20T00:00:00Z", "repo": "o/r", "number": 3, "decision_id": "e", "applied_labels": D1A},
                 {"ts": "2026-10-10T00:00:00Z", "repo": "o/r", "number": 4, "decision_id": "f", "applied_labels": D1A}]
        posted = {"d": {"reviewer": {"type": "type/bug", "blast": "review:blast-contained", "sev": "P2"}},   # one call, graded
                  "e": {"human": {"sev": "P0"}},                                                             # checked to the end
                  "f": {"human": {"sev": "P1"}}}                                                             # still checked
        s = pr_outcomes.summary(calls, posted, now)
        self.assertEqual(s["type"], {"closed": 1, "reviewed": 1, "reviewer_changed": 1, "person_changed": 0})
        self.assertEqual(s["blast"], {"closed": 1, "reviewed": 1, "reviewer_changed": 0, "person_changed": 0})
        self.assertEqual(s["sev"], {"closed": 1, "reviewed": 1, "reviewer_changed": 1, "person_changed": 1})


GH_DATA = {   # what the GitHub API answers for one PR and one issue, trimmed
    "repos/o/r/pulls/7": {"number": 7, "user": {"login": "author1"}},
    "repos/o/r/issues/8": {"number": 8, "user": {"login": "author2"}},
    "repos/o/r/pulls/7/reviews?per_page=100": [{"user": {"login": BOT}, "commit_id": "155bb4ad", "submitted_at": "2026-10-05T12:26:34Z"}],
    "repos/o/r/issues/7/events?per_page=100": [{"event": "labeled", "label": {"name": "P3"}, "actor": {"login": BOT}, "created_at": "2026-10-05T11:45:18Z"}],
    "repos/o/r/issues/8/events?per_page=100": [],
}
RUN = subprocess.run


def fake_gh(cmd, **kw):
    """`gh api <path> --jq <expr>` as gh prints it: jq over the answer, a string result raw (jq -r), anything else as compact JSON."""
    path, expr = cmd[cmd.index("api") + 2], cmd[cmd.index("--jq") + 1]
    out = RUN(["jq", "-rc", expr], input=json.dumps(GH_DATA[path]), capture_output=True, text=True, check=True).stdout
    return subprocess.CompletedProcess(cmd, 0, out, "")


class Gh(unittest.TestCase):
    def test_the_history_readers_parse_what_gh_prints(self):
        """gh prints a string result raw: `--jq .user.login` gave jonpol01, which json.loads refused, so from 2026-10-11 every PR
        was skipped ("Expecting value: line 1 column 1") and no outcome was posted for 11 days."""
        with mock.patch.object(pr_outcomes.subprocess, "run", fake_gh):
            events, reviews, author = pr_outcomes.pr_history("o/r", 7)
            self.assertEqual((author, reviews[0]["commit_id"], events[0]["label"]), ("author1", "155bb4ad", "P3"))
            self.assertEqual(pr_outcomes.issue_history("o/r", 8)[2], "author2")


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
            with mock.patch.object(pr_outcomes, "pr_history", return_value=(EVENTS + [ev("12:30:00", "unlabeled", "P3", PERSON), ev("12:30:01", "labeled", "P1", PERSON)], REVIEWS, PERSON)), \
                 mock.patch("urllib.request.urlopen", fake_open):
                self.assertEqual(pr_outcomes.main(["--decisions", str(decisions), "--state", str(Path(tmp) / "posted.json"), "--log", str(Path(tmp) / "none.jsonl")],
                                                  now=pr_outcomes.ts("2026-10-05T13:00:00Z")), 0)
        self.assertTrue(sent)
        self.assertTrue(all(body["group"] == "jonpol01/d1a#136" and body["decision_id"] == "d-1" for body in sent), sent)

    def run_two(self, fail):
        """Two PRs' decisions, d-1 before d-2; `fail(body)` raises for the posts the server should not take. Returns the exit
        status, the bodies it took and the state file."""
        with tempfile.TemporaryDirectory() as tmp:
            decisions, state = Path(tmp) / "decisions.jsonl", Path(tmp) / "posted.json"
            decisions.write_text("".join(json.dumps({"ts": t, "repo": "jonpol01/d1a", "number": n, "head_sha": "155bb4ad", "decision_id": d,
                                                     "applied_labels": D1A}) + "\n" for t, n, d in
                                         (("2026-10-05T12:20:17Z", 136, "d-1"), ("2026-10-05T12:20:18Z", 137, "d-2"))), encoding="utf-8")
            took = []

            def fake_open(req, timeout):
                body = json.loads(req.data); fail(body); took.append(body)
                return mock.MagicMock(status=200, __enter__=lambda s: s, __exit__=lambda *a: None)
            with mock.patch.object(pr_outcomes, "pr_history", return_value=(EVENTS, REVIEWS, PERSON)), \
                 mock.patch("urllib.request.urlopen", fake_open):
                code = pr_outcomes.main(["--decisions", str(decisions), "--state", str(state), "--log", str(Path(tmp) / "none.jsonl")],
                                        now=pr_outcomes.ts("2026-10-05T13:00:00Z"))
            return code, took, json.loads(state.read_text()) if state.exists() else None

    def test_an_outcome_the_server_refuses_is_skipped_and_the_rest_still_go(self):
        """d1a#320: a decision_id the decision log no longer has (log rotated, FEEDBACK_LOG moved) is a 422, not an outage."""
        def fail(body):
            if body["decision_id"] == "d-1":
                raise urllib.error.HTTPError("http://x/v1/feedback", 422, "Unprocessable Entity", {}, io.BytesIO(b'{"detail":"unknown decision_id"}'))
        code, took, state = self.run_two(fail)
        self.assertEqual(code, 0)
        self.assertEqual({b["decision_id"] for b in took}, {"d-2"})
        self.assertNotIn("d-1", {d for d, got in state.items() if got})   # refused: not recorded as posted
        self.assertTrue(state["d-2"])

    def test_a_stop_keeps_what_this_run_already_posted(self):
        def fail(body):
            if body["decision_id"] == "d-2": raise urllib.error.URLError("connection refused")
        code, took, state = self.run_two(fail)
        self.assertEqual(code, 1)
        self.assertEqual({b["decision_id"] for b in took}, {"d-1"})
        self.assertEqual(state["d-1"], {src: labels for src, labels in ((b["src"], b["labels"]) for b in took)})



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
    def run_main(self, events, found, extra=(), learning=None):
        with tempfile.TemporaryDirectory() as tmp:
            log, calls = Path(tmp) / "decisions.jsonl", Path(tmp) / "calls.jsonl"
            decision_log(log, extra)
            args = ["--learning", str(Path(tmp) / "learning.json")] if learning is not None else []
            if learning is not None: (Path(tmp) / "learning.json").write_text(learning, encoding="utf-8")
            calls.write_text(json.dumps({"ts": "2026-10-05T12:20:17Z", "repo": "owner1/other", "number": 1, "head_sha": "a", "decision_id": None}) + "\n")
            sent = []
            fake_open = lambda req, timeout: (sent.append(json.loads(req.data)), mock.MagicMock(status=200, __enter__=lambda s: s, __exit__=lambda *a: None))[1]
            with mock.patch.object(pr_outcomes, "find_issues", return_value=found) as find, \
                 mock.patch.object(pr_outcomes, "issue_history", return_value=(events, [], "issue-author")), \
                 mock.patch.object(pr_outcomes, "pr_history", side_effect=AssertionError("no PR call to check")), \
                 mock.patch("urllib.request.urlopen", fake_open):
                code = pr_outcomes.main(["--decisions", str(calls), "--log", str(log), "--state", str(Path(tmp) / "posted.json"), *args],
                                        now=pr_outcomes.ts("2026-10-05T16:00:00Z"))
        self.assertEqual(code, 0)
        if find.called: self.assertEqual(find.call_args.args[0], ["owner1"])   # the owners of the labeler's repositories
        return sent

    def test_a_person_setting_an_issues_labels_after_the_call_is_its_outcome(self):
        """Issue calls are found in the decision log by their state's kind, matched to the issue by title and author, and
        resolved by the PR rules without a reviewer: the person's labels between this call and the next."""
        found = {("Ship the daily job", "owner1"): [("owner1/repo", 24)]}
        self.assertEqual(self.run_main(ISSUE_EVENTS, found), [{"decision_id": "i0", "labels": {"type": "type/feature", "sev": "P3"}, "src": "human", "group": "owner1/repo#24"}])
        corrected = ISSUE_EVENTS + [ev("15:52:00", "unlabeled", "P3", "owner1"), ev("15:52:01", "labeled", "P1", "owner1")]   # after the 2nd call
        self.assertEqual([(b["decision_id"], b["labels"]) for b in self.run_main(corrected, found)],
                         [("i0", {"type": "type/feature", "sev": "P3"}), ("i1", {"sev": "P1"})])

    def test_a_replay_of_an_issue_call_is_never_a_call(self):
        """d1a#233: the model server logs a replay of a decision as a decision with replay_of. It takes the original's
        outcomes; posting outcomes to it as well would count the same issue twice."""
        found = {("Ship the daily job", "owner1"): [("owner1/repo", 24)]}
        # logged at 15:47:00, after its original (15:46:03) and before the person's labels (15:47:32): taken for a call, it
        # would close i0's window and take the person's labels
        replay = {"kind": "decision", "id": "replay-of-i0", "ts": ISSUE_CALLS[0] + 57, "run": "r@v0.6", "state": ISSUE_STATE,
                  "answers": {"type": {"choice": "type/feature"}}, "meta": {}, "replay_of": "i0"}
        self.assertEqual(self.run_main(ISSUE_EVENTS, found, extra=[replay]), self.run_main(ISSUE_EVENTS, found))
        self.assertNotIn("replay-of-i0", [b["decision_id"] for b in self.run_main(ISSUE_EVENTS, found, extra=[replay])])

    def test_outcomes_enabled_false_stops_the_run_and_a_broken_file_does_not(self):
        found = {("Ship the daily job", "owner1"): [("owner1/repo", 24)]}
        self.assertEqual(self.run_main(ISSUE_EVENTS, found, learning='{"outcomes": {"enabled": false}}'), [])
        self.assertEqual(len(self.run_main(ISSUE_EVENTS, found, learning="{not json")), 1)   # broken: collection stays on
        self.assertEqual(len(self.run_main(ISSUE_EVENTS, found, learning='{"outcomes": {"enabled": true}}')), 1)

    def test_an_issue_title_that_names_no_single_issue_is_skipped(self):
        two = {("Ship the daily job", "owner1"): [("owner1/repo", 24), ("owner1/fork", 3)]}
        self.assertEqual(self.run_main(ISSUE_EVENTS, two), [])
        self.assertEqual(self.run_main(ISSUE_EVENTS, {}), [])


class Polling(unittest.TestCase):
    """mini.sh runs the collector every 15 minutes; re-reading every PR of the last 14 days on each run was ~67 GitHub
    reads per run on the serving Mac (2026-10-09). Young decisions are polled every run, older ones less often, and a window
    that closed long ago not at all."""

    def polled(self, now, calls, posted=None):
        with tempfile.TemporaryDirectory() as tmp:
            decisions, state = Path(tmp) / "calls.jsonl", Path(tmp) / "posted.json"
            decisions.write_text("".join(json.dumps(c) + "\n" for c in calls), encoding="utf-8")
            state.write_text(json.dumps(posted or {}))
            with mock.patch.object(pr_outcomes, "pr_history", return_value=([], [], None)) as history, \
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
