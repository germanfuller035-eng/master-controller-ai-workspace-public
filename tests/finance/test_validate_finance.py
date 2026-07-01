import unittest

from tools.finance.validate_finance import validate_finance_contracts


class ValidateFinanceTests(unittest.TestCase):
    def test_validate_finance_passes(self):
        self.assertEqual(validate_finance_contracts(), [])


if __name__ == "__main__":
    unittest.main()
