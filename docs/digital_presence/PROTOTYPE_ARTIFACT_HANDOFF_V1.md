# Prototype Artifact Handoff V1

Prototype artifacts are stored locally under `_generated/digital_presence_factory_v1/artifacts`.

Each handoff must include:

- artifact id;
- artifact type;
- relative path;
- SHA-256 hash;
- draft-only status;
- deployment blocked status;
- owner approval requirement for future deploy or send.

Artifact without hash is rejected. Artifact that enables deploy, publish, outbound, form submit, CRM write, or production DB write is rejected.
