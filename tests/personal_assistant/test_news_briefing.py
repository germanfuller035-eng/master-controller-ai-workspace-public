import unittest
from tools.personal_assistant import FIXTURE_DIR, load_json
from tools.personal_assistant.news_briefing import create_news_briefing
class NewsBriefingTests(unittest.TestCase):
    def test_news_briefing_without_external_monitoring(self):
        result = create_news_briefing(load_json(FIXTURE_DIR / "news" / "synthetic_news_briefing_request.json"))
        self.assertEqual(result["briefing_mode"], "synthetic_knowledge_note"); self.assertFalse(result["external_monitoring_allowed"]); self.assertFalse(result["real_scraping_allowed"])
if __name__ == "__main__": unittest.main()
