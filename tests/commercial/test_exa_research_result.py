import unittest

from tools.commercial.core import FIXTURE_DIR, load_json
from tools.commercial.exa_research_result import can_route_exa_result_to_outreach, validate_exa_research_result


def exa_fixture(name: str):
    return load_json(FIXTURE_DIR / "exa_research" / name)


class ExaResearchResultTests(unittest.TestCase):
    def test_valid_fixture_passes_validation(self):
        result = validate_exa_research_result(exa_fixture("valid_exa_research_result.synthetic.json"))
        self.assertTrue(result["valid"], result["errors"])

    def test_missing_fact_source_url_fails_validation(self):
        result = validate_exa_research_result(exa_fixture("invalid_missing_fact_source_url.synthetic.json"))
        self.assertFalse(result["valid"])
        self.assertIn("facts[0].source_url is required and non-empty", result["errors"])

    def test_low_confidence_confirmed_fails_validation(self):
        result = validate_exa_research_result(exa_fixture("invalid_low_confidence_confirmed.synthetic.json"))
        self.assertFalse(result["valid"])
        self.assertIn("facts[0].status must be candidate when confidence is low", result["errors"])

    def test_invalid_contact_type_fails_validation(self):
        result = validate_exa_research_result(exa_fixture("invalid_contact_type.synthetic.json"))
        self.assertFalse(result["valid"])
        self.assertIn("contact_candidates[0].contact_type must be one of email, phone, contact_page, form, official_social", result["errors"])

    def test_wrong_source_type_fails_validation(self):
        result = validate_exa_research_result(exa_fixture("invalid_source_type.synthetic.json"))
        self.assertFalse(result["valid"])
        self.assertIn("source_type must equal public_web_research", result["errors"])

    def test_do_not_contact_is_not_routable_to_outreach(self):
        decision = can_route_exa_result_to_outreach(exa_fixture("do_not_contact_not_routable.synthetic.json"))
        self.assertFalse(decision["routable"])
        self.assertEqual(decision["reason"], "DO_NOT_CONTACT")

    def test_high_severity_risk_is_not_routable_without_owner_review(self):
        decision = can_route_exa_result_to_outreach(exa_fixture("risky_high_severity_not_routable.synthetic.json"))
        self.assertFalse(decision["routable"])
        self.assertEqual(decision["reason"], "HIGH_RISK_REQUIRES_OWNER_REVIEW")

    def test_high_severity_risk_can_route_only_with_owner_review(self):
        decision = can_route_exa_result_to_outreach(
            exa_fixture("risky_high_severity_not_routable.synthetic.json"),
            owner_review_approved=True,
        )
        self.assertTrue(decision["routable"])


if __name__ == "__main__":
    unittest.main()
