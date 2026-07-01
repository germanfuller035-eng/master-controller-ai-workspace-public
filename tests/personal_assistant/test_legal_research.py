import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.legal_research import attempt_legal_filing, create_legal_research_note
class LegalResearchTests(unittest.TestCase):
    def test_legal_research_note_and_filing_blocked(self):
        result = create_legal_research_note(load_json(FIXTURE_DIR / "legal" / "synthetic_legal_research_request.json"))
        self.assertTrue(result["draft_note_only"]); self.assertFalse(result["legal_filing_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_legal_filing({})
if __name__ == "__main__": unittest.main()
