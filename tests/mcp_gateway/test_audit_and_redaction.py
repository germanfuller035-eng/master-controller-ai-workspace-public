from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.mcp_gateway.audit import AuditLogger, verify_audit_chain
from tools.mcp_gateway.gateway import Gateway


class AuditAndRedactionTests(unittest.TestCase):
    def test_every_call_emits_hash_chained_redacted_event_and_tamper_detects(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            event_log = Path(temp) / "events.jsonl"
            gateway = Gateway(audit_logger=AuditLogger(event_log))
            response = gateway.handle(
                {
                    "request_id": "req-audit",
                    "task_id": "task-audit",
                    "actor": "codex",
                    "adapter_id": "artifact_local",
                    "action": "write_artifact",
                    "resource": "audit.txt",
                    "environment": "LOCAL_SYNTHETIC",
                    "risk": "R1",
                    "data_class": "BUSINESS_INTERNAL",
                    "input": {"relative_path": "tests/audit.txt", "content": "safe content", "display_token": "REDACTED"},
                    "timeout_ms": 5000,
                    "evidence_required": True,
                }
            )
            self.assertEqual(response["status"], "OK")
            self.assertTrue(event_log.exists())
            event = json.loads(event_log.read_text(encoding="utf-8").splitlines()[0])
            self.assertIn("payload_hash", event)
            self.assertIn("current_hash", event)
            self.assertTrue(verify_audit_chain(event_log))
            event["result"] = "TAMPERED"
            event_log.write_text(json.dumps(event, sort_keys=True) + "\n", encoding="utf-8")
            self.assertFalse(verify_audit_chain(event_log))


if __name__ == "__main__":
    unittest.main()
