"""Pull-request checks (the same patterns as jonpol01/d1a's d1a/core/hygiene.py):
    ... commit messages | python3 scripts/check_hygiene.py attribution     # plus the PR body via $BODY
    git diff -U0 origin/main...HEAD | python3 scripts/check_hygiene.py paths
    python3 scripts/check_hygiene.py pins                                  # mini.sh, demo.sh and demo.ps1 pin the same D1A
Exit 1 with a line per finding."""
import hashlib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# the build machines' home folders, by the sha256 of their user name, so this file names no one; other people's paths
# pass. The other patterns are split so this file never holds one of the paths it looks for.
OWN_HOMES = {"96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a",
             "b2b5d2b6d117e164f8f6e551cccdbdca2e3d5014432008463b924c047d83ff0a"}
HOME_PATH = re.compile(r"(?=/Users/([^/\s\"'`]+))", re.I)   # a lookahead: every /Users/ is read, even inside another path
LOCAL_OTHER = re.compile(r"/private/tmp/" r"claude-" "|" r"/Vol" r"umes/")


def is_local_path(line):
    return bool(LOCAL_OTHER.search(line)) or any(hashlib.sha256(m.group(1).lower().encode()).hexdigest() in OWN_HOMES
                                                 for m in HOME_PATH.finditer(line))
ATTRIBUTION = re.compile(r"(?im)^\s*co-authored-by:.*\b(claude|anthropic)\b|^\W*generated with \[?claude code")   # line starts only: a sentence describing the rule is not attribution
PINS = {"mini.sh": r'^D1A_SHA="([0-9a-f]{40})"', "demo.sh": r'^D1A_SHA="([0-9a-f]{40})"', "demo.ps1": r"^\$D1aSha = '([0-9a-f]{40})'"}


def attribution(text):
    return [m.group(0).strip() for m in ATTRIBUTION.finditer(text or "")]


def local_paths_in_diff(diff):
    out, path = [], None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else line[4:]
        elif line.startswith("+") and not line.startswith("+++") and is_local_path(line):
            out.append((path, line[1:].strip()[:160]))
    return out


def pins(root=ROOT):
    """{file: the D1A commit it pins, or None when the pin line is missing}."""
    out = {}
    for name, pat in PINS.items():
        m = re.search(pat, (Path(root) / name).read_text(encoding="utf-8"), re.M)
        out[name] = m.group(1) if m else None
    return out


def main(argv):
    if argv[:1] == ["attribution"]:
        hits = attribution(sys.stdin.read() + "\n" + os.environ.get("BODY", ""))
        for h in hits: print(f"::error::AI attribution: {h}")
    elif argv[:1] == ["paths"]:
        hits = local_paths_in_diff(sys.stdin.read())
        for f, line in hits: print(f"::error file={f}::a local path in an added line: {line}")
    elif argv[:1] == ["pins"]:
        p = pins(); hits = [] if None not in p.values() and len(set(p.values())) == 1 else [p]
        print(f"::error::the D1A pin differs between launchers: {p}" if hits else f"D1A pinned to {next(iter(p.values()))} everywhere")
    else:
        sys.exit("usage: check_hygiene.py attribution|paths|pins")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
