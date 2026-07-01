package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.OfferDto
import ru.dmitry.matercontroller.core.model.OffersList
import ru.dmitry.matercontroller.core.ui.OwnerLocalization

/**
 * 0.6.0-rc2 — offer review read-model proofs. The /offers endpoint serializes canonical offer
 * records in snake_case; the 3 real offers (СтройДвор-Юг / ДКБИ / Завод Атом) must parse and the
 * TEST_ONLY offer must be excluded from the owner send-review list. No send action exists.
 */
class OfferReviewMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    private val payload = """
        {"ok":true,"data":{"items":[
          {"offer_id":"offer_47a06f465083","lead_id":"TEST_ONLY_GATE_C1A_ACCEPTANCE","product_id":"mini_audit","price_snapshot":10000,"currency":"RUB","status":"APPROVED","send_capability":"NONE","test_only":true,"owner_decision":"APPROVE"},
          {"offer_id":"offer_dbbbf391d547","lead_id":"STROYDVOR-UG_RU","product_id":"mini_audit","price_snapshot":10000,"currency":"RUB","status":"READY_FOR_SEND_REVIEW","send_capability":"NONE","test_only":false,"confidence":"SYSTEM_OBSERVED"},
          {"offer_id":"offer_ec64d56d08b4","lead_id":"DKBI_RU","product_id":"mini_audit","price_snapshot":10000,"currency":"RUB","status":"READY_FOR_SEND_REVIEW","send_capability":"NONE","test_only":false},
          {"offer_id":"offer_f1e0c4948965","lead_id":"ZAVODATOM_RU","product_id":"mini_audit","price_snapshot":10000,"currency":"RUB","status":"READY_FOR_SEND_REVIEW","send_capability":"NONE","test_only":false}
        ]},"error":null}
    """.trimIndent()

    @Test fun parsesOffersSnakeCase() {
        val env = json.decodeFromString(Envelope.serializer(OffersList.serializer()), payload)
        assertTrue(env.ok)
        assertEquals(4, env.data?.items?.size)
        val stroydvor = env.data!!.items.first { it.offer_id == "offer_dbbbf391d547" }
        assertEquals("STROYDVOR-UG_RU", stroydvor.lead_id)
        assertEquals(10000.0, stroydvor.price_snapshot!!, 0.001)
        assertEquals("READY_FOR_SEND_REVIEW", stroydvor.status)
        assertEquals("NONE", stroydvor.send_capability)
    }

    @Test fun sendReviewListExcludesTestOnlyAndKeepsThreeReal() {
        val env = json.decodeFromString(Envelope.serializer(OffersList.serializer()), payload)
        val sendReview = env.data!!.items.filter {
            !it.test_only && OwnerLocalization.normStatus(it.status) == "ready_for_send_review"
        }
        assertEquals(3, sendReview.size)
        val companies = sendReview.map { OwnerLocalization.companyFromLeadId(it.lead_id) }
        assertTrue(companies.contains("СтройДвор-Юг"))
        assertTrue(companies.contains("ДКБИ"))
        assertTrue(companies.contains("Завод Атом"))
    }

    @Test fun offerStatusLocalizedNeverRaw() {
        for (s in listOf("READY_FOR_SEND_REVIEW", "READY_FOR_OWNER_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED")) {
            val ru = OwnerLocalization.renderOfferStatusRu(s)
            assertFalse("raw status leaked: $ru", ru.contains(s))
            assertFalse(ru.contains("_"))
        }
    }

    @Test fun sendCapabilityNoneRendersDisabled() {
        val ru = OwnerLocalization.renderSendCapabilityRu("NONE")
        assertTrue(ru.contains("недоступна"))
        assertFalse(ru.contains("NONE"))
    }

    @Test fun offerActionsAreTextOnlyCopy() {
        // APPROVE_TEXT_ONLY must make clear it does NOT send.
        val body = OwnerLocalization.renderOfferActionBodyRu("APPROVE_TEXT_ONLY")
        assertTrue(body.contains("не отправляет"))
    }
}
