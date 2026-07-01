import unittest

from tools.owner_control.android_alignment import android_alignment


class AndroidAlignmentTests(unittest.TestCase):
    def test_required_android_surfaces_present(self):
        result = android_alignment()
        for surface in [
            "Today",
            "Approvals",
            "Leads",
            "Offer Preview",
            "Replies",
            "Deals",
            "Agents",
            "Costs",
            "Incidents",
            "Memory proposals",
            "Global STOP",
            "Voice",
        ]:
            self.assertIn(surface, result["surfaces"])
