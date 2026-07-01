# Apple/Samsung ergonomics reference

UPDATED_AT=2026-06-26 Europe/Moscow
NOTE=Directional UX reference only; no proprietary UI copied.

## Applied reference patterns

| Principle | Reference behavior | Android implementation direction |
|---|---|---|
| Immediate situation summary | Top apps lead with the current state and next action. | Today starts with owner situation, status chips and one primary next action. |
| One-hand reach | Critical commands live in bottom/central reach zones. | Primary bottom action component and shorter hub sections. |
| Large touch targets | Frequent commands have large, stable tap areas. | Owner cards use 56dp+ content height and stable tags. |
| Predictable navigation | Top-level zones are few and semantically stable. | Five tabs: Today, Decisions, Commerce, Agents, System. |
| Human risk copy | Critical actions tell what happens and what does not happen. | Risk badges R0-R5 plus approval cards/no-send blocks. |
| Calm state language | Empty/offline/error are normal states with next step. | Standard state surfaces for empty/error/loading/offline. |
| Status at a glance | Color and labels summarize system state without raw codes. | Semantic colors and status chips: OK, Attention, Critical, Offline, No Send. |

## Boundaries

- Do not copy Apple or Samsung proprietary visual assets, layouts, icons or wording.
- Use Material3 and existing Compose libraries.
- Keep Master Controller identity and owner domain language.
