# COMMON CRAWL ADAPTER
Bounded host-index adapter. Live format официально не подтверждён из среды → TEST_ONLY fixture run.
TLD filter .ru/.рф; exclusion list (vk/avito/ozon/media/parked); dedup; incremental cursor; no AI during import.
Live test: hosts_inspected=10, reservoir_inserts=7, excluded=3, canonical_promotions=0, ai_calls=0. refresh=MONTHLY.
STATUS=READY (live endpoint TEST_ONLY pending format confirmation).
