from __future__ import annotations

import unittest

from tests.model_router.test_model_router import router


class ProviderFallbackTests(unittest.TestCase):
    def test_unavailable_provider_triggers_fallback(self) -> None:
        result = router({"synthetic_premium_provider": "UNAVAILABLE"}).route({"model_requirement": {"task_type": "critical"}})
        self.assertEqual(result["status"], "OK")
        self.assertNotEqual(result["provider_id"], "synthetic_premium_provider")
        self.assertTrue(result["checked"])

    def test_all_providers_unavailable_triggers_deterministic_fallback(self) -> None:
        result = router(
            {
                "synthetic_premium_provider": "UNAVAILABLE",
                "synthetic_independent_review_provider": "UNAVAILABLE",
                "synthetic_cheap_provider": "UNAVAILABLE",
                "codex_claude_agent_sdk_router": "UNAVAILABLE",
            }
        ).route({"model_requirement": {"task_type": "critical"}})
        self.assertEqual(result["decision"], "DETERMINISTIC_FALLBACK")
        self.assertEqual(result["model_id"], "deterministic_fallback_process")


if __name__ == "__main__":
    unittest.main()
