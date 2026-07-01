import unittest
from tools.multichannel.core import create_mail_draft

class MailDraftTests(unittest.TestCase):
    def test_email_draft_created_but_not_sent(self):
        draft = create_mail_draft({'synthetic': True, 'draft_ref': 'A', 'contact_ref': 'reserved-mailbox'})
        self.assertTrue(draft['draft_only'])
        self.assertFalse(draft['send_allowed'])
        self.assertRegex(draft['payload_hash'], r'^[a-f0-9]{64}$')
