import unittest
from tools.browser_contracts.core import evaluate_browser_action, load_json, FIXTURE_DIR, validate_browser_contracts

class ValidateBrowserContractsTests(unittest.TestCase):
    def test_forbidden_requests_and_stop_are_blocked(self):
        self.assertEqual(validate_browser_contracts(), [])
        self.assertEqual(evaluate_browser_action(load_json(FIXTURE_DIR / 'forbidden_external_browser_request.json'))['decision'], 'DENY_EXTERNAL_BROWSER')
        self.assertEqual(evaluate_browser_action(load_json(FIXTURE_DIR / 'forbidden_form_submit_request.json'))['decision'], 'DENY_FORM_SUBMIT')
        self.assertEqual(evaluate_browser_action(load_json(FIXTURE_DIR / 'synthetic_browser_action_request.json'), stop_active=True)['decision'], 'BLOCKED_BY_STOP')
