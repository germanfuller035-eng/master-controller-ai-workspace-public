import unittest

from tools.owner_control.memory_proposals import memory_proposals


class MemoryProposalTests(unittest.TestCase):
    def test_memory_proposal_cannot_write_memory(self):
        result = memory_proposals()
        proposal = result["proposals"][0]
        self.assertTrue(proposal["review_only"])
        self.assertFalse(proposal["can_write_memory"])
