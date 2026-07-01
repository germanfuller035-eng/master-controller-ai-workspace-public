# Pre-Send Pilot Known Limitations

SESSION_NAME=OPERATOR_IMPORT_ROUTE_AND_REAL_LEADS_PRE_SEND_RESUME_V1

- Operator import is local runtime import only. It does not persist lead data to a production database or backend.
- Runtime JSON must be pushed to the debug app external files folder before import.
- Private UI hierarchy evidence includes real identifiers and must remain in `D:\AI_FILE_VAULT`.
- The app prepares owner-review packets and no-send drafts only; it does not send messages.
- Manual send, if chosen later by the owner, remains outside this completed no-send pilot.
