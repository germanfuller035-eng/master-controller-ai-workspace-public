import unittest
from tools.commercial.digital_presence import analyze_digital_presence
from tools.commercial.mini_audit import build_mini_audit
from tests.commercial.common import lead, site

class MiniAuditTests(unittest.TestCase):
    def test_mini_audit_contains_evidence(self):
        candidate = lead("synthetic_lead_website_fit.json")
        audit = build_mini_audit(candidate, analyze_digital_presence(candidate, site("synthetic_site_bad.json")))
        self.assertTrue(audit["evidence_required"])
        self.assertTrue(audit["claims"])
        self.assertTrue(all(claim["evidence_ids"] for claim in audit["claims"]))
