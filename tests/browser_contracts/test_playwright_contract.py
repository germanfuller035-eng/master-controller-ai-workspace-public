import unittest
from tools.browser_contracts.core import playwright_adapter_contract

class PlaywrightContractTests(unittest.TestCase):
    def test_playwright_adapter_remains_off(self):
        contract = playwright_adapter_contract()
        self.assertEqual(contract['adapter_status'], 'OFF')
        self.assertFalse(contract['runtime_enabled'])
