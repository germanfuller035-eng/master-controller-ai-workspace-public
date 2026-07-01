import unittest
from tools.browser_contracts.core import evaluate_browser_action, load_json, FIXTURE_DIR

class BrowserActionContractTests(unittest.TestCase):
    def test_browser_action_contract_validates_without_browsing(self):
        result = evaluate_browser_action(load_json(FIXTURE_DIR / 'synthetic_browser_action_request.json'))
        self.assertEqual(result['decision'], 'CONTRACT_RECORDED')
        self.assertFalse(result['browser_used'])
        self.assertFalse(result['production_action'])
