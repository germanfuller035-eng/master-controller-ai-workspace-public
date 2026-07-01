import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.travel import attempt_booking, create_travel_plan_draft
class TravelTests(unittest.TestCase):
    def test_travel_plan_draft_and_booking_blocked(self):
        result = create_travel_plan_draft(load_json(FIXTURE_DIR / "travel" / "synthetic_travel_plan.json"))
        self.assertTrue(result["travel_plan_draft_only"]); self.assertFalse(result["booking_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_booking({})
if __name__ == "__main__": unittest.main()
