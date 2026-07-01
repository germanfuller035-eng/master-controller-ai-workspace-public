# Component registry

UPDATED_AT=2026-06-26 Europe/Moscow

| Component | File | Tags | First use | Purpose |
|---|---|---|---|---|
| `LoadingState` | `core/ui/CommonUi.kt` | `state_loading` | Existing screens | Stable loading marker. |
| `ErrorState` | `core/ui/CommonUi.kt` | `state_error`, `btn_retry` | Existing screens | Error plus retry; will gain next-action copy. |
| `EmptyState` | `core/ui/CommonUi.kt` | `state_empty` | Existing screens | Normal empty queue/list state. |
| `OfflineBanner` | `core/ui/CommonUi.kt` | `banner_offline` | Existing screens | Cached-data warning. |
| `SectionCard` | `core/ui/CommonUi.kt` | caller-provided | Existing hub screens | Existing generic card, kept for compatibility. |
| `OwnerStatusChip` | `core/ui/CommonUi.kt` | caller-provided | New hubs | Human status chip. |
| `RiskBadge` | `core/ui/CommonUi.kt` | caller-provided | Approvals/offers/agents/system | R0-R5 risk display. |
| `OwnerActionCard` | `core/ui/CommonUi.kt` | caller-provided | Today/Commerce/Agents/System | Ergonomic owner card. |
| `ApprovalRiskCard` | `core/ui/CommonUi.kt` | caller-provided | Approval detail/offer detail/agents | Human risk explanation. |
| `IncidentCard` | `core/ui/CommonUi.kt` | caller-provided | Command Center/System | Critical incident summary. |
| `EvidenceRollbackBlock` | `core/ui/CommonUi.kt` | caller-provided | Backup/System reports | Evidence and rollback in one block. |
| `PrimaryBottomAction` | `core/ui/CommonUi.kt` | caller-provided | Hubs/details | One-hand primary command. |
| `OwnerStopComponent` | `core/ui/CommonUi.kt` | `owner_stop_component` | System/critical context | STOP visibility without backend mutation. |

## Compatibility rules

- Old tags such as `card_commercial`, `cs_agents`, `ops_card_*`, `approval_detail_*`, `offer_detail_*` remain unless the runner plan is updated in the same commit.
- Components must be UI-only. They cannot call backend, mutate production, send messages or write payment data.
