# Final Android Acceptance Rerun Known Limitations

FINAL_ANDROID_ACCEPTANCE_STATUS=PASS

- Voice capture/status is not implemented as a current Android APK route; it remains contract-only.
- Real Qdrant, Docling, OPA, VoltAgent runtime, MCP production servers, browser automation, and CRM/payment/mail integrations remain contract-only or disabled for production.
- `owner_incidents` had no incident rows, so the screen was accepted by owner-readable empty-state evidence.
- `multichannel` passed by manual bounded-scroll navigation because the existing runner did not reach the lower commercial card `cs_multichannel`.
- Raw UI hierarchy XML was not retained in this rerun evidence folder to avoid preserving unnecessary owner/device visible text; sanitized anchor/status evidence is recorded instead.
- No legacy Full Run 1/2 was run.
- No build, install, data clear, merge, tag, deploy, outbound send, payment, or production database write was performed.

NEXT_OWNER_DECISION=RUN_LEGACY_FULL_RUN_OR_PREPARE_MERGE_TAG_GATE
