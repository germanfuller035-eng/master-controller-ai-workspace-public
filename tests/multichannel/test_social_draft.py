import unittest
from tools.multichannel.core import create_social_draft

class SocialDraftTests(unittest.TestCase):
    def test_social_draft_not_published(self):
        draft = create_social_draft({'synthetic': True, 'draft_ref': 'A', 'contact_ref': 'reserved-social'})
        self.assertFalse(draft['publish_allowed'])
        self.assertFalse(draft['send_allowed'])
