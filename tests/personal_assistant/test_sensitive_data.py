import unittest
from tools.personal_assistant import FIXTURE_DIR, load_json
from tools.personal_assistant.sensitive_data import review_sensitive_data
class SensitiveDataTests(unittest.TestCase):
    def test_fake_military_medical_requires_owner_approval(self):
        result = review_sensitive_data(load_json(FIXTURE_DIR / "sensitive" / "synthetic_fake_military_doc_request.json"))
        self.assertTrue(result["owner_approval_required"]); self.assertTrue(result["high_risk_gate_required"]); self.assertFalse(result["military_medical_processing_allowed"])
    def test_secret_like_input_rejected_and_redacted(self):
        result = review_sensitive_data(load_json(FIXTURE_DIR / "sensitive" / "synthetic_secret_like_input.json"))
        self.assertEqual(result["decision"], "REJECT_AND_REDACT"); self.assertTrue(result["secret_like_input_rejected"]); self.assertTrue(result["redaction_applied"])
if __name__ == "__main__": unittest.main()
