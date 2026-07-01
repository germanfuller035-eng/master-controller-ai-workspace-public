import unittest
from tools.multichannel.core import create_form_draft

class FormDraftTests(unittest.TestCase):
    def test_form_draft_created_but_not_submitted(self):
        draft = create_form_draft({'synthetic': True, 'draft_ref': 'A', 'contact_ref': 'reserved-form'})
        self.assertFalse(draft['submit_allowed'])
        self.assertFalse(draft['submitted'])
