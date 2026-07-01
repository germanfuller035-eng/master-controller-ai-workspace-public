# Artifact Local Adapter V1

Adapter id: `artifact_local`

Status: implemented for local synthetic use only.

Allowed action: `write_artifact`.

Controls:

- writes only under `_generated/mcp_gateway_v1/artifacts`;
- absolute paths denied;
- traversal denied;
- output is SHA-256 hashed;
- artifact records are appended to `artifact_manifest.jsonl`;
- content is checked and redacted before storage.
