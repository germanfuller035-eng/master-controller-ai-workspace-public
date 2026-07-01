import unittest

from tools.owner_control.core import OwnerControlPolicyError
from tools.owner_control.feature_flags_panel import enable_feature_flag, feature_flags_panel


class FeatureFlagsPanelTests(unittest.TestCase):
    def test_feature_flags_cannot_enable_flags(self):
        result = feature_flags_panel()
        self.assertTrue(result["display_only"])
        self.assertFalse(result["can_enable_flags"])
        with self.assertRaises(OwnerControlPolicyError):
            enable_feature_flag("PRODUCTION_DEPLOY")
