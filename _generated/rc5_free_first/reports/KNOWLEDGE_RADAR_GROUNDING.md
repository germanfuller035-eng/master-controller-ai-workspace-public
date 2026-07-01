# KNOWLEDGE RADAR GROUNDING
Evidence contract: item_id,source_url,published_at,cve_id,advisory_id,affected_versions,installed_version,stack_match,applicability,effective_at,document_id,evidence_excerpt,verification,priority_reason.
Security URGENT gate: cve_id+source_url+affected+installed+stack_match+severity+recommended_action. Иначе NEEDS_STACK_VERIFICATION.
Legal URGENT gate: document_id+source_url+published_at+effective_at+exact_change+applicability. Иначе NEEDS_LEGAL_REVIEW.
Fixtures → verification=TEST_ONLY → никогда не URGENT в production. TIER4 → только discovery/conflict.
Live: grounded VERIFIED→URGENT(1); ungrounded→NEEDS_STACK_VERIFICATION(0 urgent); fixtures 0 urgent; injection quarantined; auto_changes=0.
