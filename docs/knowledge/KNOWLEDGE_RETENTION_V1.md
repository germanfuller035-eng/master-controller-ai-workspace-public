# Knowledge Retention V1

Knowledge retention is required for every artifact and temporal fact.

Retention classes:

- SHORT
- STANDARD
- REVIEW_30_DAYS
- UNTIL_SOURCE_EXPIRES

Expired records are routed to review. This session does not implement automatic
deletion, production compaction, or production store mutation.

Sensitive synthetic fixtures may be used only when clearly marked and only for
negative tests or owner-approval gate tests. Real sensitive documents are out of
scope.
