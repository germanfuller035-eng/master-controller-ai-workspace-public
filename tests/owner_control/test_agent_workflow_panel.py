import unittest

from tools.owner_control.agent_workflow_panel import agent_workflow_panel


class AgentWorkflowPanelTests(unittest.TestCase):
    def test_status_incidents_and_evidence_visible(self):
        result = agent_workflow_panel()
        self.assertTrue(result["agents"])
        self.assertTrue(result["workflows"][0]["incidents"])
        self.assertTrue(result["evidence"])
