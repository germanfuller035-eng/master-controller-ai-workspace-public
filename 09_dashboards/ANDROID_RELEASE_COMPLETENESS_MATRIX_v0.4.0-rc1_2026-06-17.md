# Android Release Completeness Matrix — v0.4.0-rc1

Date: 2026-06-17. Source commit: ef6eaf3 (verified). Navigation: compact 5-tab bottom bar
(Today · Leads · Decisions · Replies · System) — confirmed in MaterControllerRoot.kt.

## Required screen / feature coverage

| Required screen | Compose screen | ViewModel | API method | Status |
|---|---|---|---|---|
| Today | home/TodayScreen.kt | TodayViewModel | GET mini-audit/next-action, jobs/counts | PRESENT |
| Next Action | (Today surfaces next-action) | TodayViewModel | GET mini-audit/next-action | PRESENT |
| Product Routing | pipeline/PipelineQueueScreen.kt (PRODUCT_ROUTING) | PipelineQueueViewModel | GET pipeline/by-status/manual_review_product_routing | PRESENT |
| STAGING | pipeline/PipelineQueueScreen.kt (STAGING) | PipelineQueueViewModel | GET pipeline/by-status/STAGING | PRESENT |
| VERIFIED_READY | pipeline/PipelineQueueScreen.kt (VERIFIED_READY) | PipelineQueueViewModel | GET pipeline/by-status/verified_ready | PRESENT |
| Lead Detail | miniaudit/LeadDetailScreen.kt | LeadDetailViewModel | GET mini-audit/leads/{id} (+/audit,/email-preview) | PRESENT |
| Audit Queue | miniaudit/MiniAuditListScreen.kt | MiniAuditListViewModel | GET mini-audit/leads | PRESENT |
| Audit Detail | miniaudit/LeadDetailScreen.kt (audit tab) | LeadDetailViewModel | GET mini-audit/leads/{id}/audit | PRESENT |
| Draft Queue | approvals/ApprovalListScreen.kt | ApprovalListViewModel | GET mini-audit/leads (approval bucket) | PRESENT |
| Draft Detail | approvals/ApprovalDetailScreen.kt | ApprovalDetailViewModel | GET email-preview; POST approve/reject/postpone | PRESENT |
| Replies | replies/RepliesScreen.kt | RepliesViewModel | GET replies, replies/open, replies/counts | PRESENT |
| Reply Thread | replies/RepliesScreen.kt (detail) | RepliesViewModel | GET replies/{id} | PRESENT |
| Reply Drafts | replies/RepliesScreen.kt | RepliesViewModel | GET replies (draft state) | PRESENT (read-only) |
| Reply Draft Detail | replies/RepliesScreen.kt | RepliesViewModel | GET replies/{id} | PRESENT (read-only) |
| Follow-ups | (Today/Operations surface) | TodayViewModel/OperationsViewModel | GET mini-audit/followups | PRESENT |
| Follow-up Detail | via mini-audit/followups/{id}/preview | OperationsViewModel | GET mini-audit/followups/{id}/preview | PRESENT (read-only) |
| Automation Status | automation/AutomationScreen.kt + ops "automation" | AutomationViewModel/OperationsViewModel | GET automation/status | PRESENT |
| Source Health | operations/OperationsScreens.kt "sources" | OperationsViewModel | GET system/status (sources) | PRESENT |
| Scheduler | operations/OperationsScreens.kt "scheduler" | OperationsViewModel | GET automation/status (scheduler) | PRESENT |
| Queue Overview | operations/OperationsScreens.kt "queue" | OperationsViewModel | GET jobs, jobs/counts | PRESENT |
| Dead Letters | operations/OperationsScreens.kt "deadletters" | OperationsViewModel | GET jobs (dead-letter) + retry | PRESENT |
| Connection Settings | auth/ConnectionScreen.kt + settings/SettingsScreen.kt | AuthViewModel/SettingsViewModel | GET health; POST auth/pairing/* | PRESENT |

All 22 required release screens PRESENT. System tab consolidates the operational screens
(Automation, Queue, Dead Letters, Sources, Scheduler) via OperationsScreens section router.

## Compact navigation gate

PASS. 5-tab bottom bar (Today, Leads, Decisions/Approvals, Replies, System) — the crowded
7-tab layout was refactored. Confirmed in MaterControllerRoot.kt Tab sealed class.

## Write surface

All mutations are HTTPS API POSTs (approve/reject/postpone/send-prepare/check-proof). Replies,
reply drafts, follow-ups are read-only on Android (mutation path stays VPS/API). No direct
canonical file writes in Android source.

ANDROID_REQUIRED_SCREENS=PASS
ANDROID_COMPACT_NAVIGATION=PASS
