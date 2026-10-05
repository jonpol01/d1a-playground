"""Outcomes for the PR labeler's D1A decisions, posted to the model server's POST /v1/feedback.

    python3 scripts/pr_outcomes.py                       # once; mini.sh runs it every 15 minutes when LABEL_OUTCOMES=1
    python3 scripts/pr_outcomes.py --dry-run             # print what it would post

The CTO bot's labeling job asks D1A three choice questions on every open pull request in John's repositories (change
type, blast radius, severity P0-P4) and applies the answers as labels. It writes one line per D1A call to
/Users/Shared/d1a/labeler-decisions.jsonl: ts, repo, number, head_sha, decision_id, applied_labels. Two kinds of outcome
follow on GitHub:
- reviewer: the review bot (another model) re-decides type and blast radius on every head it reviews and sets its own
  labels. Its type/* and review:blast-* labels after its review of the decision's head are that decision's outcome. It
  never sets P0-P4, so severity gets no reviewer outcome.
- human: a person (any account that is not a bot) changing a type, blast-radius or severity label after the decision.
  d1a.feedback ranks these above the reviewer's, whatever arrives last.
A decision's window closes at the next labeler call on the same pull request (a new head), so a later head's labels are
never counted against it. Nothing is written to GitHub. Posted outcomes are remembered in --state, so each is sent once.
"""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

FAMILIES = {"type": lambda l: l.startswith("type/"), "blast": lambda l: l.startswith("review:blast-"),
            "sev": lambda l: l in ("P0", "P1", "P2", "P3", "P4")}
REVIEWER_FAMILIES = ("type", "blast")
REVIEWER = "hermes-prbot[bot]"
SETTLE = timedelta(minutes=2)        # the review bot sets its labels within seconds of posting its review
REVIEW_LEAD = timedelta(minutes=10)  # ... or while writing it
CALL_LEAD = timedelta(seconds=20)    # the labeler writes its labels in the seconds before it logs the call


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def labels_at(events, when):
    """The pull request's labels at `when`, replayed from its labeled/unlabeled events."""
    labels = set()
    for e in sorted(events, key=lambda e: e["created_at"]):
        if ts(e["created_at"]) > when: break
        if e["event"] == "labeled": labels.add(e["label"])
        elif e["event"] == "unlabeled": labels.discard(e["label"])
    return labels


def family_labels(labels, families):
    """{question: label} for each family with exactly one label."""
    out = {}
    for q in families:
        hits = [l for l in labels if FAMILIES[q](l)]
        if len(hits) == 1: out[q] = hits[0]
    return out


def outcomes(decision, next_ts, events, reviews, call_times=()):
    """[(src, {question: label})] for one decision, given its pull request's label events ({event, label, actor,
    created_at}), reviews ({user, commit_id, submitted_at}) and the times of all labeler calls on it. Empty while the
    reviewer has not reviewed the decision's head and no person has touched its labels.

    The reviewer's answer for a question is the last label of that family it adds around its review of the head (from
    REVIEW_LEAD before to SETTLE after posting it); the labeler's own writes land in the CALL_LEAD before each of its
    logged calls and are not the reviewer's. GitHub records no event when a label that is already there is set again,
    so without an add the reviewer kept the label as it stood SETTLE after its review: D1A's (agreement) or its own
    from an earlier head."""
    t0 = ts(decision["ts"]); end = ts(next_ts) if next_ts else None
    calls = [ts(t) for t in call_times]
    out = []
    review = min((r for r in reviews if r["user"] == REVIEWER and r["commit_id"] == decision["head_sha"] and r.get("submitted_at")),
                 key=lambda r: r["submitted_at"], default=None)
    if review is not None:
        tr = ts(review["submitted_at"]); lo, hi = max(t0, tr - REVIEW_LEAD), tr + SETTLE
        got, standing = {}, family_labels(labels_at(events, hi), REVIEWER_FAMILIES)
        for q in REVIEWER_FAMILIES:
            adds = [e for e in sorted(events, key=lambda e: e["created_at"]) if e["event"] == "labeled" and e["actor"] == REVIEWER
                    and FAMILIES[q](e["label"]) and lo <= ts(e["created_at"]) <= hi
                    and not any(c - CALL_LEAD <= ts(e["created_at"]) <= c + timedelta(seconds=2) for c in calls)]
            if adds: got[q] = adds[-1]["label"]
            elif q in standing: got[q] = standing[q]
        if got: out.append(("reviewer", got))
    human = [e for e in events if not e["actor"].endswith("[bot]") and t0 < ts(e["created_at"]) and (end is None or ts(e["created_at"]) < end)
             and any(f(e["label"]) for f in FAMILIES.values())]
    if human:
        touched = [q for q in FAMILIES if any(FAMILIES[q](e["label"]) for e in human)]
        last = max(ts(e["created_at"]) for e in human)
        got = family_labels(labels_at(events, last), touched)
        if got: out.append(("human", got))
    return out


