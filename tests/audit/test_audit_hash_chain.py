import copy
import unittest
from pathlib import Path

from tools.audit.audit_hash_chain import AuditChainError, load_jsonl, signed_event, verify_events


FIXTURES = Path("tests/fixtures/audit")


class AuditHashChainTests(unittest.TestCase):
    def test_valid_chain_passes(self):
        verify_events(load_jsonl(FIXTURES / "high_risk_audit_valid.jsonl"))

    def test_tampered_event_fails(self):
        with self.assertRaisesRegex(AuditChainError, "hash mismatch"):
            verify_events(load_jsonl(FIXTURES / "high_risk_audit_tampered.jsonl"))

    def test_sequence_gap_fails(self):
        events = load_jsonl(FIXTURES / "high_risk_audit_valid.jsonl")
        events[1]["sequence"] = 3
        events[1] = signed_event(events[1])
        with self.assertRaisesRegex(AuditChainError, "sequence gap"):
            verify_events(events)

    def test_replayed_approval_fails(self):
        with self.assertRaisesRegex(AuditChainError, "replayed approval"):
            verify_events(load_jsonl(FIXTURES / "high_risk_audit_replay_attempt.jsonl"))

    def test_missing_payload_hash_fails(self):
        events = load_jsonl(FIXTURES / "high_risk_audit_valid.jsonl")
        events[0] = copy.deepcopy(events[0])
        events[0]["payload_hash"] = ""
        events[0] = signed_event(events[0])
        with self.assertRaisesRegex(AuditChainError, "missing payload hash"):
            verify_events(events)

    def test_secret_looking_payload_value_rejected(self):
        event = {
            "sequence": 1,
            "timestamp": "2026-06-26T00:00:00Z",
            "actor": "policy_test",
            "task_id": "POLICY-TEST",
            "action": "outbound_send",
            "resource": "synthetic://lead/1",
            "risk": "R4",
            "payload_hash": "0" * 64,
            "approval_id": "appr-secret",
            "result": "DENIED",
            "previous_hash": "GENESIS",
            "note": "token = FAKE_TOKEN_VALUE_DO_NOT_USE",
        }
        with self.assertRaisesRegex(AuditChainError, "secret-looking"):
            verify_events([signed_event(event)])


if __name__ == "__main__":
    unittest.main()
