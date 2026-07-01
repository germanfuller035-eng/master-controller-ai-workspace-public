import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.property import attempt_property_transaction, create_property_task
class PropertyTests(unittest.TestCase):
    def test_property_task_and_transaction_blocked(self):
        result = create_property_task(load_json(FIXTURE_DIR / "property" / "synthetic_property_task.json"))
        self.assertTrue(result["draft_task_only"]); self.assertFalse(result["property_transaction_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_property_transaction({})
if __name__ == "__main__": unittest.main()
