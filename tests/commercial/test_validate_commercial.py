import unittest
from tools.commercial.core import validate_commercial_factory

class ValidateCommercialTests(unittest.TestCase):
    def test_validator_has_no_errors(self):
        self.assertEqual(validate_commercial_factory(), [])
