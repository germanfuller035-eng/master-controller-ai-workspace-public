import unittest

from tools.digital_presence.core import digital_presence_check, lead_capture_readiness, route_product, website_quality_score
from tools.digital_presence.website_prototype import generate_website_prototype

from tests.digital_presence.common import site


class WebsitePrototypeTests(unittest.TestCase):
    def test_website_quality_problem_points_to_website_prototype(self):
        fixture = site("synthetic_site_website_fit.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        artifact = generate_website_prototype(fixture, recommendation)
        self.assertEqual(recommendation["product_id"], "WEBSITE_PROTOTYPE")
        self.assertTrue(recommendation["reason"])
        self.assertTrue(artifact["draft_only"])
        self.assertFalse(artifact["hosting_allowed"])
        self.assertFalse(artifact["dns_change_allowed"])


if __name__ == "__main__":
    unittest.main()
