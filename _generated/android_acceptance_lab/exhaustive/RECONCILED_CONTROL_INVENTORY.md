# Reconciled Control Inventory (v2)

- Static source controls: **317**
- Runtime controls observed (10 screens): **0**
- Reconciled total: **317**
- Selectable for automation (tag or stable text): **301**
- Need a dedicated selector added: **16**

## By risk class

| risk | count |
|------|-------|
| REFRESH | 34 |
| ACTION | 134 |
| NAVIGATION | 83 |
| DANGEROUS | 28 |
| INPUT | 7 |
| DECORATIVE_OR_STATUS | 12 |
| SELECT | 13 |
| TOGGLE | 6 |

## Controls needing a selector (testTag to add)

| control_id | type | file:line | screen |
|---|---|---|---|
| CTRL-0002 | Clickable | core/ui/CommonUi.kt:61 | ui |
| CTRL-0032 | Clickable | feature/approvals/ApprovalListScreen.kt:84 | approvals |
| CTRL-0033 | Clickable | feature/approvals/ApprovalListScreen.kt:102 | approvals |
| CTRL-0071 | AssistChip | feature/catalog/CatalogListScreen.kt:93 | catalog |
| CTRL-0086 | OutlinedButton | feature/commercial/CommandCenterScreen.kt:112 | commercial |
| CTRL-0116 | Clickable | feature/commercial/OfferReviewScreens.kt:52 | commercial |
| CTRL-0146 | AssistChip | feature/home/TodayScreen.kt:39 | home |
| CTRL-0170 | OutlinedButton | feature/knowledge/KnowledgeScreens.kt:216 | knowledge |
| CTRL-0203 | Clickable | feature/miniaudit/MiniAuditListScreen.kt:66 | miniaudit |
| CTRL-0264 | OutlinedButton | feature/projects/ProjectsScreen.kt:53 | projects |
| CTRL-0269 | Switch | feature/push/PushSettingsScreen.kt:158 | push |
| CTRL-0275 | Clickable | feature/replies/RepliesScreen.kt:70 | replies |
| CTRL-0308 | SectionCard | feature/transport/TransportScreens.kt:86 | transport |
| CTRL-0309 | SectionCard | feature/transport/TransportScreens.kt:87 | transport |
| CTRL-0310 | SectionCard | feature/transport/TransportScreens.kt:88 | transport |
| CTRL-0311 | SectionCard | feature/transport/TransportScreens.kt:89 | transport |
