import unittest

from tools.digital_presence.ai_front_office_architect import generate_ai_front_office_architecture
from tools.digital_presence.core import digital_presence_check, lead_capture_readiness, route_product, website_quality_score

from tests.digital_presence.common import site


class AiFrontOfficeArchitectTests(unittest.TestCase):
    def test_slow_response_points_to_ai_front_office(self):
        fixture = site("synthetic_site_slow_response.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        artifact = generate_ai_front_office_architecture(fixture, recommendation)
        self.assertEqual(recommendation["product_id"], "AI_FRONT_OFFICE")
        self.assertTrue(artifact["draft_only"])
        self.assertFalse(artifact["bot_runtime_enabled"])
        self.assertFalse(artifact["outbound_allowed"])


if __name__ == "__main__":
    unittest.main()
