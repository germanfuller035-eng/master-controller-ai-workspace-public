import unittest
from tools.personal_assistant import FIXTURE_DIR, load_json
from tools.personal_assistant.personal_task import validate_personal_task
class PersonalTaskTests(unittest.TestCase):
    def test_personal_task_validates(self):
        result = validate_personal_task(load_json(FIXTURE_DIR / "tasks" / "synthetic_personal_task.json"))
        self.assertEqual(result["status"], "PASS"); self.assertTrue(result["task_contract_valid"]); self.assertEqual(len(result["payload_hash"]), 64)
if __name__ == "__main__": unittest.main()
