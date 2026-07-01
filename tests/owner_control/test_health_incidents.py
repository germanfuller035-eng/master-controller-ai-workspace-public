import unittest

from tools.owner_control.health_incidents import health_incidents


class HealthIncidentTests(unittest.TestCase):
    def test_incidents_and_next_action_visible(self):
        result = health_incidents()
        self.assertTrue(result["incidents"])
        self.assertTrue(result["next_action"])
