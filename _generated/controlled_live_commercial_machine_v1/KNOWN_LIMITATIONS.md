# Known limitations

- The final Honor visual smoke used local mode because server pairing was not required for this closeout. Remote pairing remains a separate operational check.
- The smoke did not open the email app and did not mark the result as sent. This is intentional: real outbound requires owner action.
- Payments remain OFF by design until real customer feedback and a separate payment gate.
- Production DB writes remain OFF by design until a separate production-write gate.
- The smoke used synthetic input. Real lead/contact data must remain in private storage and must not be committed to Git.
- The owner can still manually type bad text into the draft editor; QA blocks that path unless the owner edits or records an explicit override reason.
- The package/approval screen shows short packet/text codes for verification. Full internal hashes remain internal and are not owner-facing.
