from __future__ import annotations

import unittest

from tools.runtime.suspend_resume import create_suspend_state, deserialize_suspend_state, resume_from_state, serialize_suspend_state


class SuspendResumeTests(unittest.TestCase):
    def test_suspend_state_serializes(self) -> None:
        state = create_suspend_state("task-suspend", step_index=2, retry_count=1, evidence_refs=["evidence.md"])
        serialized = serialize_suspend_state(state)
        restored = deserialize_suspend_state(serialized)
        self.assertEqual(restored["task_id"], "task-suspend")
        self.assertFalse(restored["memory_enabled"])

    def test_resume_restores_allowed_state(self) -> None:
        serialized = serialize_suspend_state(create_suspend_state("task-resume"))
        response = resume_from_state(serialized)
        self.assertEqual(response["status"], "RESUME_READY")
        self.assertEqual(response["state"]["lifecycle_state"], "RESUMED")

    def test_resume_denied_when_stop_active(self) -> None:
        serialized = serialize_suspend_state(create_suspend_state("task-stop"))
        response = resume_from_state(serialized, {"active": True})
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "STOP_BLOCKED")


if __name__ == "__main__":
    unittest.main()
