import unittest
from tools.commercial.identity_verification import verify_identity
from tests.commercial.common import lead

class IdentityVerificationTests(unittest.TestCase):
    def test_identity_requires_synthetic_marker(self):
        result = verify_identity(lead("synthetic_lead_clean.json"))
        self.assertEqual(result["identity_status"], "PASS")
        self.assertTrue(result["synthetic_only"])
        self.assertTrue(result["no_personal_data"])
