from __future__ import annotations

import unittest

from tests.runtime.test_runtime_feature_flags import request
from tools.runtime.runtime_adapter import RuntimeAdapter
from tools.runtime.stateless_agent import StatelessAgent


class StatelessAgentExecutionTests(unittest.TestCase):
    def test_memory_enabled_false_by_default(self) -> None:
        result = StatelessAgent().execute({})
        self.assertEqual(result["status"], "STATELESS_OK")
        self.assertFalse(result["memory_enabled"])

    def test_persistent_memory_write_denied(self) -> None:
        result = StatelessAgent().execute({"persistent_memory_write": True})
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(result["error_code"], "PERSISTENT_MEMORY_WRITE_DENIED")

    def test_production_capabilities_zero_in_runtime_response(self) -> None:
        response = RuntimeAdapter().handle(request())
        self.assertEqual(response["status"], "DRY_RUN_OK")
        self.assertEqual(response["production_capabilities"], 0)
        self.assertFalse(response["memory_enabled"])

    def test_max_delegation_depth_enforced(self) -> None:
        response = RuntimeAdapter().handle(request(limits={"delegation_depth": 2, "subagents": 0, "interagent_messages": 0, "max_iterations": 1}))
        self.assertEqual(response["status"], "DENIED")
        self.assertEqual(response["error_code"], "DELEGATION_DEPTH_EXCEEDED")

    def test_subagent_and_interagent_limits_enforced(self) -> None:
        subagents = RuntimeAdapter().handle(request(limits={"delegation_depth": 0, "subagents": 4, "interagent_messages": 0, "max_iterations": 1}))
        messages = RuntimeAdapter().handle(request(limits={"delegation_depth": 0, "subagents": 0, "interagent_messages": 9, "max_iterations": 1}))
        self.assertEqual(subagents["error_code"], "SUBAGENT_LIMIT_EXCEEDED")
        self.assertEqual(messages["error_code"], "INTERAGENT_MESSAGE_LIMIT_EXCEEDED")


if __name__ == "__main__":
    unittest.main()
