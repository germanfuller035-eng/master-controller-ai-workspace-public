from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PROVIDER_REGISTRY_PATH = ROOT / "config" / "models" / "PROVIDER_REGISTRY.json"
MODEL_REGISTRY_PATH = ROOT / "config" / "models" / "MODEL_REGISTRY.json"


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


class ProviderRegistry:
    def __init__(
        self,
        provider_path: Path | None = None,
        model_path: Path | None = None,
        provider_status: dict[str, Any] | None = None,
    ) -> None:
        self.provider_path = provider_path or PROVIDER_REGISTRY_PATH
        self.model_path = model_path or MODEL_REGISTRY_PATH
        self.provider_status = provider_status or {}
        self.provider_data = _load_json(self.provider_path)
        self.model_data = _load_json(self.model_path)
        self.providers = {item["id"]: item for item in self.provider_data.get("providers", [])}
        self.models = {item["id"]: item for item in self.model_data.get("models", [])}

    def get_provider(self, provider_id: str) -> dict[str, Any] | None:
        return self.providers.get(provider_id)

    def get_model(self, model_id: str) -> dict[str, Any] | None:
        if model_id == "deterministic_fallback_process":
            return {
                "id": "deterministic_fallback_process",
                "provider_id": "deterministic_local_process",
                "provider": "deterministic_local_process",
                "quality_tier": "deterministic",
                "credential_status": "none_required",
            }
        return self.models.get(model_id)

    def provider_for_model(self, model_id: str) -> str | None:
        model = self.get_model(model_id)
        if not model:
            return None
        return str(model.get("provider_id") or model.get("provider"))

    def is_available(self, provider_id: str | None) -> bool:
        if not provider_id:
            return False
        override = self.provider_status.get(provider_id)
        if isinstance(override, bool):
            return override
        if isinstance(override, str):
            return override.upper() in {"AVAILABLE", "UP", "TRUE", "YES"}
        provider = self.get_provider(provider_id)
        if not provider:
            return False
        return bool(provider.get("available_for_local_synthetic")) and provider.get("production_enabled") is False

    def has_credentials(self) -> bool:
        if self.provider_data.get("credentials_committed"):
            return True
        for provider in self.providers.values():
            if provider.get("credential_status") not in {"none_required", "none_committed"}:
                return True
            for key in provider:
                if "api_key" in key.lower() or "token" in key.lower():
                    return True
        return False
