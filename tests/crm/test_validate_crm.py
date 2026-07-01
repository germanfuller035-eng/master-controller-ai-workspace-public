import unittest

from tools.crm.validate_crm import validate_crm_contracts


class ValidateCrmTests(unittest.TestCase):
    def test_validate_crm_passes(self):
        self.assertEqual(validate_crm_contracts(), [])


if __name__ == "__main__":
    unittest.main()
