from __future__ import annotations

import unittest

from tools.knowledge.knowledge_radar import create_radar_proposal, evaluate_radar_action


class KnowledgeRadarTests(unittest.TestCase):
    def test_knowledge_radar_creates_proposal_only(self) -> None:
        proposal = create_radar_proposal("src_synthetic_public_001", "Review synthetic source.")
        self.assertEqual(proposal["action"], "PROPOSE_ONLY")
        self.assertFalse(proposal["memory_write"])
        self.assertFalse(proposal["external_network_attempted"])

    def test_knowledge_radar_install_action_denied(self) -> None:
        decision = evaluate_radar_action("INSTALL_COMPONENT")
        self.assertEqual(decision["status"], "DENIED")


if __name__ == "__main__":
    unittest.main()
