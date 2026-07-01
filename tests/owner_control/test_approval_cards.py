import unittest

from tools.owner_control.approval_cards import approval_card
from tools.owner_control.core import FIXTURE_DIR, OwnerControlPolicyError, load_json


class ApprovalCardTests(unittest.TestCase):
    def test_r4_requires_payload_hash(self):
        card = approval_card(fixture_name="synthetic_r4_approval_card.json")
        self.assertRegex(card["payload_hash"], r"^[0-9a-f]{64}$")
        card["payload_hash"] = ""
        with self.assertRaises(OwnerControlPolicyError):
            approval_card(card)

    def test_r5_requires_strong_approval_fields(self):
        card = load_json(FIXTURE_DIR / "approvals" / "synthetic_r5_approval_card.json")
        self.assertEqual(approval_card(card)["risk"], "R5")
        card["strong_approval_fields"]["short_delay"] = False
        with self.assertRaises(OwnerControlPolicyError):
            approval_card(card)
