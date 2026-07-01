# Memory Architecture V1

MEMORY_WRITE_STATUS=OFF

Long-term memory uses a proposal and curator workflow. Agents cannot directly
write persistent memory.

Flow:

1. Agent creates a memory proposal with claim, source, source_date,
   confidence, classification, and retention.
2. The proposal is validated for missing source, low confidence, unknown
   classification, sensitive content, secret-looking content, conflicts, and
   retention.
3. Memory Curator approves, rejects, or routes to owner approval.
4. Approval creates a PROPOSED_NOT_WRITTEN record only.
5. Production memory write remains denied until a future approved stage.

Direct write, auto-write, sensitive auto-write, and secret storage are denied.
