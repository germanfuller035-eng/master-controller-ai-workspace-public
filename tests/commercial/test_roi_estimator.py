import unittest
from tools.commercial.core import CommercialPolicyError
from tools.commercial.digital_presence import analyze_digital_presence
from tools.commercial.product_strategy import choose_product
from tools.commercial.roi_estimator import estimate_roi
from tests.commercial.common import lead, site

class RoiEstimatorTests(unittest.TestCase):
    def test_roi_requires_assumptions(self):
        candidate = lead("synthetic_lead_clean.json")
        product = choose_product(candidate, analyze_digital_presence(candidate, site("synthetic_site_good.json")))
        with self.assertRaises(CommercialPolicyError):
            estimate_roi(candidate, product, [])
        self.assertGreater(estimate_roi(candidate, product, [{"id":"a", "text":"Synthetic", "value":1}])["estimate_units"], 0)
