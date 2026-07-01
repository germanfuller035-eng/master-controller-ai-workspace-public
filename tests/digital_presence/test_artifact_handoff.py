import unittest

from tools.digital_presence.artifact_handoff import store_prototype_artifact, validate_artifact_handoff
from tools.digital_presence.core import digital_presence_check, generate_landing_prototype, lead_capture_readiness, route_product, website_quality_score

from tests.digital_presence.common import site


class ArtifactHandoffTests(unittest.TestCase):
    def test_artifact_hash_generated(self):
        fixture = site("synthetic_site_good.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        handoff = store_prototype_artifact(generate_landing_prototype(fixture, recommendation))
        self.assertEqual(len(handoff["sha256"]), 64)
        self.assertEqual(validate_artifact_handoff(handoff)["status"], "PASS")

    def test_artifact_without_hash_rejected(self):
        result = validate_artifact_handoff({
            "artifact_id": "missing",
            "draft_only": True,
            "deployment_allowed": False,
            "owner_approval_required_for_future_deploy_or_send": True
        })
        self.assertEqual(result["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
