# Runtime Router Scope

SESSION_NAME=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1
SCOPE=LOCAL_SYNTHETIC_RUNTIME_ROUTER_COST_FOUNDATION

Allowed:

- runtime architecture docs;
- runtime, model, and cost configs;
- JSON schemas;
- deterministic standard-library tools;
- synthetic unit tests;
- validators and evidence files;
- checkpoint append-only update.

Forbidden:

- production runtime deployment;
- VoltAgent install;
- external MCP servers;
- Qdrant;
- OPA runtime;
- Infisical;
- telemetry stack installation;
- browser automation service;
- production tool adapters;
- VPS change;
- production DB write;
- outbound messages;
- payments;
- Full Run 1 or Full Run 2;
- Android acceptance, APK install, or instrumentation;
- secrets or provider credentials.
