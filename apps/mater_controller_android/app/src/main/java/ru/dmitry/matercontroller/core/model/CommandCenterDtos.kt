// CommandCenterDtos.kt — Owner Command & Autonomy Center (0.8.0) wire DTOs.
// No namingStrategy: each Kotlin property name == its snake_case wire name.
// All fields nullable/default so partial payloads parse.
package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.Serializable

@Serializable
data class OwnerEvent(
    val event_id: String,
    val event_type: String? = null,
    val severity: String? = null,
    val entity_type: String? = null,
    val title_ru: String? = null,
    val summary_ru: String? = null,
    val impact_ru: String? = null,
    val owner_action_required: Boolean = false,
    val deep_link: String? = null,
    val occurred_at: String? = null,
)

@Serializable
data class OwnerEventsData(val items: List<OwnerEvent> = emptyList(), val total: Int = 0)

@Serializable
data class EventsSummary(val total: Int = 0, val by_severity: Map<String, Int> = emptyMap())

@Serializable
data class OwnerNotification(
    val notification_id: String,
    val severity: String? = null,
    val title_ru: String? = null,
    val summary_ru: String? = null,
    val impact_ru: String? = null,
    val owner_action_required: Boolean = false,
    val deep_link: String? = null,
    val state: String? = null,
    val created_at: String? = null,
)

@Serializable
data class OwnerNotificationsData(val items: List<OwnerNotification> = emptyList(), val total: Int = 0)

@Serializable
data class UnreadCount(val unread: Int = 0)

@Serializable
data class OwnerDecisionDto(
    val decision_id: String,
    val category: String? = null,
    val priority: String? = null,
    val title_ru: String? = null,
    val consequence_ru: String? = null,
    val performs_outbound: Boolean = false,
    val reversible: Boolean = true,
    val status: String? = null,
    val decision_revision: Int = 0,
    val allowed_actions: List<String> = emptyList(),
)

@Serializable
data class OwnerDecisionsData(val items: List<OwnerDecisionDto> = emptyList(), val total: Int = 0)

@Serializable
data class IncidentDto(
    val incident_id: String,
    val severity: String? = null,
    val entity_type: String? = null,
    val title_ru: String? = null,
    val summary_ru: String? = null,
    val state: String? = null,
    val event_count: Int = 0,
    val first_seen: String? = null,
    val last_seen: String? = null,
)

@Serializable
data class IncidentsData(val items: List<IncidentDto> = emptyList(), val total: Int = 0)

@Serializable
data class IncidentsSummary(val total: Int = 0, val active: Int = 0, val p0: Int = 0)

@Serializable
data class AutopilotDto(
    val mode: String? = null,
    val updated_at: String? = null,
    val kill_switch: KillSwitchDto? = null,
    val sends: Boolean = false,
)

@Serializable
data class KillSwitchDto(val enabled: Boolean = false, val reason: String? = null, val updated_at: String? = null)

// Command center snapshot (the four owner answers) from GET /next-actions.
@Serializable
data class OwnerSnapshot(
    val recent_events: List<SnapshotEvent> = emptyList(),
    val system_state_ru: String? = null,
    val primary_constraint: PrimaryConstraint? = null,
    val automatic_actions: List<AutomaticAction> = emptyList(),
    val owner_decisions: List<SnapshotDecision> = emptyList(),
    val critical_incidents: List<SnapshotIncident> = emptyList(),
)

@Serializable
data class SnapshotEvent(val severity: String? = null, val title_ru: String? = null, val deep_link: String? = null)
@Serializable
data class PrimaryConstraint(val kind: String? = null, val text_ru: String? = null, val deep_link: String? = null)
@Serializable
data class AutomaticAction(val playbook: String? = null, val result: String? = null, val at: String? = null)
@Serializable
data class SnapshotDecision(val decision_id: String, val title_ru: String? = null, val priority: String? = null)
@Serializable
data class SnapshotIncident(val incident_id: String, val title_ru: String? = null)

// Command brief (P3) from GET /command-brief.
@Serializable
data class CommandBrief(
    val kind: String? = null,
    val system_state_ru: String? = null,
    val autopilot_mode: String? = null,
    val outbound_ru: String? = null,
    val incidents: BriefIncidents? = null,
    val automatic_recoveries: Int = 0,
    val primary_constraint: PrimaryConstraint? = null,
    val owner_actions: List<SnapshotDecision> = emptyList(),
    val recommendation_ru: String? = null,
    val owner_action_required: Boolean = false,
)

