import unittest
from tools.multichannel.core import select_channel

class SuppressionListTests(unittest.TestCase):
    def test_suppression_entry_blocks_draft(self):
        result = select_channel({'synthetic': True, 'contact_ref': 'reserved-blocked'}, [{'synthetic': True, 'contact_ref': 'reserved-blocked', 'active': True, 'reason': 'synthetic'}])
        self.assertEqual(result['decision'], 'BLOCKED_SUPPRESSION')
