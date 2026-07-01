from __future__ import annotations

from tools.mcp_gateway.models import GatewayError


class CancellationRegistry:
    def __init__(self) -> None:
        self._cancelled: set[str] = set()

    def cancel(self, token_id: str) -> None:
        self._cancelled.add(token_id)

    def is_cancelled(self, token: dict | str | None) -> bool:
        if token is None:
            return False
        if isinstance(token, str):
            return token in self._cancelled
        token_id = str(token.get("token_id", ""))
        return bool(token.get("cancelled") is True or (token_id and token_id in self._cancelled))

    def check(self, token: dict | str | None) -> None:
        if self.is_cancelled(token):
            raise GatewayError("CANCELLED", "request cancelled", status="CANCELLED")


GLOBAL_CANCELLATION_REGISTRY = CancellationRegistry()