@Serializable
data class BriefIncidents(val active: Int = 0, val p0: Int = 0)

@Serializable
data class AgentsStatus(
    val chief: String? = null,
    val mode: String? = null,
    val specialists: List<SpecialistAgent> = emptyList(),
)

@Serializable
data class SpecialistAgent(val name: String, val scope: String? = null, val sends: Boolean = false)

// ---- Reliability Center (0.8.0) — GET /reliability ----
@Serializable
data class ReliabilityOverview(
    val reliability_version: String? = null,
    val overall_health: String? = null,
    val state_ru: String? = null,
    val services: List<ReliabilityService> = emptyList(),
    val queue: ReliabilityQueue? = null,
    val ingest: ReliabilityIngest? = null,
    val incidents: ReliabilityIncidents? = null,
    val recovery_actions: RecoveryActions? = null,
    val degraded_states: List<DegradedState> = emptyList(),
    val outbound_ru: String? = null,
    val performs_remediation: Boolean = false,
    val sends: Boolean = false,
)

@Serializable
data class ReliabilityService(val key: String? = null, val name_ru: String? = null, val level: String? = null, val reason_ru: String? = null)

// dead_letter / counts are Int in the available case but "UNKNOWN" (String) when missing.
// Use JsonElement so both shapes parse without crashing.
@Serializable
data class ReliabilityQueue(
    val available: Boolean = false,
    val level: String? = null,
    val reason_ru: String? = null,
    val queued: kotlinx.serialization.json.JsonElement? = null,
    val running: kotlinx.serialization.json.JsonElement? = null,
    val retry: kotlinx.serialization.json.JsonElement? = null,
    val dead_letter: kotlinx.serialization.json.JsonElement? = null,
    val blocked_approval: kotlinx.serialization.json.JsonElement? = null,
    val dead_letter_sample: List<DeadLetterSample> = emptyList(),
)

@Serializable
data class DeadLetterSample(val job_id: String? = null, val job_type: String? = null, val last_error_code: String? = null, val updated_at: String? = null)

@Serializable
data class ReliabilityIngest(val sources: IngestPart? = null, val channels: IngestPart? = null)

@Serializable
data class IngestPart(
    val available: Boolean = false,
    val level: String? = null,
    val reason_ru: String? = null,
    val total: Int? = null,
    val with_errors: kotlinx.serialization.json.JsonElement? = null,
    val quarantined: kotlinx.serialization.json.JsonElement? = null,
)

@Serializable
data class ReliabilityIncidents(val active: Int = 0, val p0: Int = 0, val items: List<IncidentDto> = emptyList())

@Serializable
data class RecoveryActions(
    val total_recorded: Int = 0,
    val recovered: Int = 0,
    val pending: Int = 0,
    val failed: Int = 0,
    val items: List<RecoveryItem> = emptyList(),
)

@Serializable
data class RecoveryItem(val playbook: String? = null, val trigger: String? = null, val result: String? = null, val at: String? = null, val test_only: Boolean = false)

@Serializable
data class DegradedState(val subsystem: String? = null, val level: String? = null, val reason_ru: String? = null, val incident_id: String? = null)

// ---- Cost & Capacity Center (0.8.0) — GET /costs ----
// Fields that can be a number OR the string "UNKNOWN" use JsonElement.
@Serializable
data class CostOverview(
    val cost_center_version: String? = null,
    val total_calculated_units: Long = 0,
    val provider_calls: kotlinx.serialization.json.JsonElement? = null,
    val no_llm_tasks: Long = 0,
    val cache_hits: Long = 0,
    val escalations: Long = 0,
    val raw_input_tokens: kotlinx.serialization.json.JsonElement? = null,
    val raw_output_tokens: kotlinx.serialization.json.JsonElement? = null,
    val estimated_money_cost: kotlinx.serialization.json.JsonElement? = null,
    val estimated_money_class: String? = null,
    val money_note_ru: String? = null,
    val by_provider: Map<String, Long> = emptyMap(),
    val by_model: Map<String, Long> = emptyMap(),
    val by_agent: Map<String, Long> = emptyMap(),
    val by_task_type: Map<String, Long> = emptyMap(),
    val budget: CostBudget? = null,
    val history: CostHistory? = null,
    val capacity: CostCapacity? = null,
    val autosend_ru: String? = null,
    val performs_payment: Boolean = false,
    val sends: Boolean = false,
)

