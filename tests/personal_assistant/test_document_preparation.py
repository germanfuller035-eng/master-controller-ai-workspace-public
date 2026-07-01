import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.document_preparation import attempt_document_send, attempt_government_filing, prepare_document_draft
class DocumentPreparationTests(unittest.TestCase):
    def test_document_draft_and_send_blocked(self):
        result = prepare_document_draft(load_json(FIXTURE_DIR / "documents" / "synthetic_document_request.json"))
        self.assertTrue(result["draft_only"]); self.assertFalse(result["document_send_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_document_send({})
        with self.assertRaises(PersonalAssistantPolicyError): attempt_government_filing({})
if __name__ == "__main__": unittest.main()
