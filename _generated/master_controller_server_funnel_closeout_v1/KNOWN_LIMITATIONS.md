# Known Limitations

- SMTP live canary is intentionally blocked until the owner provides exact approval for one recipient, one subject, and one body.
- IMAP Stage 1 reads headers only. Body parsing and attachment processing are intentionally not enabled.
- Production database sync is intentionally off and requires a separate production-write gate.
- Payment live and payment links are intentionally off and require a separate payment gate.
- The device smoke used `adb reverse` because the Honor device was not on the same Wi-Fi LAN during this closeout.
- Android evidence uses private screenshots only because live mail metadata must not enter Git.
