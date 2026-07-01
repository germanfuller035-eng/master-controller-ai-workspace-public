import unittest
from tools.commercial.digital_presence import analyze_digital_presence
from tools.commercial.mini_audit import build_mini_audit
from tools.commercial.product_strategy import choose_product
from tools.commercial.roi_estimator import estimate_roi
from tools.commercial.offer_builder import build_offer_draft
from tools.commercial.qa_red_team import qa_review
from tests.commercial.common import lead, site

class QaRedTeamTests(unittest.TestCase):
    def test_unsupported_claim_rejected(self):
        candidate = lead("synthetic_lead_clean.json")
        digital = analyze_digital_presence(candidate, site("synthetic_site_bad.json"))
        audit = build_mini_audit(candidate, digital)
        audit["claims"].append({"claim":"Guaranteed revenue from this real customer.", "evidence_ids":[]})
        product = choose_product(candidate, digital)
        roi = estimate_roi(candidate, product, [{"id":"a", "text":"Synthetic", "value":1}])
        offer = build_offer_draft(candidate, product, roi)
        review = qa_review(candidate, audit, offer, roi, digital)
        self.assertEqual(review["qa_status"], "FAIL")
        self.assertTrue(review["unsupported_claims_blocked"])
