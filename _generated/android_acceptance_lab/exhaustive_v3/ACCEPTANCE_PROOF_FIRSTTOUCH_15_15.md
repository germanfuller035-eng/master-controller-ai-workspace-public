# ACCEPTANCE PROOF — FIRSTTOUCH 15/15 CLEAN (2026-06-22)

App: ru.dmitry.matercontroller.debug 0.8.0-rc6 (code 30). Backend: prod VPS (deployed this session).
Runner: ScreenByScreenRunner, экран firsttouch, -Fresh.

## РЕЗУЛЬТАТ
SCREEN_BATCH: executed=15 passed=15 failed=0 unexecuted=0 status=CLEAN

| CTRL | selector | status | action |
|------|----------|--------|--------|
| 0131 | screen.firsttouch.control.back | PASS_VISIBLE_ENABLED | observe |
| 0132 | screen.firsttouch.control.refresh | PASS_LIVE_READ | refresh |
| 0133 | ft_scored | PASS_VISIBLE_ENABLED | click_no_move |
| 0134 | ft_eligible | PASS_VISIBLE_ENABLED | click_no_move |
| 0135 | ft_pilot | PASS_VISIBLE_ENABLED | click_no_move |
| 0136 | ft_blocked_* | PASS_EMPTY_STATE_VERIFIED | no_blocked_candidates |
| 0137 | ft_close | PASS_VISIBLE_ENABLED | dialog control present (inner-scroll) |
| 0138 | ft_generate | PASS_VISIBLE_ENABLED | dialog control present (inner-scroll) |
| 0139 | ft_select_subject | PASS_VISIBLE_ENABLED | post_draft present + clicked (no-send) |
| 0140 | ft_select_body | PASS_VISIBLE_ENABLED | post_draft present + clicked (no-send) |
| 0141 | ft_approve_text | PASS_VISIBLE_ENABLED | post_draft present + clicked (no-send) |
| 0142 | ft_return_audit | PASS_VISIBLE_ENABLED | post_draft present + clicked (no-send) |
| 0143 | ft_reject | PASS_STATE_TOGGLED | executed_no_send (server msg "Отклонение — готово") |
| 0144 | ft_select_pilot | PASS_STATE_TOGGLED | executed_no_send (server msg "Выбор пилота — готово") |
| 0145 | ft_cand_* | PASS_VISIBLE_ENABLED | candidate card opens dialog |

POST_DRAFT_CONTROLS_TOTAL=6 (CTRL-0139..0144), все PASS.

## SERVER REREAD (независимый, через node на VPS с env)
- pilot.selected_lead_id = TEST_ONLY_FT_ACCEPT_V3 (CTRL-0144 реально выполнен)
- draft0: lead_id=TEST_ONLY_FT_ACCEPT_V3, status=TEXT_APPROVED, selected_subject_id=subj_a
- decisions: 18 записей, ВСЕ no_send=true
- ft_drafts_linked=9, ft_decisions_linked=18, ft_idem_linked=9 (накоплено за 2 прогона; все на синтетике)
- real_leads=40 (НЕ изменилось от baseline)
- send_ledger lines=7 (НЕ изменилось → SEND_LEDGER_DELTA=0)

## РЕЖИМНАЯ ИЗОЛЯЦИЯ (на проде, после seed)
- pilotCandidates(false): top5[0]=cand_04066fcfaa00 (реальный), синтетик НЕ в top5, leads_scored=40
- pilotCandidates(true): top5[0]=TEST_ONLY_FT_ACCEPT_V3 (синтетик первый), eligible=true
- truth(): total_leads=40, синтетик НЕ в per_lead
- mini-audit getStatus: needsCheck=40 (синтетик НЕ протёк)

## SAFETY
CLIENT_MESSAGES_SENT=0, COMMERCIAL_EMAILS_SENT=0, SMTP_CALLS=0, FOLLOWUPS_SENT=0,
PAYMENT_OPERATIONS=0, SEND_LEDGER_DELTA=0. AUTOSEND=BLOCKED, SEND_ALLOWED_LIVE=OFF,
CONTROLLED_SEND_GATE=DISABLED. Все post-draft команды — no_send=true (server-enforced).

## HARNESS-ФИКСЫ (androidTest, версию НЕ повышали)
1. scrollDialogToText: inner-scroll внутри AlertDialog перед By.text-матчем post-draft кнопок.
2. polling-открытие диалога (device.wait Until "Закрыть", 6s) + retry клика — устранил флаку
   ft_candidate_dialog_not_open (1-й прогон 9/15, причина — async GET кандидата дольше фикс. 800ms).
3. ft_cand_ ветка (CTRL-0145): тап карточки → открытие диалога → закрытие.
4. SAFETY: post-draft команды выполняются ТОЛЬКО если открытый диалог = TEST_ONLY (отказ на реальном).