@Serializable
data class CostBudget(
    val daily_calculated_units_limit: kotlinx.serialization.json.JsonElement? = null,
    val used_calculated_units: Long = 0,
    val percent_used: kotlinx.serialization.json.JsonElement? = null,
    val state: String? = null,
    val state_ru: String? = null,
    val paid_sources_enabled: kotlinx.serialization.json.JsonElement? = null,
    val source_strategy: kotlinx.serialization.json.JsonElement? = null,
)

@Serializable
data class CostHistory(
    val confirmed_pre_ledger_units: kotlinx.serialization.json.JsonElement? = null,
    val total_known_units: kotlinx.serialization.json.JsonElement? = null,
    val evidence_reference: String? = null,
)

@Serializable
data class CostCapacity(
    val active_paid_providers: kotlinx.serialization.json.JsonElement? = null,
    val paid_sources_active: kotlinx.serialization.json.JsonElement? = null,
)

// ---- Backup & Recovery Center (0.8.0) — GET /backups/status, /backups/restore-drill ----
@Serializable
data class BackupStatus(
    val backup_center_version: String? = null,
    val items: List<BackupItem> = emptyList(),
    val total_protected: Int = 0,
    val critical_total: Int = 0,
    val critical_with_backup: Int = 0,
    val critical_missing_backup: List<String> = emptyList(),
    val any_live_missing: List<String> = emptyList(),
    val sends: Boolean = false,
    val performs_restore: Boolean = false,
)

@Serializable
data class BackupItem(
    val key: String? = null,
    val name_ru: String? = null,
    val kind: String? = null,
    val critical: Boolean = false,
    val live_exists: Boolean = false,
    val live_size: Long = 0,
    val live_modified: String? = null,
    val snapshot_count: Int = 0,
    val latest_snapshot: LatestSnapshot? = null,
    val latest_age_hours: Double? = null,
    val has_backup: Boolean = false,
)

@Serializable
data class LatestSnapshot(val file: String? = null, val modified: String? = null, val size: Long = 0)

@Serializable
data class RestoreDrillAll(
    val backup_center_version: String? = null,
    val results: List<RestoreDrillResult> = emptyList(),
    val total: Int = 0,
    val checked: Int = 0,
    val restorable: Int = 0,
    val not_restorable: List<String> = emptyList(),
    val skipped: List<String> = emptyList(),
    val all_critical_restorable: Boolean = false,
    val live_touched: Boolean = false,
    val sends: Boolean = false,
)

@Serializable
data class RestoreDrillResult(
    val key: String? = null,
    val restorable: Boolean = false,
    val source: String? = null,
    val source_file: String? = null,
    val drill: String? = null,
    val live_touched: Boolean = false,
    val revision: Int? = null,
    val detail_ru: String? = null,
)

// ---- FCM Push (0.8.0) — GET /push/status, /push/preferences ----
@Serializable
data class PushStatus(
    val fcm_push_version: String? = null,
    val delivery_state: String? = null,        // CREDENTIAL_REQUIRED | DISABLED_BY_CONFIG | LIVE
    val credential_present: Boolean = false,
    val enabled_flag: Boolean = false,
    val registered_tokens: Int = 0,
    val total_tokens_seen: Int = 0,
    val deliveries_attempted: Int = 0,
    val deliveries_live: Int = 0,
    val deliveries_suppressed: Int = 0,
    val sends_client_messages: Boolean = false,
    val channel: String? = null,
)

@Serializable
data class PushPrefs(
    val enabled: Boolean = true,
    val min_severity: String = "P1",
    val decisions: Boolean = true,
    val incidents: Boolean = true,
    val daily_brief: Boolean = false,
)

@Serializable
data class PushPreferencesData(val device_id: String? = null, val prefs: PushPrefs = PushPrefs(), val has_token: Boolean = false)

@Serializable
data class PushRegisterBody(val token: String, val platform: String = "android", val appVersion: String? = null, val prefs: PushPrefs? = null)

@Serializable
data class PushPrefsBody(val prefs: PushPrefs)
