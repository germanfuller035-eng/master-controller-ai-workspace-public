# New Leads Drift Audit — Integration Wave 1 (redacted)

date: 2026-06-18 · read-only · baseline 50 → live 62 · NEW_LEADS_TOTAL=12

## Result
NEW_LEADS_TOTAL=12 · NEW_LEADS_EXPLAINED=12 · UNKNOWN_SOURCE_LEADS=0 · DUPLICATE_NEW_LEADS=0
GUESSED_EMAILS=0 · ROGUE_PROMOTIONS=0 · EXISTING_50_LEADS_CHANGED=0

## All 12 new leads (redacted IDs)
Every one: created_at=2026-06-18T10:15:43Z, source=osm_overpass, status=manual_review_product_routing,
hasEmail=false, enrichment_batch_id=none.
- cand_5d7.., cand_4ed.., cand_af3.., cand_3a9.., cand_4f5.., cand_c09..,
  cand_5f6.., cand_1e3.., cand_8bc.., cand_02a.., cand_dba.., cand_716..

## Checks
1. All 12 created after baseline (2026-06-18 > 2026-06-16 freeze) — YES.
2. Source allowed: osm_overpass = OSM Overpass via Lead Hunter discovery — YES (LEAD_HUNTER).
3. Discovery job exists & completed: master-controller-discovery.service Result=success, status=0,
   + 9 LEAD_DISCOVERY queue jobs COMPLETED — YES.
4. No guessed emails: all 12 hasEmail=false, none promoted to a send-ready state — YES.
5. No duplicate lead IDs (canonical dup_ids=0) — YES.
6. No re-promotion / status churn of existing leads (0 existing leads changed) — YES.
7. No manual/unknown insertion: created via API by discovery (MATER_API_BASE 127.0.0.1:8787),
   not a direct file write — YES.
8. Status is the safe holding state manual_review_product_routing (not send-eligible) — YES.

SOURCE_CLASSIFICATION=LEAD_HUNTER (osm_overpass). Region Krasnodar, niches beauty/car_repair/dentist,
DAILY_CANDIDATE_LIMIT=20 (12 promoted this cycle). No full emails printed.
