
import unittest
from tools.sandbox.egress_policy import evaluate_egress
class EgressPolicyTests(unittest.TestCase):
    def test_egress_deny_by_default(self): self.assertFalse(evaluate_egress("https://example.invalid")["allowed"])
    def test_allowlisted_synthetic_egress_allowed(self): self.assertTrue(evaluate_egress("synthetic://fixture-metadata")["allowed"])
    def test_ssrf_target_denied(self): self.assertFalse(evaluate_egress("http://169.254.169.254/latest")["allowed"])
if __name__ == "__main__": unittest.main()
