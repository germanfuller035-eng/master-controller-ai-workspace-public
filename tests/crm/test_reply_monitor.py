import unittest

from tools.crm import FIXTURE_DIR, load_json
from tools.crm.reply_monitor import classify_reply


class ReplyMonitorTests(unittest.TestCase):
    def test_positive_reply_classified(self):
        result = classify_reply(load_json(FIXTURE_DIR / "synthetic_reply_positive.json"))
        self.assertEqual(result["reply_classification"], "POSITIVE")
        self.assertFalse(result["real_inbox_access"])

    def test_objection_reply_classified(self):
        result = classify_reply(load_json(FIXTURE_DIR / "synthetic_reply_objection.json"))
        self.assertEqual(result["reply_classification"], "OBJECTION")

    def test_unsubscribe_triggers_suppression(self):
        result = classify_reply(load_json(FIXTURE_DIR / "synthetic_reply_unsubscribe.json"))
        self.assertEqual(result["reply_classification"], "UNSUBSCRIBE")
        self.assertTrue(result["suppression_required"])


if __name__ == "__main__":
    unittest.main()
