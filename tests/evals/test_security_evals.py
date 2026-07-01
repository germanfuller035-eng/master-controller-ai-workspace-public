
import unittest
from tools.evals.security_evals import run_security_case
class SecurityEvalTests(unittest.TestCase):
    def test_prompt_injection_denied(self): self.assertEqual(run_security_case({"attack_type": "prompt_injection"})["decision"], "DENY")
    def test_excessive_agency_denied(self): self.assertEqual(run_security_case({"attack_type": "excessive_agency"})["decision"], "DENY")
    def test_ssrf_denied(self): self.assertEqual(run_security_case({"attack_type": "ssrf"})["decision"], "DENY")
    def test_data_leakage_denied(self): self.assertEqual(run_security_case({"attack_type": "data_leakage"})["decision"], "DENY")
    def test_tool_discovery_denied(self): self.assertEqual(run_security_case({"attack_type": "tool_discovery"})["decision"], "DENY")
if __name__ == "__main__": unittest.main()
