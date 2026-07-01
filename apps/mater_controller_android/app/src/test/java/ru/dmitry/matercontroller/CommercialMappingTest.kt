package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.CommercialSummary
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.FinanceSummaryDto
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * Integration Wave 1 — Android commercial read view proofs. UNKNOWN money is rendered as a word,
 * never as 0; classifications surface as Russian qualifiers; partial payloads parse.
 */
class CommercialMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun parsesCommercialSummaryEnvelope() {
        // Realistic API payload: the backend serializes the read model in snake_case.
        val raw = """{"ok":true,"data":{"open_opportunities":1,"deals_won":1,"confirmed_deal_value":10000,"confirmed_deal_class":"FACT","confirmed_payments":null,"confirmed_payments_class":"UNKNOWN","owner_decisions_required":1},"error":null,"requestId":"req_c1"}"""
        val env = json.decodeFromString(Envelope.serializer(CommercialSummary.serializer()), raw)
        assertTrue(env.ok)
        assertEquals(1, env.data?.openOpportunities)
        assertEquals(1, env.data?.dealsWon)
        assertEquals(10000.0, env.data?.confirmedDealValue!!, 0.001)
        assertEquals(null, env.data?.confirmedPayments)
        assertEquals(1, env.data?.ownerDecisionsRequired)
    }

    @Test fun parsesOffersReadyForSendReviewFromSnakeCase() {
        // RC4 defect regression: 3 real offers in READY_FOR_SEND_REVIEW must surface, not 0.
        val raw = """{"ok":true,"data":{"open_opportunities":3,"offers_awaiting_owner":3,"offers_ready_for_send_review":3,"owner_decisions_required":3},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(CommercialSummary.serializer()), raw)
        assertEquals(3, env.data?.openOpportunities)
        assertEquals(3, env.data?.offersAwaitingOwner)
        assertEquals(3, env.data?.offersReadyForSendReview)
        assertEquals(3, env.data?.ownerDecisionsRequired)
    }

    @Test fun moneyUnknownRendersWordNotZero() {
        assertEquals("нет данных", OwnerLocalization.renderMoneyRu(null, "RUB", "UNKNOWN"))
        assertFalse(OwnerLocalization.renderMoneyRu(null, "RUB", "UNKNOWN").contains("0"))
    }

    @Test fun moneyFactRendersAmountWithQualifier() {
        val out = OwnerLocalization.renderMoneyRu(10000.0, "RUB", "FACT")
        assertTrue(out.contains("10000"))
        assertTrue(out.contains("₽"))
        assertTrue(out.contains("подтверждено"))
    }

    @Test fun moneyEstimateAndTargetQualifiers() {
        assertTrue(OwnerLocalization.renderMoneyRu(5000.0, "RUB", "ESTIMATE").contains("оценка"))
        assertTrue(OwnerLocalization.renderMoneyRu(5000.0, "RUB", "TARGET").contains("план"))
    }

    @Test fun valueClassNeverRaw() {
        // a class qualifier never leaks the raw enum token
        for (c in listOf("FACT", "ESTIMATE", "TARGET", "UNKNOWN")) {
            val q = OwnerLocalization.renderValueClassRu(c)
            assertFalse(q.contains(c))
        }
    }

    @Test fun financeSummaryUnknownNotZero() {
        val raw = """{"ok":true,"data":{"confirmed_revenue":null,"confirmed_revenue_class":"UNKNOWN","estimated_revenue":10000,"estimated_revenue_class":"ESTIMATE","unpaid_invoices":1,"unknown_data_count":1},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(FinanceSummaryDto.serializer()), raw)
        assertEquals(null, env.data?.confirmedRevenue)
        assertEquals("UNKNOWN", env.data?.confirmedRevenueClass)
        assertEquals(10000.0, env.data?.estimatedRevenue!!, 0.001)
        assertEquals(1, env.data?.unpaidInvoices)
        // rendered → word, not 0
        assertEquals("нет данных", OwnerLocalization.renderMoneyRu(env.data?.confirmedRevenue, "RUB", env.data?.confirmedRevenueClass))
    }

    @Test fun partialPayloadParses() {
        val raw = """{"ok":true,"data":{"deals_won":2},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(CommercialSummary.serializer()), raw)
        assertEquals(2, env.data?.dealsWon)
        assertEquals(0, env.data?.openOpportunities) // count defaults are real 0
        assertEquals(null, env.data?.confirmedPayments) // money default is null = unknown
    }
}
