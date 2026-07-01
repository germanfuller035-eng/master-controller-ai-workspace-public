# Final Android Acceptance Rerun Screen Summary

FINAL_ANDROID_ACCEPTANCE_STATUS=PASS
DEVICE_UNLOCKED=YES
DEVICE_ROUTE_STATUS=PASS

| Owner area | APK screen id | Status | Evidence |
| --- | --- | --- | --- |
| Today | home | PASS | `screen_logs/instrument_home.txt`; STOP entry manually verified. |
| Approvals / Decisions | approvals | PASS | `screen_logs/instrument_approvals.txt` |
| Leads | pipeline | PASS | `screen_logs/instrument_pipeline.txt` |
| Offer Preview | offer_review | PASS | `screen_logs/instrument_offer_review.txt` |
| Replies | replies | PASS | `screen_logs/instrument_replies.txt` |
| Deals / commercial owner hub | commandcenter_commercial | PASS | `screen_logs/instrument_commandcenter_commercial.txt` |
| Agents | agents | PASS | `screen_logs/instrument_agents.txt` |
| Costs | cost | PASS | `screen_logs/instrument_cost.txt` |
| Incidents | owner_incidents | PASS_EMPTY_STATE_VERIFIED | `screen_logs/ledger_owner_incidents_rerun.txt`; manual empty-state verification. |
| Memory / knowledge | knowledge | PASS | `screen_logs/ledger_knowledge_rerun.txt` |
| Global STOP / System | operations | PASS | `screen_logs/ledger_operations_rerun.txt`; Today STOP entry manually verified. |
| Multichannel | multichannel | PASS_MANUAL_NAVIGATION | `screen_logs/ledger_multichannel_rerun2.txt`; manual bounded-scroll verification. |
| Transport | transport | PASS | `screen_logs/ledger_transport_rerun.txt` |
| Conversations | conversations | PASS | `screen_logs/ledger_conversations_rerun2.txt` |
| AI usage / cost detail | ai | PASS | `screen_logs/ledger_ai_rerun.txt` |

SCREENS_CHECKED=[home,approvals,pipeline,offer_review,replies,commandcenter_commercial,agents,cost,owner_incidents,knowledge,operations,multichannel,transport,conversations,ai]
SCREENS_PASS=15
SCREENS_BLOCKED=[]

CONTRACT_ONLY_NOT_IN_ANDROID_APK=[voice_capture,voice_placeholder_status,real_qdrant,real_docling,real_opa,real_voltagent_runtime,real_mcp_production_servers,real_browser_automation,real_crm_payment_mail_integration,post_hardening_contract_layers]
