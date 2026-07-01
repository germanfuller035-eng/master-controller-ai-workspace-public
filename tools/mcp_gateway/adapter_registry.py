from __future__ import annotations

import importlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.mcp_gateway.models import GatewayError


ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "config" / "mcp" / "GATEWAY_ADAPTERS.json"


@dataclass(frozen=True)
class AdapterRegistration:
    id: str
    lifecycle: str
    production_enabled: bool
    max_risk: str | None
    allowed_actions: list[str]
    implementation: str
    contract_only: bool
    raw: dict[str, Any]


class AdapterRegistry:
    def __init__(self, registry_path: Path | None = None) -> None:
        self.registry_path = registry_path or REGISTRY_PATH
        self._registrations = self._load()

    def _load(self) -> dict[str, AdapterRegistration]:
        data = json.loads(self.registry_path.read_text(encoding="utf-8"))
        registrations: dict[str, AdapterRegistration] = {}
        for item in data.get("adapters", []):
            registration = AdapterRegistration(
                id=item["id"],
                lifecycle=item["lifecycle"],
                production_enabled=bool(item.get("production_enabled")),
                max_risk=item.get("max_risk"),
                allowed_actions=list(item.get("allowed_actions", [])),
                implementation=item.get("implementation", ""),
                contract_only=False,
                raw=item,
            )
            registrations[registration.id] = registration
        for item in data.get("contract_only_adapters", []):
            registration = AdapterRegistration(
                id=item["id"],
                lifecycle=item["lifecycle"],
                production_enabled=bool(item.get("production_enabled")),
                max_risk=item.get("max_risk"),
                allowed_actions=list(item.get("allowed_actions", [])),
                implementation=item.get("implementation", "CONTRACT_ONLY"),
                contract_only=True,
                raw=item,
            )
            registrations[registration.id] = registration
        return registrations

    def get(self, adapter_id: str) -> AdapterRegistration:
        try:
            return self._registrations[adapter_id]
        except KeyError as exc:
            raise GatewayError("UNKNOWN_ADAPTER", "unknown adapter", status="DENIED") from exc

    def create_adapter(self, registration: AdapterRegistration):
        if registration.contract_only:
            raise GatewayError("CONTRACT_ONLY_ADAPTER", "adapter is contract-only", status="DENIED")
        module_name, class_name = registration.implementation.rsplit(".", 1)
        module = importlib.import_module(module_name)
        adapter_cls = getattr(module, class_name)
        return adapter_cls(registration)

    def registrations(self) -> list[AdapterRegistration]:
        return list(self._registrations.values())
