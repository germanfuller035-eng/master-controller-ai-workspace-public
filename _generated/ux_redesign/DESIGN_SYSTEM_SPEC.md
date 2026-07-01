# Android owner design system spec

UPDATED_AT=2026-06-26 Europe/Moscow

## Tokens

- Spacing: 4, 8, 12, 16, 20, 24, 32 dp.
- Touch target: minimum 48dp, owner command target 56dp.
- Card radius: 8dp or existing Material3 default when system-owned.
- Typography: label for metadata, title for screen/card intent, body for owner explanation.
- Layout: no nested UI cards; full-width bands/columns for sections.

## Semantic colors

- Safe: positive/system OK.
- Attention: owner decision needed.
- Critical: action could affect operations, send, cost, data, or access.
- Offline: cached data, no live success.
- No Send: explicit guarantee for messaging/payment boundaries.

## Components

- `OwnerStatusChip`: small non-clickable status label.
- `RiskBadge`: R0-R5 risk marker with owner-readable meaning.
- `OwnerActionCard`: scan-friendly card with title, subtitle, optional status/count.
- `ApprovalRiskCard`: explains what action changes, what it cannot do, and what owner should check.
- `IncidentCard`: critical incident summary with severity and next action.
- `EvidenceRollbackBlock`: shows evidence and rollback location together.
- `PrimaryBottomAction`: bottom-aligned primary action for one-hand reach.
- `OwnerEmptyState`, `OwnerErrorState`, `OwnerLoadingState`, `OwnerOfflineBanner`: state components that keep existing test tags.
- `OwnerStopComponent`: visible System/critical STOP entry, non-mutating unless future backend contract is added.

## Implementation policy

- Keep existing `state_loading`, `state_empty`, `state_error`, `banner_offline` tags.
- Keep existing screen anchors.
- New components live in `core/ui/CommonUi.kt` unless a deeper designsystem split becomes necessary.
- Do not introduce a new dependency for visuals.
