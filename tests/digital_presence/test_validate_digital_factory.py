import unittest

from tools.digital_presence.core import DigitalFactoryPolicyError, digital_presence_check, validate_digital_factory

from tests.digital_presence.common import site


class ValidateDigitalFactoryTests(unittest.TestCase):
    def test_validator_passes_current_digital_factory(self):
        self.assertEqual(validate_digital_factory(), [])

    def test_real_external_url_is_rejected_without_access(self):
        fixture = site("synthetic_site_good.json")
        fixture["reserved_domain_reference"] = "https://example.com/not-accessed"
        with self.assertRaises(DigitalFactoryPolicyError):
            digital_presence_check(fixture)


if __name__ == "__main__":
    unittest.main()
