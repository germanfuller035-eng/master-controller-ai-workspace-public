import unittest

from tools.digital_presence.core import digital_presence_check, lead_capture_readiness, route_product, website_quality_score
from tools.digital_presence.landing_prototype import generate_landing_prototype

from tests.digital_presence.common import site


class LandingPrototypeTests(unittest.TestCase):
    def test_landing_prototype_generated_as_draft_artifact_only(self):
        fixture = site("synthetic_site_good.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        artifact = generate_landing_prototype(fixture, recommendation)
        self.assertEqual(artifact["artifact_type"], "landing_prototype")
        self.assertTrue(artifact["draft_only"])
        self.assertFalse(artifact["deployment_allowed"])
        self.assertFalse(artifact["form_submit_allowed"])
        self.assertTrue(artifact["owner_approval_required_for_future_deploy_or_send"])


if __name__ == "__main__":
    unittest.main()
