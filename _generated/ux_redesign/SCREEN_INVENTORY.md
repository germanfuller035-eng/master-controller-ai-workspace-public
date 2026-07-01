# Android screen inventory

UPDATED_AT=2026-06-26 Europe/Moscow
SOURCE=`exec_plan.json`, `screen_anchors.json`, Compose source, Session 0 evidence
SCREEN_COUNT=41

Legend:

- Loading/Error/Offline: common `LoadingState`, `ErrorState`, `OfflineBanner` unless noted.
- Empty: explicit `EmptyState` or screen-local empty text where data-gated production empty state is valid.
- Coverage: Session 0 Run 2 final PASS unless noted in detail; controls count from `exec_plan.json`.

| Screen | Purpose | Owner question | Primary action | Secondary actions | States | Risk/approval | Coverage | UX defects and improvements |
|---|---|---|---|---|---|---|---|---|
| home | Today command entry | What needs attention now? | Open next action / command center | Open commerce, campaigns, Mini Audit queues | Loading/error/offline; no strong empty summary | send-ready/follow-up cards imply risk | 13 controls, anchor `today_screen` | Needs 5-10 second situational summary, clearer primary action, owner status chips. |
| commandcenter | Owner command center | Is the system safe and what changed? | Review decisions/incidents | Read recent events and automatic actions | Loading/error/offline | critical incidents and owner decisions | 3 controls, anchor `command_center_screen` | Needs stronger incident cards and STOP/critical route relation. |
| campaigns | Campaign governor | Are campaigns/cohorts safe? | Inspect campaign/cohort state | Read no-send badge | Loading/error via VM pattern; empty production list valid | no-send | 3 controls, anchor `campaigns_screen` | Needs normal empty state and commerce placement. |
| commercial | Commercial summary | Where is revenue blocked? | Open commercial queue that needs owner action | Catalog, queues, agents, costs, sources, knowledge, first touch, multichannel, conversations, delivery, offers | Loading/error/offline | no-send, review-only | 31 controls, anchor `commercial_summary` | Overloaded long list; should become commerce hub with clearer grouping and one primary action. |
| pipeline | Leads hub | Which lead pipeline needs work? | Open highest-priority queue | Mini Audit | Static hub; nested queues have states | lead send/readiness risk downstream | 7 controls, anchor `leads_home` | Should move under Commerce while preserving route and runner nav. |
| approvals | Approval hub | What must I approve or reject? | Open approval queue | Read no-send warning | Static hub | approvals save decisions but do not send | 5 controls, anchor `approvals_home` | Needs decision-first hierarchy and risk explanations per queue. |
| replies | Replies inbox | Which replies need response? | Filter/open reply | Switch filter tabs | Loading/error/offline/empty | response drafting risk downstream | 5 controls, anchor `replies_screen` | Should move under Commerce; empty states are useful but need next action language. |
| operations | System hub | Is the system healthy and stoppable? | Use STOP / inspect health | Reliability, cost, backup, push, automation, queues, sources, settings | Offline banner; details have loading/error/empty | critical system controls | 22 controls, anchor `operations_home` | Needs top-level STOP component and reduced technical density. |
| reliability | Reliability center | What is broken or self-healed? | Inspect service health | Autopilot filters | Loading/error/offline | incident/recovery status | 3 controls, anchor `reliability_screen` | Needs incident-card treatment and human status chips. |
| cost | Cost and capacity | Are AI costs within budget? | Open AI usage detail | Refresh/back | Loading/error/offline | cost overrun risk | 3 controls, anchor `cost_center_screen` | Should live in Agents/AI zone; "calculated units" needs owner framing. |
| backup | Backup center | Can we recover safely? | Run non-destructive drill | Inspect backup inventory | Loading/error/offline | rollback/evidence | 4 controls, anchor `backup_center_screen` | Needs evidence/rollback block and clearer non-destructive label. |
| push | Push settings | Will owner notifications arrive? | Adjust push preferences | Refresh/back/severity | Loading/error/offline | notification delivery | 4 controls, anchor `push_settings_screen` | Needs owner wording for notification risk. |
| knowledge | Knowledge radar | What external facts changed? | Open digest/source/status | Refresh/back | Loading/error/offline/empty | no auto action | 11 controls, anchor `knowledge_home` | Keep read-only; place under Agents/AI or System as support. |
| sources | Source registry | Which lead sources are healthy? | Inspect source registry | Refresh/back/filter | Loading/error/offline/empty | source cost/access | 6 controls, anchor `source_registry` | Owner text should hide provider internals where possible. |
| reservoir | Domain reservoir | Is source capacity available? | Inspect reservoir | Refresh/back | Loading/error/offline | capacity risk | 2 controls, anchor `reservoir` | Needs concise capacity summary. |
| ai | AI usage | What is AI spending? | Inspect usage | Refresh/back | Loading/error/offline | cost risk | 2 controls, anchor `ai_usage` | Should move to Agents/AI top zone. |
| ownersettings | Owner limits/settings | Are automation limits safe? | Review/save limits with confirmation | profile/strategy/range controls | Loading/error/offline; mutation states | paid source and automation limits | 17 controls, anchor `owner_settings` | Needs standardized risk badges and save explanation. |
| settings | Connection settings | Is this device connected correctly? | Change connection/profile | theme, background refresh, notifications, unpair | Local state; dangerous unpair dialog | unpair is dangerous | 11 controls, anchor `settings_screen` | Needs STOP/System relation and clearer destructive dialog. |
| firsttouch | First Touch Strategist | Which lead should be piloted? | Prepare/select pilot draft | select subject/body, approve text, return, reject | Loading/error/offline/empty candidates | no-send but approval-sensitive | 15 controls, anchor `first_touch` | Needs owner approval card pattern and clearer no-send guarantee. |
| agents | Agents dashboard | Are agents safe, cheap and useful? | Run shadow analysis preview | refresh/back, inspect provider/roles | Loading/error/offline | shadow run, no-send, budget | 11 controls, anchor `agents` | Should become top-level Agents tab; needs human status cards and budget risk badges. |
| catalog | Product catalog | What can be offered? | Open product | Refresh/back | Loading/error/offline/empty | pricing/offer context | 10 controls, anchor `catalog_list` | Should sit under Commerce and use owner cards. |
| multichannel | Multichannel | Are inbound/channel queues clear? | Inspect inbound/conflict/drafts/quarantine | source/channel rows | Loading/error/offline/empty inbound marker | no-send | 9 controls, anchor `multichannel` | Empty inbound acceptance must remain stable; improve empty copy. |
| transport | Delivery review | Which delivery statuses require reconciliation? | Inspect delivery record if present | Refresh/back | Loading/error/offline; empty "Нет записей на сверку" valid | delivery truth risk | 8 controls, anchor `delivery_review` | Move under Commerce; clearer risk explanation. |
| miniaudit | Mini Audit home | Which lead needs audit/email work? | Open next bucket/lead | Refresh/back/show why | Loading/error | send and proof risk downstream | 18 controls, anchor `ma_home` | Keep but route through Commerce/Today; needs stronger primary action. |
| automation | Automation status | Is automation allowed to act? | Inspect writer/autosend | none | Loading/error | autosend/live-send risk | 8 controls, anchor `automation_screen` | Needs System/STOP framing and less raw technical state. |
| ops_deadletters | Dead letters | What failed and can be retried? | Retry failed job if present | back/refresh through detail | Empty valid | retry is refresh-like, no send | 1 control, anchor `ops_deadletters` | Needs explanation of retry risk. |
| ops_sources | Legacy source health | Are configured sources safe? | Inspect known sources | none | Static | credentials hidden | 1 control, anchor `ops_sources` | Good safety; wording can be calmer. |
| owner_incidents | Incident list | Which critical incidents exist? | Inspect incident/action | Back/refresh | Loading/error/offline/empty gated from command center | incident risk | 2 controls, anchor `owner_list_incidents` | Needs incident-card component. |
| owner_queues | Owner queues | What operational/commercial queues need owner attention? | Open ready-for-send review | open queue types | Loading/error/offline | no-send, queue decisions | 7 controls, anchor `owner_queues` | Should be Commerce quick-action hub. |
| approval_detail | Approval detail | Should this item be deferred or rejected? | Defer/reject no-send decision | Refresh/back, read audit/email | Loading/error; mutation progress | decision save, no send | 4 controls, anchor `approval_detail_` | Needs risk card, next-action copy, no false success standard. |
| approval_list | Approval queue list | Which items in this queue need action? | Open item | Refresh/back | Loading/error/offline/empty | approval risk downstream | 2 controls, anchor `approval_list_` | Empty copy good but can add next action. |
| commandcenter_commercial | Commercial command center | What commercial command is possible? | Preview command | back | Existing command screen | no-send | 4 controls, anchor `command_center` | Keep under Commerce; ensure no-send and risk copy. |
| offer_review | Offer review list | Which offers are ready for send review? | Open offer if present | Refresh/back | Loading/error/offline/empty valid | no actual send | 1 control, anchor `offer_review_list` | Empty is valid; primary action should be clearer. |
| offer_detail | Offer detail | Is this offer safe to approve/reject? | Preview action only | approve/reject/defer preview, close preview | Loading/error/offline/empty not found; preview loading | approval/no-send/payment risk | 9 controls, anchor `offer_detail_` | Needs standardized approval card and risk explanation before action. |
| knowledge_digest | Knowledge digest | What urgent knowledge changed? | Read digest | back/refresh | Loading/error/offline/empty | no action | 3 controls, anchor `knowledge_digest` | Fine; use owner empty copy. |
| ma_lead | Lead detail | What is known about this lead? | Move to relevant workflow | tabs/audit/email/history controls | Loading/error | send controls data-gated | 6 controls, anchor `lead_detail` | Technical IDs should be less prominent. |
| ma_list | Mini Audit list | Which leads in bucket need action? | Search/open lead | refresh/back | Loading/error/offline/empty | lead action downstream | 3 controls, anchor `ma_list_needs_check` | Good list; improve one-hand actions. |
| source_telemetry | Source telemetry | Which sources are degraded or expensive? | Filter telemetry | refresh/back | Loading/error/offline/empty | source cost/reliability | 2 controls, anchor `source_telemetry` | Needs status chips and no raw provider statuses. |
| product_detail | Product detail | Can this product be offered? | Inspect details | back | Static/detail states | pricing risk | 1 control, anchor `product_detail` | Needs commerce context and risk badge. |
| test_only | Test-only diagnostics | Are test records separated? | Inspect diagnostics | back/refresh | Loading/error/offline | dev/owner acceptance only | 2 controls, anchor `to_badge` | Keep reachable but clearly diagnostic. |
| conversations | Conversations | What happened in customer dialogue? | Open timeline if present | close dialog | Loading/error/offline/empty valid | read-only | 3 controls, anchor `conversations` | Empty acceptance must remain stable; should sit under Commerce. |

## Required screen-level state policy

- Loading: every data-backed screen must leave `state_loading` and reach content, empty, error or offline-with-cache.
- Empty: empty queues are normal work states; they must keep explicit text and stable markers.
- Error: error must tell owner the next action: retry, reconnect, check route, or wait for server.
- Offline/cache: cached content must be labeled with timestamp and must not imply a successful live mutation.
- Risk/approval: any action that saves a decision, starts analysis, retries, unpairs, changes limits, previews send or touches a risky queue must state what will and will not happen.
