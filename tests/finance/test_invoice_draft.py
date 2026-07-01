import unittest

from tools.finance import FIXTURE_DIR, FinancePolicyError, load_json
from tools.finance.invoice_draft import attempt_invoice_send, validate_invoice_draft


class InvoiceDraftTests(unittest.TestCase):
    def test_invoice_draft_validates_and_send_blocked(self):
        result = validate_invoice_draft(load_json(FIXTURE_DIR / "synthetic_invoice_draft.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["draft_only"])
        self.assertTrue(result["invoice_send_blocked"])
        self.assertEqual(len(result["payload_hash"]), 64)
        with self.assertRaises(FinancePolicyError):
            attempt_invoice_send({})


if __name__ == "__main__":
    unittest.main()
