from __future__ import annotations

from abc import ABC, abstractmethod

from tools.mcp_gateway.adapter_registry import AdapterRegistration
from tools.mcp_gateway.cancellation import CancellationRegistry
from tools.mcp_gateway.models import AdapterResult, GatewayRequest


class BaseAdapter(ABC):
    def __init__(self, registration: AdapterRegistration) -> None:
        self.registration = registration

    @abstractmethod
    def execute(self, request: GatewayRequest, timeout_ms: int, cancellation: CancellationRegistry) -> AdapterResult:
        raise NotImplementedError
