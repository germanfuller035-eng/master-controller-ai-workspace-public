import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.automotive import attempt_vehicle_transaction, create_automotive_task
class AutomotiveTests(unittest.TestCase):
    def test_automotive_task_and_transaction_blocked(self):
        result = create_automotive_task(load_json(FIXTURE_DIR / "automotive" / "synthetic_vehicle_task.json"))
        self.assertTrue(result["draft_task_only"]); self.assertFalse(result["vehicle_transaction_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_vehicle_transaction({})
if __name__ == "__main__": unittest.main()
