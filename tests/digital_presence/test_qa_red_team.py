import unittest

from tools.digital_presence.core import digital_presence_check, generate_landing_prototype, lead_capture_readiness, route_product, store_prototype_artifact, website_quality_score
from tools.digital_presence.qa_red_team import qa_red_team_review

from tests.digital_presence.common import site


class QaRedTeamTests(unittest.TestCase):
    def test_unsupported_claim_rejected_by_qa(self):
        fixture = site("synthetic_site_bad.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        artifact = generate_landing_prototype(fixture, recommendation)
        artifact["claims"].append({"claim": "Guaranteed result from a real customer.", "evidence_ids": []})
        handoff = store_prototype_artifact(generate_landing_prototype(fixture, recommendation))
        review = qa_red_team_review(site=fixture, artifacts=[artifact], handoffs=[handoff])
        self.assertEqual(review["qa_status"], "FAIL")
        self.assertTrue(review["unsupported_claims_blocked"])

    def test_missing_evidence_rejected(self):
        fixture = site("synthetic_site_good.json")
        recommendation = route_product(fixture, digital_presence_check(fixture), website_quality_score(fixture), lead_capture_readiness(fixture))
        artifact = generate_landing_prototype(fixture, recommendation)
        artifact["claims"] = [{"claim": "Synthetic claim without evidence.", "evidence_ids": []}]
        handoff = store_prototype_artifact(generate_landing_prototype(fixture, recommendation))
        review = qa_red_team_review(site=fixture, artifacts=[artifact], handoffs=[handoff])
        self.assertEqual(review["qa_status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
