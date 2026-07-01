import unittest

from tools.digital_presence.core import digital_presence_check, lead_capture_readiness, route_product, website_quality_score
from tools.digital_presence.lead_system_architect import generate_lead_system_architecture

from tests.digital_presence.common import site


class LeadSystemArchitectTests(unittest.TestCase):
    def test_lead_capture_problem_points_to_lead_system(self):
        fixture = site("synthetic_site_lead_system_fit.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        artifact = generate_lead_system_architecture(fixture, recommendation)
        self.assertEqual(recommendation["product_id"], "LEAD_SYSTEM")
        self.assertTrue(artifact["draft_only"])
        self.assertFalse(artifact["crm_write_allowed"])
        self.assertFalse(artifact["production_db_write_allowed"])
        self.assertFalse(artifact["outbound_allowed"])


if __name__ == "__main__":
    unittest.main()
