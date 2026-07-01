# MCP Gateway Known Limitations

SESSION_NAME=MASTER_CONTROLLER_MCP_GATEWAY_V1
FINAL_STATUS=PASS_COMMITTED
FINAL_HEAD=9cc1042d745ca1130626c0a4c72a1018d040ae7b
NEXT_STAGE=VOLTAGENT_RUNTIME_MODEL_ROUTER_AND_COST_GOVERNOR_V1
NEXT_STAGE_STARTED=NO

MCP_WRITE_STATUS=OFF
PRODUCTION_MCP_SERVERS_ENABLED=0
VOLTAGENT_STATUS=NOT_INSTALLED
QDRANT_STATUS=NOT_INSTALLED
OPA_STATUS=NOT_INSTALLED
PRODUCTION_CHANGES=NO
VPS_CHANGED=NO
OUTBOUND_COUNT=0
PAYMENT_COUNT=0
PRODUCTION_DB_WRITES=0

Known limitations:

- no real external MCP server deployed;
- no production MCP read/write;
- no GitHub credential integration;
- no VPS SSH integration;
- no MySQL integration;
- no Gmail or Telegram send;
- no browser automation;
- no VoltAgent runtime;
- no Qdrant;
- no OPA runtime;
- local deterministic/synthetic only.
