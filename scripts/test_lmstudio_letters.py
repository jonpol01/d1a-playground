"""python -m unittest scripts/test_lmstudio_letters.py (needs fastapi, httpx, uvicorn): letter_probs, which turns LM Studio's
top logprobs into option probabilities for the --lmstudio mode, and the model id a request may carry."""
import math
import sys
import unittest
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))
from lmstudio_systemone import letter_probs  # noqa: E402
from systemone.api import SystemOneRequest  # noqa: E402


def tok(token, top=None):
    """A logprobs content entry; top is {token: probability}."""
    t = {"token": token, "logprob": 0.0}
    if top is not None: t["top_logprobs"] = [{"token": s, "logprob": math.log(p)} for s, p in top.items()]
    return t


def choice(*content):
    return {"logprobs": {"content": list(content)}}


class LetterProbs(unittest.TestCase):
    def test_first_letter_token_with_spellings_summed_and_renormalized(self):
        # 'B', ' B' and 'b' are one option; D is not offered with three options; the later " A" is ignored
        p = letter_probs(choice(tok("Answer"), tok(":"), tok(" B", {" B": 0.5, "B": 0.2, "b": 0.1, "A": 0.1, "D": 0.1}), tok(" A")), 3)
        for got, want in zip(p, [0.1 / 0.9, 0.8 / 0.9, 0.0]):
            self.assertAlmostEqual(got, want)

    def test_token_without_top_logprobs_counts_alone(self):
        self.assertEqual(letter_probs(choice(tok("C")), 3), [0.0, 0.0, 1.0])

    def test_no_option_letter_is_an_error_not_an_even_split(self):
        # a thinking model can spend max_tokens before it answers; D is past the three offered options
        with self.assertRaises(HTTPException) as e:
            letter_probs(choice(tok("<think>"), tok("Let"), tok(" me"), tok(" D")), 3)
        self.assertEqual(e.exception.status_code, 502)
        self.assertIn("'<think>Let me D'", e.exception.detail)

    def test_no_logprobs_is_an_error(self):
        for c in ({}, {"logprobs": None}, {"logprobs": {"content": None}}, {"logprobs": {"content": []}}):
            with self.assertRaises(HTTPException) as e:
                letter_probs(c, 2)
            self.assertEqual(e.exception.status_code, 502)


class ModelId(unittest.TestCase):
    QUESTIONS = {"q": {"type": "noul", "instructions": "Did it arrive?"}}

    def test_default_is_d1a_latest_and_the_old_id_is_still_accepted(self):
        # the playground sends d1a-latest; a client that still sends the id this endpoint used to answer to is not refused
        self.assertEqual(SystemOneRequest(state="x", questions=self.QUESTIONS).model, "d1a-latest")
        self.assertEqual(SystemOneRequest(state="x", model="kev-latest", questions=self.QUESTIONS).model, "kev-latest")


if __name__ == "__main__":
    unittest.main()
