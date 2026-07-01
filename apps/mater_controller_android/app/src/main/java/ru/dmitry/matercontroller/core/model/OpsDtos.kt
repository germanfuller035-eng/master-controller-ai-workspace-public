package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ============================================================================
// v0.4.0 operations + approval domain DTOs.
// All fields default so partial/unknown server payloads parse (ignoreUnknownKeys
// + coerceInputValues + explicitNulls=false). snake_case wire fields are mapped
// with @SerialName. Read-only: none of these carry a send path.
// ============================================================================

// ---- jobs / queue ----
@Serializable
data class JobSummary(
    @SerialName("job_id") val jobId: String? = null,
    @SerialName("job_type") val jobType: String? = null,
    @SerialName("entity_type") val entityType: String? = null,
    @SerialName("entity_id") val entityId: String? = null,
    val status: String? = null,
    val priority: Int? = null,
    val attempts: Int = 0,
    @SerialName("max_attempts") val maxAttempts: Int = 0,
    @SerialName("last_error") val lastError: String? = null,
    @SerialName("error_code") val errorCode: String? = null,
    @SerialName("next_attempt_at") val nextAttemptAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class JobsData(val jobs: List<JobSummary> = emptyList())

// jobs/counts and pipeline/counts both return a free-form {status: count} object.
@Serializable
data class CountsData(val counts: Map<String, Int> = emptyMap())

// ---- audit findings (derived from audit body / pipeline) ----
@Serializable
data class AuditFinding(
    val category: String? = null,
    val severity: String? = null,
    val title: String? = null,
    val evidence: String? = null,
    @SerialName("source_url") val sourceUrl: String? = null,
    val excerpt: String? = null,
    @SerialName("checked_at") val checkedAt: String? = null,
    val confidence: String? = null,
    @SerialName("business_implication") val businessImplication: String? = null,
    @SerialName("suggested_fix") val suggestedFix: String? = null,
    val status: String? = null,
)

// ---- scheduler ----
@Serializable
data class SchedulerStatus(
    val enabled: Boolean = false,
    val mode: String? = null,
    val owner: String? = null,
    val paused: Boolean = false,
    @SerialName("pause_reason") val pauseReason: String? = null,
    @SerialName("last_run") val lastRun: String? = null,
    @SerialName("next_run") val nextRun: String? = null,
    @SerialName("daily_candidate_limit") val dailyCandidateLimit: Int? = null,
    @SerialName("daily_verified_limit") val dailyVerifiedLimit: Int? = null,
    @SerialName("candidates_today") val candidatesToday: Int? = null,
    @SerialName("verified_today") val verifiedToday: Int? = null,
    @SerialName("schedulers_running") val schedulersRunning: Int? = null,
    val revision: Int? = null,
)

// ---- source health ----
@Serializable
data class SourceHealth(
    val id: String? = null,
    val name: String? = null,
    val enabled: Boolean = false,
    @SerialName("credential_status") val credentialStatus: String? = null,
    val health: String? = null,
    @SerialName("last_run") val lastRun: String? = null,
    @SerialName("last_success") val lastSuccess: String? = null,
    @SerialName("last_error") val lastError: String? = null,
    @SerialName("request_count") val requestCount: Int? = null,
    @SerialName("rate_limit") val rateLimit: String? = null,
    @SerialName("runtime_owner") val runtimeOwner: String? = null,
)

@Serializable
data class SourceHealthData(val sources: List<SourceHealth> = emptyList())

// ---- mutation result (generic; never asserts delivery while send is off) ----
@Serializable
data class MutationResult(
    val ok: Boolean = false,
    val status: String? = null,
    val revision: Int? = null,
    val sent: Boolean? = null,
    val code: String? = null,
    val message: String? = null,
    val details: JsonElement? = null,
)
