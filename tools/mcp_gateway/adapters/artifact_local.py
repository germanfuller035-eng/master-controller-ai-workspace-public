from __future__ import annotations

from tools.mcp_gateway.adapters.contracts import BaseAdapter
from tools.mcp_gateway.artifacts import write_artifact
from tools.mcp_gateway.models import AdapterResult, GatewayError, GatewayRequest


class ArtifactLocalAdapter(BaseAdapter):
    def execute(self, request: GatewayRequest, timeout_ms: int, cancellation) -> AdapterResult:
        cancellation.check(request.cancellation_token)
        if request.action != "write_artifact":
            raise GatewayError("ARTIFACT_ACTION_DENIED", "unknown artifact action", status="DENIED")
        relative_path = str(request.input.get("relative_path", "artifact.txt"))
        content = str(request.input.get("content", ""))
        record = write_artifact(request.task_id, request.adapter_id, relative_path, content, request.data_class)
        cancellation.check(request.cancellation_token)
        return AdapterResult(data=record, artifact_ids=[record["artifact_id"]], result_ref=record["path"])
