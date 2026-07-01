# Handoff

NEXT_STEP=OWNER_MANUAL_REVIEW_ON_HONOR

Installed app:

- Package: `ru.dmitry.matercontroller.debug`
- Device: `Honor ALT-LX1 AMSKBB4914919475`
- APK: `apps/mater_controller_android/app/build/outputs/apk/debug/app-debug.apk`

Owner review path:

1. Open local mode if server is unavailable.
2. Open `Продажи`.
3. Enter only a company site.
4. Review detected facts. If facts are unknown, fill them manually.
5. Add or confirm contact/channel manually.
6. Review/edit draft.
7. Pass QA or record explicit owner override reason.
8. Create send packet.
9. Review final text, packet code and risks.
10. Only owner may open mail and send manually.
11. Mark result only after the real manual action.

Hard gates still closed:

- auto-send;
- social/messenger/SMS outbound;
- payments;
- production DB writes;
- VPS/DNS/HAPP/proxy changes.

No real outbound was performed during this closeout.
