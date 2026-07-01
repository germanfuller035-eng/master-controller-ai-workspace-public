import unittest
from tools.commercial.digital_presence import analyze_digital_presence
from tools.commercial.product_strategy import choose_product
from tools.commercial.roi_estimator import estimate_roi
from tools.commercial.offer_builder import build_offer_draft, validate_offer_draft
from tests.commercial.common import lead, site

class OfferBuilderTests(unittest.TestCase):
    def test_offer_is_draft_only(self):
        candidate = lead("synthetic_lead_clean.json")
        product = choose_product(candidate, analyze_digital_presence(candidate, site("synthetic_site_good.json")))
        roi = estimate_roi(candidate, product, [{"id":"assumption.synthetic", "text":"Synthetic assumption", "value":1}])
        offer = build_offer_draft(candidate, product, roi)
        self.assertEqual(validate_offer_draft(offer)["status"], "PASS")
        self.assertFalse(offer["send_allowed"])
        self.assertEqual(offer["channel_actions"], [])
