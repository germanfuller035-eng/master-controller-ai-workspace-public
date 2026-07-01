# Telegram Owner Smoke Checklist (OWNER PERFORMS — NOT_RUN)

date: 2026-06-17 · TELEGRAM_OWNER_SMOKE=NOT_RUN (must be performed by the owner on the real device)

Service is LIVE-verified running (1 poller, user mctelegram, 0 restarts, isolated). The following
checks require the owner to physically tap in Telegram — Claude must NOT fake them.

1. Send `/ping` → expect prompt healthy reply.
2. Send `/health` → expect health summary, no raw objects, no secrets.
3. Tap `📊 Сегодня` → today summary.
4. Tap `🎯 Следующее действие` → next-best-action.
5. Verify the reason is human-readable Russian (not a raw enum/object).
6. Verify a canonical lead ID is displayed correctly.
7. Tap a real `📂 Открыть лид` inline button.
8. Verify the lead card opens.
9. Tap the persistent `🏠 Меню` button.
10. Send `/lead` → verify the lead selector.
11. Verify the selector works.
12. Confirm NO raw internal objects are shown anywhere.
13. Confirm the operational count is explained (not a bare number).
14. Confirm NO send is triggered by any of the above.

Record PASS/PARTIAL/FAIL per item. FINAL_STATUS cannot be COMPLETE until this is PASS.

---
## OWNER SMOKE RESULT (first run): FAIL_WITH_UX_DEFECTS
Defects: (1) /health showed raw English status keys; (2) text "меню" → "Неизвестная команда";
(3) /next had no real inline 📂 Открыть лид button (text only); (4) /leads gave a dead-end with no
filter explanation; (5) Russian next-action reason unconfirmed.

## HOTFIX APPLIED IN BRANCH (not yet deployed — Gate B pending)
- /health fully Russian, no raw keys, unknown→"Другой рабочий статус".
- /next returns a real inline_keyboard button 📂 Открыть лид (callback lead:<canonical_id>) + /lead fallback.
- callback lead:<id> = read-only API getLead, no mutation; unauthorized callback returns no data.
- centralized Russian renderNextActionReason covering all reason codes.
- "меню"/"Меню"/"🏠 Меню"/"/menu" all route to one menu handler.
- /leads + /lead-no-id show real inline buttons + explicit "Показаны лиды со статусом: …" filter;
  empty queue offers other-queue buttons instead of a dead end.
Tests: 47 + 18 + 18 + 20 green. TELEGRAM_OWNER_SMOKE=FAIL_WITH_UX_DEFECTS until owner re-runs post-deploy.

---
## HOTFIX DEPLOYED (Gate B executed 2026-06-17T20:57Z) — OWNER RETEST REQUIRED
TELEGRAM_HOTFIX_DEPLOYMENT=PASS · TELEGRAM_OWNER_SMOKE=NOT_RUN · CLIENT_ACCEPTANCE_STATUS=PENDING_OWNER_RETEST
Owner re-runs on the LIVE bot (now PID 7080, deployed hashes b7b5eea0/99071ffa):
1. /health → Russian status names, no English keys.
2. 🎯 Следующее действие → Russian reason + real 📂 Открыть лид button.
3. Tap 📂 Открыть лид → ДКБИ lead card opens (read-only).
4. Type "меню" (no slash) → menu opens (not "Неизвестная команда").
5. 🏠 Меню persistent button → menu.
6. /lead and /leads → selectable list + explained filter, no dead end.
7. Confirm no raw objects / English statuses; confirm NO send occurred.

---
## PARTIAL OWNER SMOKE → 2 RESIDUAL UX DEFECTS FIXED IN BRANCH (Gate B pending, not deployed)
date 2026-06-18 · TELEGRAM_OWNER_SMOKE=PARTIAL · FINAL_UX_FIX_REQUIRED=YES (now fixed in branch)
Owner screenshots showed two residual defects after the deployed hotfix:
- Defect 1: /next reason too generic ("Требуется проверить следующее действие.") for DKBI_RU.
  ROOT CAUSE: live DTO is { kind, reason, lead }; renderer never read stable `kind` and the raw
  English `reason` was unmapped → generic fallback. FIXED: `kind` is now a structured lookup +
  canonical reason_code allowlist. DKBI now reads "Доставка письма подтверждена. Прошло более
  48 часов — пора проверить ответ и подготовить follow-up."
- Defect 2: lead card exposed candidate_score_v2 / canonical_score_v1 / revision / raw waiting_reply
  and "—" placeholders. FIXED: fully localized owner-facing card; empty technical fields hidden;
  "Блокеры: отсутствуют"; no raw enum / null / undefined / "—".
Changed runtime file (Gate B): views.mjs only (99071ffa → dd45b613). index.mjs unchanged.
Tests: tg_api_only 74, handler_routing 18, api_client 18, routing_smoke 20 — all green; TESTS_FAILED=0.
TELEGRAM_OWNER_SMOKE stays PARTIAL until owner re-runs on the LIVE bot after Gate B deploy+restart.
See _generated/launch/reports/GATE_B_TELEGRAM_FINAL_UX.md for the exact deploy package.

---
## FINAL UX DEPLOYED (Gate B APPROVED + executed 2026-06-17T22:24Z) — OWNER RETEST REQUIRED
TELEGRAM_FINAL_UX_DEPLOYMENT=PASS · TELEGRAM_OWNER_SMOKE=NOT_RUN · CLIENT_ACCEPTANCE_STATUS=PENDING_OWNER_RETEST
views.mjs 99071ffa → dd45b613 (verified) · telegram restarted once (PID 7080→7757) · 1 poller · 0 conflicts ·
canonical rev 66 / 50 leads / 7 sends unchanged · 0 dead letters · autosend BLOCKED · 33/33 server-side UX checks PASS.
NEW_SOAK_T0=2026-06-17T22:24:14Z (previous 2026-06-17T20:57:18Z archived). See TELEGRAM_FINAL_UX_DEPLOYMENT.md.
Owner re-runs on the LIVE bot (now PID 7757):
1. 🎯 Следующее действие → specific Russian reason про доставку + 48 часов (NOT generic).
2. 📂 Открыть лид → ДКБИ card: Russian status + route; no waiting_reply / candidate_score_v2 /
   canonical_score_v1 / empty revision; Блокеры: отсутствуют.
3. /health → Russian, no raw keys.
4. Confirm NO send occurred.
Do NOT mark owner smoke PASS until owner screenshot/reply received.
