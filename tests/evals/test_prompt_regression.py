
import unittest
from tools.evals.prompt_regression import compare_expected_output
class PromptRegressionTests(unittest.TestCase):
    def test_prompt_regression_detects_changed_expected_output(self):
        result = compare_expected_output({"expected_output": "expected"}, "changed"); self.assertFalse(result["passed"]); self.assertEqual(result["decision"], "FAIL_REGRESSION")
if __name__ == "__main__": unittest.main()
