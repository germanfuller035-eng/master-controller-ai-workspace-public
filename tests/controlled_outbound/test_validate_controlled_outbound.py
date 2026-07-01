import unittest

from tools.controlled_outbound.validate_controlled_outbound import validate_controlled_outbound_contracts


class ValidateControlledOutboundTests(unittest.TestCase):
    def test_validate_controlled_outbound_passes(self):
        self.assertEqual(validate_controlled_outbound_contracts(), [])


if __name__ == "__main__":
    unittest.main()
