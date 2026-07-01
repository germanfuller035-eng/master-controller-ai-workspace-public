# Known Limitations

- `D:\AI_SECRETS\yandex\yandex.txt` exists but is empty; readiness now uses the existing private env files under `D:\AI_SECRETS\01_env`.
- Live IMAP was not executed in this pass; the server contour uses the existing read-only headers-only IMAP snapshot contract and status surface.
- Telegram approval card generation is implemented as a safe payload builder; actual Telegram delivery remains a separate gateway action.
- Live SMTP send remains a separate approval action and was not executed.
- Production database write remains OFF.
- Payments and payment links remain OFF.
