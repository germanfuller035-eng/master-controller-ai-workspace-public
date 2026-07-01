# Known Limitations

- Lead discovery can queue server work, but each source/provider may still return no new leads for a given run.
- Real email sending is intentionally not executed in this stage; it requires a separate one-send approval with exact recipient, subject, and body.
- Payments and production database writes remain behind separate gates.
