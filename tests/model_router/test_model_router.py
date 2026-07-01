from __future__ import annotations

import unittest

from tools.model_router.model_router import ModelRouter
from tools.model_router.provider_registry import ProviderRegistry


def router(provider_status=None) -> ModelRouter:
    return ModelRouter(provider_registry=ProviderRegistry(provider_status=provider_status or {}))


class ModelRouterTests(unittest.TestCase):
    def test_critical_routes_to_best_model(self) -> None:
        result = router().route({"model_requirement": {"task_type": "critical"}})
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["model_id"], "critical_best_model_class")

    def test_routine_routes_to_cheap_model(self) -> None:
        result = router().route({"model_requirement": {"task_type": "routine"}})
        self.assertEqual(result["model_id"], "cheap_routine_model_class")

    def test_classification_routes_to_deterministic_path(self) -> None:
        result = router().route({"model_requirement": {"task_type": "classification"}})
        self.assertEqual(result["model_id"], "deterministic_local_classifier")
        self.assertTrue(result["deterministic_fallback"])

    def test_coding_routes_to_coding_worker_profile(self) -> None:
        result = router().route({"model_requirement": {"task_type": "coding"}})
        self.assertEqual(result["model_id"], "coding_worker_profile")

    def test_review_routes_to_independent_provider(self) -> None:
        result = router().route({"model_requirement": {"task_type": "review"}, "previous_provider": "synthetic_premium_provider"})
        self.assertEqual(result["provider_id"], "synthetic_independent_review_provider")
        self.assertNotEqual(result["provider_id"], "synthetic_premium_provider")

    def test_unknown_task_type_denied(self) -> None:
        result = router().route({"model_requirement": {"task_type": "unknown"}})
        self.assertEqual(result["status"], "DENIED")
        self.assertEqual(result["decision"], "DENY_SAFE_DEFAULT")


if __name__ == "__main__":
    unittest.main()
