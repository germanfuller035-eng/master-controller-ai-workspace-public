import unittest
from tools.commercial.digital_presence import analyze_digital_presence
from tools.commercial.product_strategy import choose_product, evaluate_product_mix
from tests.commercial.common import lead, site

class ProductStrategyTests(unittest.TestCase):
    def test_selects_by_dominant_problem(self):
        website = lead("synthetic_lead_website_fit.json")
        lead_system = lead("synthetic_lead_missing_contact.json")
        ai = lead("synthetic_lead_ai_front_office_fit.json")
        audit = lead("synthetic_lead_mini_audit_fit.json")
        self.assertEqual(choose_product(website, analyze_digital_presence(website, site("synthetic_site_bad.json")))["product_id"], "WEBSITE_CONVERSION")
        self.assertEqual(choose_product(lead_system, analyze_digital_presence(lead_system, site("synthetic_site_no_lead_capture.json")))["product_id"], "LEAD_SYSTEM")
        self.assertEqual(choose_product(ai, analyze_digital_presence(ai, site("synthetic_site_good.json")))["product_id"], "AI_FRONT_OFFICE")
        self.assertEqual(choose_product(audit, analyze_digital_presence(audit, site("synthetic_site_good.json")))["product_id"], "MINI_AUDIT")

    def test_product_mix_rule_blocks_overuse(self):
        matches = [{"product_id":"MINI_AUDIT", "objective_concentration_reason":False} for _ in range(7)] + [{"product_id":"WEBSITE_CONVERSION"} for _ in range(3)]
        self.assertEqual(evaluate_product_mix(matches)["status"], "FAIL")
