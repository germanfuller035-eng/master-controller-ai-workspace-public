import unittest

from tools.owner_control.approval_cards import approval_card
from tools.owner_control.risk_copy import risk_explanation


class RiskCopyTests(unittest.TestCase):
    def test_risk_explanation_has_required_parts(self):
        card = approval_card(fixture_name="synthetic_r4_approval_card.json")
        explanation = risk_explanation(card)
        for field in ["what", "who", "why", "cost", "rollback"]:
            self.assertIn(field, explanation)
            self.assertTrue(explanation[field])
