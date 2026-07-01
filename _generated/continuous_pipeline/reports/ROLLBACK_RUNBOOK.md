# Continuous Pipeline — Rollback Runbook
Non-destructive. Triggers: API unhealthy, canonical integrity fail, writer!=1, send ledger change, any
unexpected send/payment, agent direct write, contract incompatibility. Steps: set AGENT_RUNTIME=false;
restore index.mjs from backup (d6c0294a); remove the 4 new files (were ABSENT); restart ONLY API; preserve
canonical entities incl. the 3 real pilot opportunities/offers (READY_FOR_SEND_REVIEW, no deal/send) and
TEST_ONLY run — never delete; verify ledger 7, writer 1, queue failed 0. No Telegram/worker/Caddy restart,
no reboot. The real pilot offers are legitimate pre-sale data and survive rollback.
