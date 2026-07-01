import unittest
from tools.personal_assistant import FIXTURE_DIR, PersonalAssistantPolicyError, load_json
from tools.personal_assistant.finance_assets import attempt_payment, create_finance_asset_snapshot
class FinanceAssetsTests(unittest.TestCase):
    def test_finance_snapshot_without_bank_access_and_payment_blocked(self):
        result = create_finance_asset_snapshot(load_json(FIXTURE_DIR / "finance" / "synthetic_finance_asset_snapshot.json"))
        self.assertTrue(result["snapshot_only"]); self.assertFalse(result["bank_access_allowed"]); self.assertFalse(result["payment_allowed"])
        with self.assertRaises(PersonalAssistantPolicyError): attempt_payment({})
if __name__ == "__main__": unittest.main()
