# KNOWLEDGE RADAR REPORT
Read-only `knowledge_radar.mjs`. 14 источников (tier1=11, tier2=1, tier3=1, tier4=1).
- Pipeline без LLM: hash/ETag→dedup→change-detect→trust→relevance→CVE stack match→impact→route.
- Prompt-injection guard: внешний текст = данные; инъекция → QUARANTINED (live: 1 quarantine на TG-канале).
- Routing: URGENT (relevant Node CVE, налог.срок), WEEKLY, KNOWLEDGE, DISCARDED (irrelevant PHP CVE отброшен), CONFLICT_REVIEW.
- LLM summarization DISABLED (нет budget-approval). Proposal-only: 0 auto production changes, 0 client messages, 0 financial decisions.
- Endpoints: /knowledge/status, /sources, /digest, /collect (offline).
