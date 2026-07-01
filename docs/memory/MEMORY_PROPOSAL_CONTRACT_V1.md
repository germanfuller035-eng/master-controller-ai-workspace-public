# Memory Proposal Contract V1

A memory proposal is an agent request for future durable memory. It is not a
write.

Required fields:

- proposal_id
- proposed_by
- claim
- source_id
- source_date
- confidence
- classification
- retention

Validation:

- missing source is denied
- missing source_date is denied
- low confidence requires review or denial
- unknown classification is denied
- secret-looking content is denied
- sensitive content requires owner approval
- conflicts are flagged for curator review

The proposal may reference provenance evidence, but it cannot bypass Memory
Curator.
