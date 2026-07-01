# Run 1 Tail Manual Ledger

Device: Honor ALT-LX1 / AMSKBB4914919475
Package under test: ru.dmitry.matercontroller.debug
Date: 2026-06-25

Scope:
- Recovery durable green screens excluding tail: 37 screens / 260 controls.
- Tail closed in this ledger: multichannel, transport, test_only, conversations.
- Tail controls: 22 executed, 22 passed, 0 failed, 0 unexecuted.
- Full Run 1 aggregate: 282 executed, 282 passed, 0 failed, 0 unexecuted.

Recovery source:
- `_generated/full_run_1_invalid_partial_20260625T121102/**`
- Best log selection per screen was used; `_clean_screens.txt` alone was not trusted.
- `multichannel` archived best log remained 9 executed / 8 passed / 1 unexecuted and was replaced by current evidence below.
- `transport`, `test_only`, and `conversations` had no current Run 1 screen logs in the archived run and were closed below.

Important API note:
- A read-only host GET to `https://195-96-132-82.sslip.io/api/v1/inbound?includeTest=true` was attempted for current server reread.
- Sandbox blocked the first attempt; escalated retry reached production but returned HTTP 401.
- Pairing/runtime auth data was not printed, copied, or committed.
- Existing archived API evidence includes `API_EVIDENCE/multichannel_inbound_includeTest_true.json`; current UI also shows inbound count 0 and no `mc_in_*` rows.

## Multichannel

Evidence:
- `_generated/full_run_1/multichannel_open_top_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/multichannel_open_top_manual.png`
- `_generated/full_run_1/multichannel_mid_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/multichannel_mid_manual.png`
- `_generated/full_run_1/multichannel_low_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/multichannel_low_manual.png`
- `_generated/full_run_1/multichannel_channels_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/multichannel_channels_manual.png`
- `_generated/full_run_1/multichannel_bottom_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/multichannel_bottom_manual.png`
- `_generated/full_run_1/multichannel_inbound_empty_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/multichannel_inbound_empty_manual.png`

Rows:
- CTRL-0205 PASS_VISIBLE_ENABLED: `screen.multichannel.control.back` visible in top app bar.
- CTRL-0206 PASS_LIVE_READ: `screen.multichannel.control.refresh` visible in top app bar.
- CTRL-0207 PASS_VISIBLE_ENABLED: `mc_q_inbound` visible, count 0.
- CTRL-0208 PASS_VISIBLE_ENABLED: `mc_q_conflicts` visible, count 0.
- CTRL-0209 PASS_VISIBLE_ENABLED: `mc_q_drafts` visible, count 0.
- CTRL-0210 PASS_VISIBLE_ENABLED: `mc_q_quarantine` visible, count 0.
- CTRL-0211 PASS_VISIBLE_ENABLED: dynamic `mc_src_*` rows visible, including `mc_src_osm_overpass`, `mc_src_vk_communities`, `mc_src_web_intake`, `mc_src_whatsapp`.
- CTRL-0212 PASS_VISIBLE_ENABLED: dynamic `mc_ch_*` rows visible, including `mc_ch_EMAIL`, `mc_ch_VK`, `mc_ch_MAX`, `mc_ch_TELEGRAM`, `mc_ch_WEB_FORM`, `mc_ch_WHATSAPP`.
- CTRL-0213 PASS_EMPTY_STATE_VERIFIED: no `mc_in_*` row present; inbound queue count is 0; archived API evidence shows inbound items empty; current direct host reread is blocked by auth (HTTP 401) without exposing tokens.

## Conversations

Evidence:
- `_generated/full_run_1/conversations_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/conversations_manual.png`
- `_generated/full_run_1/conversations_dialog_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/conversations_dialog_manual.png`

Rows:
- CTRL-0315 PASS_VISIBLE_ENABLED: dynamic `conv_*` rows visible (`conv_002`, `conv_A`, `conv_MA-1`, and others).
- CTRL-0316 PASS_NAVIGATION: tapping `conv_002` opens the read-only timeline dialog.
- CTRL-0317 PASS_VISIBLE_ENABLED: dialog close action `Закрыть` visible and used to close the dialog; no send action exists on the dialog.

## Transport

Evidence:
- `_generated/full_run_1/transport_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/transport_manual.png`
- `_generated/full_run_1/transport_after_refresh_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/transport_after_refresh_manual.png`

Rows:
- CTRL-0301 PASS_VISIBLE_ENABLED: `screen.transport.control.back` visible.
- CTRL-0302 PASS_LIVE_READ: `screen.transport.control.refresh` tapped; screen remained read-only and stable.
- CTRL-0303 PASS_EMPTY_STATE_VERIFIED: delivery review shows `Записей на сверку: 0` and `Нет записей на сверку.`; no `dr_*` owner review row is present.
- CTRL-0304 PASS_VISIBLE_ENABLED: `screen.transport.control.back` visible.
- CTRL-0305 PASS_LIVE_READ: refresh evidence shared with CTRL-0302.
- CTRL-0312 PASS_UNSAFE_ACTION_BLOCKED: transport screen states confirmed send is not asserted and automatic resend is prohibited.
- CTRL-0313 PASS_VISIBLE_ENABLED: `screen.transport.control.back` visible.
- CTRL-0314 PASS_LIVE_READ: refresh evidence shared with CTRL-0302.

## Test Only

Evidence:
- `_generated/full_run_1/test_only_manual.xml`
- `_generated/full_run_1/SCREENSHOTS/test_only_manual.png`

Rows:
- CTRL-0306 PASS_VISIBLE_ENABLED: `to_badge` visible with text `TEST - not counted in revenue` equivalent UI copy.
- CTRL-0307 PASS_VISIBLE_ENABLED: test-only summary screen visible; all test commercial counters are 0 and excluded from business metrics.

Safety counters:
- CLIENT_MESSAGES_SENT=0
- SMTP_CALLS=0
- FOLLOWUPS_SENT=0
- PAYMENT_OPERATIONS=0
- AUTOSEND=BLOCKED
- SEND_ALLOWED_LIVE=OFF
- CONTROLLED_SEND_GATE=DISABLED
