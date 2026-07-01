package ru.dmitry.matercontroller.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ============================================================================
// Integration Wave 1 — commercial core read DTOs (read-only owner views).
// All fields default so partial payloads parse. Money/derived values are nullable and carry a
// *_class (FACT|TARGET|ESTIMATE|UNKNOWN) so the UI can render UNKNOWN distinctly from 0.
// No command/mutation DTOs are wired into the UI in Wave 1 (feature-flagged off, no send).
//
// IMPORTANT: the API serializes these read models in snake_case (e.g. open_opportunities). The
// Kotlin properties stay camelCase for idiomatic UI code, so each field carries an explicit
// @SerialName mapping. Without it the snake_case payload silently coerces to 0/null — that was the
// RC4 defect "commercial summary shows zero" even though canonical had 3 open opportunities.
// ============================================================================

@Serializable
data class CommercialSummary(
    @SerialName("open_opportunities") val openOpportunities: Int = 0,
    @SerialName("offers_awaiting_owner") val offersAwaitingOwner: Int = 0,
    @SerialName("offers_ready_for_send_review") val offersReadyForSendReview: Int = 0,
    @SerialName("deals_won") val dealsWon: Int = 0,
    @SerialName("deals_lost") val dealsLost: Int = 0,
    @SerialName("estimated_pipeline_value") val estimatedPipelineValue: Double? = null,
    @SerialName("estimated_pipeline_class") val estimatedPipelineClass: String? = null,
    @SerialName("confirmed_deal_value") val confirmedDealValue: Double? = null,
    @SerialName("confirmed_deal_class") val confirmedDealClass: String? = null,
    @SerialName("projects_waiting_handoff") val projectsWaitingHandoff: Int = 0,
    @SerialName("active_projects") val activeProjects: Int = 0,
    @SerialName("invoices_draft") val invoicesDraft: Int = 0,
    @SerialName("invoices_due") val invoicesDue: Int = 0,
    @SerialName("confirmed_payments") val confirmedPayments: Double? = null,
    @SerialName("confirmed_payments_class") val confirmedPaymentsClass: String? = null,
    @SerialName("estimated_profit") val estimatedProfit: Double? = null,
    @SerialName("estimated_profit_class") val estimatedProfitClass: String? = null,
    @SerialName("owner_decisions_required") val ownerDecisionsRequired: Int = 0,
)

@Serializable
data class FinanceSummaryDto(
    @SerialName("confirmed_revenue") val confirmedRevenue: Double? = null,
    @SerialName("confirmed_revenue_class") val confirmedRevenueClass: String? = null,
    @SerialName("estimated_revenue") val estimatedRevenue: Double? = null,
    @SerialName("estimated_revenue_class") val estimatedRevenueClass: String? = null,
    @SerialName("unpaid_invoices") val unpaidInvoices: Int = 0,
    @SerialName("overdue_invoices") val overdueInvoices: Int = 0,
    @SerialName("confirmed_costs") val confirmedCosts: Double? = null,
    @SerialName("confirmed_costs_class") val confirmedCostsClass: String? = null,
    @SerialName("estimated_costs") val estimatedCosts: Double? = null,
    @SerialName("estimated_costs_class") val estimatedCostsClass: String? = null,
    @SerialName("unknown_data_count") val unknownDataCount: Int = 0,
)

@Serializable
data class CommercialIntegrationStatus(
    val revenueOs: String? = null,
    val productOs: String? = null,
    val deliveryOs: String? = null,
    val financeOs: String? = null,
    val singleWriter: Boolean = true,
    val commercialApiEnabled: Boolean = false,
    val commercialCommandsEnabled: Boolean = false,
    val sendCapability: String? = null,
)

// ---- 0.6.0-rc2: offer review read models (read-only; no send) ----
// The /offers endpoint serializes canonical offer records in snake_case. Fields stay nullable/default
// so partial payloads parse. send_capability is always "NONE" in this wave — there is no send action.
@Serializable
data class OfferDto(
    val offer_id: String = "",
    val opportunity_id: String? = null,
    val lead_id: String? = null,
    val product_id: String? = null,
    val product_version: String? = null,
    val price_snapshot: Double? = null,
    val currency: String? = null,
    val scope_snapshot: String? = null,
    val acceptance_snapshot: List<String> = emptyList(),
    val claims_snapshot: List<String>? = null,
    val status: String? = null,
    val send_capability: String? = null,
    val test_only: Boolean = false,
    val confidence: String? = null,
    val owner_decision: String? = null,
    val created_at: String? = null,
    val updated_at: String? = null,
)

@Serializable
data class OffersList(
    val items: List<OfferDto> = emptyList(),
)
