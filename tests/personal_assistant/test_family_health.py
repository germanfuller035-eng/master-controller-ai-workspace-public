import unittest
from tools.personal_assistant import FIXTURE_DIR, load_json
from tools.personal_assistant.family_health import create_family_health_reminder
class FamilyHealthTests(unittest.TestCase):
    def test_family_and_health_reminders_validate_as_synthetic_non_medical(self):
        family = create_family_health_reminder(load_json(FIXTURE_DIR / "family_health" / "synthetic_family_reminder.json"))
        health = create_family_health_reminder(load_json(FIXTURE_DIR / "family_health" / "synthetic_health_reminder_fake.json"))
        self.assertTrue(family["family_data_synthetic_only"]); self.assertTrue(health["health_reminder_non_medical"]); self.assertFalse(health["medical_processing_allowed"])
if __name__ == "__main__": unittest.main()
