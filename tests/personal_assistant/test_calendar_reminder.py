import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.calendar_reminder import attempt_calendar_write, create_calendar_reminder_draft
class CalendarReminderTests(unittest.TestCase):
    def test_calendar_reminder_draft_and_write_blocked(self):
        result = create_calendar_reminder_draft(load_json(FIXTURE_DIR / "calendar" / "synthetic_calendar_reminder.json"))
        self.assertTrue(result["draft_only"]); self.assertFalse(result["calendar_write_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_calendar_write({})
if __name__ == "__main__": unittest.main()
