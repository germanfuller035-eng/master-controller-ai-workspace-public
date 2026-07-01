import unittest

from tools.crm import FIXTURE_DIR, CRMPolicyError, load_json
from tools.crm.contact import attempt_crm_write, validate_contact


class ContactTests(unittest.TestCase):
    def test_synthetic_contact_validates_and_blocks_crm_write(self):
        result = validate_contact(load_json(FIXTURE_DIR / "synthetic_contact.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertFalse(result["crm_write_allowed"])
        with self.assertRaises(CRMPolicyError):
            attempt_crm_write({})


if __name__ == "__main__":
    unittest.main()
