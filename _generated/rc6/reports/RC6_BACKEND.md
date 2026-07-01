# RC6 BACKEND CHANGES (live verified)
- delivery reconciliation: 7 sends все test/internal (commercial=0); READY_FOR_SEND_REVIEW=3, AWAITING_REPLY=0; no conflicting queues; repeat-send guard.
- audit/email separation: audit≠email; STROYDVOR audit_ready=true (3 evidence findings), email separate; AUDIT_READY=false когда нет настоящего.
- radar grounding: production excludes TEST_ONLY+ungrounded-legacy; URGENT только grounded+verified; stale fixtures исключены (production_findings=0, urgent empty); /knowledge/radar-status LIVE.
- AI usage: raw tokens UNKNOWN (не 0); estimated_records exposed; periods (2643/196554/199197) сохранены.
- timezone: Europe/Moscow default.
- reservoir: exclusive-state counters + invariants (pass); free prefilter (0 AI); list/detail; CC honest TEST_ONLY/NOT_VERIFIED; 0 promotions.
- deploy: backup rc6_20260619T053758Z; restart api only; API tests 47/0; integrity rev106/leads62/sends7 unchanged.
