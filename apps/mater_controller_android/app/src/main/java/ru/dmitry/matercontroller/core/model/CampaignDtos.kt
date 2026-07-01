// CampaignDtos.kt — Campaign Governor (Phase 2) wire DTOs.
// The app's Json has NO namingStrategy, so each Kotlin property name == its wire
// name (snake_case). Every field nullable/default so partial payloads parse with
// ignoreUnknownKeys + coerceInputValues + explicitNulls=false.
package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.Serializable

@Serializable
data class CampaignsData(
    val campaigns: List<CampaignSummary> = emptyList(),
)

@Serializable
data class CampaignSummary(
    val campaign_id: String,
    val name: String? = null,
    val status: String? = null,
    val niche: String? = null,
    val region: String? = null,
    val test_only: Boolean = false,
    val cohorts: List<CohortSummary> = emptyList(),
    val suppressed: Int = 0,
    val updated_at: String? = null,
)

@Serializable
data class CohortSummary(
    val cohort_id: String,
    val index: Int = 0,
    val status: String? = null,
    val planned_size: Int = 0,
    val released: Int = 0,
    val summary: CohortStats? = null,
)

@Serializable
data class CohortStats(
    val released: Int = 0,
    val accepted: Int = 0,
    val delivered: Int = 0,
    val bounced: Int = 0,
    val replied: Int = 0,
    val opted_out: Int = 0,
    val bounce_rate: Double = 0.0,
    val reply_rate: Double = 0.0,
)
