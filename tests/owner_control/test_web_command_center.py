import unittest

from tools.owner_control.web_command_center import web_command_center


class WebCommandCenterTests(unittest.TestCase):
    def test_required_web_ia_sections_present(self):
        result = web_command_center()
        for section in ["Today & Decisions", "Commerce", "AI Circuit", "Knowledge", "System"]:
            self.assertIn(section, result["sections"])
