import unittest

from tools.finance import FIXTURE_DIR, FinancePolicyError, load_json
from tools.finance.accounting_draft import attempt_accounting_export, validate_accounting_entry_draft


class AccountingDraftTests(unittest.TestCase):
    def test_accounting_entry_is_draft_only(self):
        result = validate_accounting_entry_draft(load_json(FIXTURE_DIR / "synthetic_accounting_entry.json"))
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["draft_only"])
        self.assertTrue(result["accounting_export_blocked"])
        self.assertEqual(len(result["payload_hash"]), 64)
        with self.assertRaises(FinancePolicyError):
            attempt_accounting_export({})


if __name__ == "__main__":
    unittest.main()
