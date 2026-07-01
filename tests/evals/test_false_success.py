
import unittest
from tools.evals.false_success import evaluate_false_success
class FalseSuccessTests(unittest.TestCase):
    def test_false_success_denied(self): self.assertEqual(evaluate_false_success({"final_status": "PASS", "evidence": []})["decision"], "DENY_FALSE_SUCCESS")
if __name__ == "__main__": unittest.main()
