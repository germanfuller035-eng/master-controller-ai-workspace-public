# Android Smoke Result

Device:

- DEVICE=Honor ALT-LX1
- DEVICE_ID=AMSKBB4914919475

Install:

- ANDROID_INSTALL_RESULT=PASS

Connectivity:

- The phone was not on the same Wi-Fi LAN during the smoke.
- API access was verified through `adb reverse tcp:8787 tcp:8787`.
- A Honor system HTTP proxy on `127.0.0.1:18089` was detected and fixed by making the Master Controller API client ignore system proxy for app API calls.

Screens reached on device:

- Today=PASS
- Drawer=PASS
- Mail=PASS
- Email Detail=PASS
- Draft Reply=PASS
- Approval=PASS
- Server Funnel History=PASS
- Safety=PASS
- Settings=PASS
- Final post-install launch=PASS

Owner-visible checks:

- Mail list shows headers/status only, not bodies or attachments.
- Email detail says the card is without body and attachments.
- Draft screen says the draft is saved and nothing was sent.
- Approval screen shows "Пакет не отправлен".
- Approval screen shows final text, channel, risk, and control marker.
- After pressing the owner approval CTA, the app says the card was sent to owner Telegram.
- Client email was not sent.
- Safety/history screens show no auto-reply, no mass send, no payment, and no production write.
- Final post-install Today screen shows stale data as stale, not as a false green state.

Private screenshots:

See `PRIVATE_SCREENSHOT_INDEX.md`.
