import unittest

from tools.commercial.core import CommercialPolicyError, FIXTURE_DIR, PHONE_RE, REAL_EMAIL_RE, load_json
from tools.commercial.exa_research_ingestion import (
    can_send_to_owner_review,
    can_route_to_enrichment,
    can_route_to_outreach,
    can_route_to_scoring,
    ingest_exa_research_result,
    normalize_exa_research_for_owner_review,
)


def exa_fixture(name: str):
    return load_json(FIXTURE_DIR / "exa_research" / name)


class ExaResearchIngestionTests(unittest.TestCase):
    def test_ingest_accepts_valid_result_after_validation(self):
        ingested = ingest_exa_research_result(exa_fixture("valid_exa_research_result.synthetic.json"))

        self.assertEqual(ingested["ingestion_status"], "accepted_non_production")
        self.assertEqual(ingested["validation_status"], "valid")
        self.assertTrue(ingested["routing"]["owner_review"])
        self.assertTrue(ingested["routing"]["enrichment"])
        self.assertTrue(ingested["routing"]["scoring"])
        self.assertFalse(ingested["routing"]["outreach"]["allowed"])
        self.assertEqual(ingested["routing"]["outreach"]["reason"], "OWNER_APPROVAL_REQUIRED")

    def test_valid_exa_result_can_normalize_for_owner_review(self):
        review_item = normalize_exa_research_for_owner_review(exa_fixture("valid_exa_research_result.synthetic.json"))

        self.assertEqual(review_item["review_item_type"], "exa_research_result")
        self.assertEqual(review_item["review_status"], "pending_owner_review")
        self.assertEqual(review_item["facts_count"], 1)
        self.assertEqual(review_item["buying_signals_count"], 1)
        self.assertEqual(review_item["contact_candidates_count"], 1)
        self.assertEqual(review_item["risk_flags_count"], 1)

    def test_invalid_exa_result_is_rejected_before_owner_review(self):
        with self.assertRaises(CommercialPolicyError):
            normalize_exa_research_for_owner_review(exa_fixture("invalid_missing_fact_source_url.synthetic.json"))

    def test_invalid_exa_result_is_rejected_before_enrichment_and_scoring(self):
        invalid_payload = exa_fixture("invalid_missing_fact_source_url.synthetic.json")

        self.assertFalse(can_route_to_enrichment(invalid_payload))
        self.assertFalse(can_route_to_scoring(invalid_payload))

    def test_do_not_contact_blocks_outreach(self):
        allowed, reason = can_route_to_outreach(exa_fixture("do_not_contact_not_routable.synthetic.json"))

        self.assertFalse(allowed)
        self.assertEqual(reason, "DO_NOT_CONTACT")

    def test_high_severity_risk_blocks_outreach_and_requires_owner_review(self):
        payload = exa_fixture("risky_high_severity_not_routable.synthetic.json")
        review_item = normalize_exa_research_for_owner_review(payload)
        allowed, reason = can_route_to_outreach(payload)

        self.assertFalse(allowed)
        self.assertEqual(reason, "HIGH_RISK_REQUIRES_OWNER_REVIEW")
        self.assertTrue(review_item["has_high_risk"])
        self.assertEqual(review_item["review_status"], "pending_owner_review")

    def test_valid_result_without_owner_approval_cannot_route_to_outreach(self):
        allowed, reason = can_route_to_outreach(exa_fixture("valid_exa_research_result.synthetic.json"))

        self.assertFalse(allowed)
        self.assertEqual(reason, "OWNER_APPROVAL_REQUIRED")

    def test_email_contact_candidate_requires_future_company_level_provenance_contract(self):
        payload = exa_fixture("valid_exa_research_result.synthetic.json")
        payload["contact_candidates"][0]["contact_type"] = "email"
        payload["contact_candidates"][0]["value"] = "synthetic-company-email-reference"

        with self.assertRaisesRegex(CommercialPolicyError, "public company-level contact paths"):
            normalize_exa_research_for_owner_review(payload)
        self.assertFalse(can_send_to_owner_review(payload))
        self.assertFalse(can_route_to_enrichment(payload))
        self.assertFalse(can_route_to_scoring(payload))

        allowed, reason = can_route_to_outreach(payload)
        self.assertFalse(allowed)
        self.assertEqual(reason, "VALIDATION_FAILED")

    def test_source_urls_are_preserved_in_owner_review_item(self):
        review_item = normalize_exa_research_for_owner_review(exa_fixture("valid_exa_research_result.synthetic.json"))

        self.assertEqual(
            review_item["source_urls"],
            [
                "synthetic://public-web/company-profile",
                "synthetic://public-web/contact-page",
            ],
        )

    def test_no_real_email_or_phone_fixtures_are_used(self):
        fixture_dir = FIXTURE_DIR / "exa_research"
        for fixture_path in fixture_dir.glob("*.json"):
            content = fixture_path.read_text(encoding="utf-8")
            self.assertIsNone(REAL_EMAIL_RE.search(content), fixture_path.name)
            self.assertIsNone(PHONE_RE.search(content), fixture_path.name)


if __name__ == "__main__":
    unittest.main()
