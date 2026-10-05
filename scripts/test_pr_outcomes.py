"""python3 -m unittest scripts/test_pr_outcomes.py: outcomes() on the label timeline of jonpol01/d1a#136 (2026-10-05)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
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


if __name__ == "__main__":
    unittest.main()
