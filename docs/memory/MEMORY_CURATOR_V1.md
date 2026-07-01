# Memory Curator V1

Memory Curator is the validation boundary between proposals and proposed memory
records.

Curator checks:

- source_id
- source_date
- confidence
- classification
- retention
- sensitive review
- conflict review
- secret-looking content

Allowed decisions:

- APPROVE_PROPOSED_RECORD
- REJECT
- NEEDS_OWNER_APPROVAL

Approved proposals create only PROPOSED_NOT_WRITTEN records while
MEMORY_WRITE=OFF. Rejections block writes.
