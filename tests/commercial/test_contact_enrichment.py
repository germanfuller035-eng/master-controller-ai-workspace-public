import unittest
from tools.commercial.contact_enrichment import enrich_contact
from tests.commercial.common import lead

class ContactEnrichmentTests(unittest.TestCase):
    def test_enrichment_uses_fixture_only(self):
        result = enrich_contact(lead("synthetic_lead_clean.json"))
        self.assertEqual(result["enrichment_mode"], "LOCAL_FIXTURE_ONLY")
        self.assertFalse(result["network_used"])