def gh(path):
    r = subprocess.run(["gh", "api", "--paginate", path, "--jq", ".[]"], capture_output=True, text=True, timeout=120)
    if r.returncode != 0: raise RuntimeError(f"gh api {path}: {r.stderr.strip()[:200]}")
    return [json.loads(l) for l in r.stdout.splitlines() if l.strip()]   # one item per line across all pages


def pr_history(repo, number):
    events = [{"event": e["event"], "label": e["label"]["name"], "actor": (e.get("actor") or {}).get("login", ""), "created_at": e["created_at"]}
              for e in gh(f"repos/{repo}/issues/{number}/events?per_page=100") if e["event"] in ("labeled", "unlabeled")]
    reviews = [{"user": (r.get("user") or {}).get("login", ""), "commit_id": r.get("commit_id"), "submitted_at": r.get("submitted_at")}
               for r in gh(f"repos/{repo}/pulls/{number}/reviews?per_page=100")]
    return events, reviews


def post(url, decision_id, labels, src, group):
    """group: the outcome's unit for d1a.feedback promote's clustered bootstrap, "<repo>#<number>", so a PR's
    re-labelled decisions count as one piece of evidence (d1a#148)."""
    body = json.dumps({"decision_id": decision_id, "labels": labels, "src": src, "group": group}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r: return r.status


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--decisions", default="/Users/Shared/d1a/labeler-decisions.jsonl")
    ap.add_argument("--feedback", default="http://127.0.0.1:8009/v1/feedback")
    ap.add_argument("--state", default=str(Path(__file__).resolve().parents[1] / ".demo/feedback/outcomes-posted.json"))
    ap.add_argument("--days", type=float, default=14, help="decisions older than this are no longer checked")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    calls = [json.loads(l) for l in Path(a.decisions).read_text(encoding="utf-8").splitlines() if l.strip()]
    state_path = Path(a.state); posted = json.loads(state_path.read_text()) if state_path.exists() else {}
    by_pr = {}
    for c in sorted(calls, key=lambda c: c["ts"]): by_pr.setdefault((c["repo"], c["number"]), []).append(c)
    since = (datetime.now().astimezone() - timedelta(days=a.days)).isoformat()
    sent = 0
    for (repo, number), seq in by_pr.items():
        todo = [(c, seq[i + 1]["ts"] if i + 1 < len(seq) else None) for i, c in enumerate(seq)
                if c.get("decision_id") and ts(c["ts"]) >= ts(since) and any(src not in posted.get(c["decision_id"], {}) for src in ("reviewer", "human"))]
        if not todo: continue
        try: events, reviews = pr_history(repo, number)
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            print(f"skip {repo}#{number}: {e}", file=sys.stderr); continue
        for c, next_ts in todo:
            done = posted.setdefault(c["decision_id"], {})
            for src, labels in outcomes(c, next_ts, events, reviews, [x["ts"] for x in seq]):
                if done.get(src) == labels: continue
                print(f"{repo}#{number} {c['head_sha'][:8]} {src}: {labels}")
                if not a.dry_run:
                    try: post(a.feedback, c["decision_id"], labels, src, f"{repo}#{number}")
                    except (urllib.error.URLError, OSError) as e:
                        print(f"feedback not reachable ({e}); stopping", file=sys.stderr); return 1
                    done[src] = labels; sent += 1
    if not a.dry_run:
        state_path.parent.mkdir(parents=True, exist_ok=True); state_path.write_text(json.dumps(posted, indent=1) + "\n")
    print(f"{sent} outcomes posted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
