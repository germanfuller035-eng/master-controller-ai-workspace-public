
import unittest
from tools.evals.eval_runner import run_local_evals
class EvalRunnerTests(unittest.TestCase):
    def test_no_external_llm_call_attempted(self):
        result = run_local_evals(); self.assertEqual(result["status"], "PASS"); self.assertFalse(result["external_llm_call_attempted"])
if __name__ == "__main__": unittest.main()
