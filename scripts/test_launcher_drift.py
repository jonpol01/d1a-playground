"""python3 -m unittest scripts/test_launcher_drift.py: demo.sh and demo.ps1 tell the user the same things about the demos
the page has (src/components/use-cases.tsx): the jump list names every demo, the count is right, and the demos that need
--media are the same; demo.sh takes --lmstudio=URL (test_demo_ps1.ps1 checks demo.ps1)."""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAUNCHERS = ("demo.sh", "demo.ps1")
WORDS = {11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen"}


def demo_ids():
    return re.findall(r'^\s*\{ id: "([a-z]+)"', (ROOT / "src/components/use-cases.tsx").read_text(encoding="utf-8"), re.M)


class LauncherBanners(unittest.TestCase):
    def test_jump_list_names_every_demo(self):
        want = ["#" + i for i in demo_ids()]
        self.assertGreater(len(want), 10)
        for name in LAUNCHERS:
            m = re.search(r"jump to one \(([^)]*)\)", (ROOT / name).read_text(encoding="utf-8"))
            self.assertIsNotNone(m, name)
            self.assertEqual(m.group(1).split(), want, name)

    def test_count_and_media_demos_agree(self):
        n = len(demo_ids())
        media = set()
        for name in LAUNCHERS:
            text = (ROOT / name).read_text(encoding="utf-8")
            self.assertTrue(f"all {WORDS[n]} demos" in text, f"{name} does not say 'all {WORDS[n]} demos'")
            media.add(re.search(r"the demos \(([^)]*) need --media\)", text).group(1))
        self.assertEqual(len(media), 1, media)

    def test_demo_sh_takes_lmstudio_equals_url(self):
        # the conflict check runs right after parsing: reaching it means --lmstudio=URL was taken, not refused as unknown
        r = subprocess.run(["bash", str(ROOT / "demo.sh"), "--lmstudio=http://127.0.0.1:1", "--no-server"],
                           capture_output=True, text=True, timeout=30)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("do not go together", r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
