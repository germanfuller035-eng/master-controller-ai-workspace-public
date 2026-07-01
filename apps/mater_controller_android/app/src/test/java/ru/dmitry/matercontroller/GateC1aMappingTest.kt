package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.LeadCountReconciliation
import ru.dmitry.matercontroller.core.model.ProductCatalog
import ru.dmitry.matercontroller.core.model.ProductDetail
import ru.dmitry.matercontroller.core.model.ProductListItem
import ru.dmitry.matercontroller.core.model.SendReconciliation
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.feature.catalog.CatalogUi

/**
 * Gate C1-A Android proofs: product catalog parsing + price rendering (UNKNOWN never 0),
 * lead-count and send reconciliation parsing, catalog filter/sort logic.
 */
class GateC1aMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun parsesProductCatalog18() {
        val items = (1..18).joinToString(",") { i ->
            val status = if (i <= 2) "ACTIVE" else if (i <= 9) "DRAFT" else "PLANNED"
            """{"product_id":"p$i","name":"P$i","status":"$status","price":${if (i == 1) 10000 else "null"},"currency":"RUB"}"""
        }
        val raw = """{"ok":true,"data":{"items":[$items],"total":18,"counts":{"ACTIVE":2,"DRAFT":7,"PLANNED":9}},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ProductCatalog.serializer()), raw)
        assertEquals(18, env.data?.total)
        assertEquals(2, env.data?.counts?.get("ACTIVE"))
        assertEquals(7, env.data?.counts?.get("DRAFT"))
        assertEquals(9, env.data?.counts?.get("PLANNED"))
        assertEquals(18, env.data?.items?.size)
    }

    @Test fun miniAuditPrice10000RendersWithRuble() {
        val out = OwnerLocalization.renderProductPriceRu(10000.0, "RUB", "10000 RUB")
        assertTrue(out.contains("10")) // grouped 10 000
        assertTrue(out.contains("₽"))
    }

    @Test fun unknownPriceNeverZero() {
        val out = OwnerLocalization.renderProductPriceRu(null, "RUB", "UNKNOWN")
        assertEquals("цена не определена", out)
        assertFalse(out.contains("0"))
    }

    @Test fun freePriceRendersWord() {
        assertEquals("бесплатно", OwnerLocalization.renderProductPriceRu(null, "RUB", "free"))
    }

    @Test fun productStatusRu() {
        assertEquals("Активен", OwnerLocalization.renderProductStatusRu("ACTIVE"))
        assertEquals("Черновик", OwnerLocalization.renderProductStatusRu("DRAFT"))
        assertEquals("Запланирован", OwnerLocalization.renderProductStatusRu("PLANNED"))
    }

    @Test fun productDetailParsesScopeFields() {
        val raw = """{"ok":true,"data":{"product_id":"mini_audit","name":"Mini Audit 10K","status":"ACTIVE","price":10000,"currency":"RUB","scope_included":["a","b"],"scope_excluded":["c"],"inputs_required":["d"],"acceptance_criteria":["e"]},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ProductDetail.serializer()), raw)
        assertEquals("ACTIVE", env.data?.status)
        assertEquals(2, env.data?.scope_included?.size)
        assertEquals(1, env.data?.scope_excluded?.size)
        assertEquals(1, env.data?.inputs_required?.size)
    }

    @Test fun leadCountReconciliationParses62vs52() {
        val raw = """{"ok":true,"data":{"canonical_total_leads":62,"mini_audit_operational_leads":52,"excluded_from_mini_audit":10,"excluded_breakdown_by_status":{"rejected":9,"needs_identity_verification":1},"count_definitions":{"canonical_total_leads":"все"}},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(LeadCountReconciliation.serializer()), raw)
        assertEquals(62, env.data?.canonical_total_leads)
        assertEquals(52, env.data?.mini_audit_operational_leads)
        assertEquals(10, env.data?.excluded_from_mini_audit)
        assertEquals(9, env.data?.excluded_breakdown_by_status?.get("rejected"))
    }

    @Test fun sendReconciliationKeepsLedgerTruth() {
        val raw = """{"ok":true,"data":{"authoritative_successful_sends":7,"records_requiring_reconciliation":3,"classifications":{"DELIVERY_STATUS_UNKNOWN":3},"unauthorized_sends":0,"unknown_sends":0},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(SendReconciliation.serializer()), raw)
        assertEquals(7, env.data?.authoritative_successful_sends)
        assertEquals(3, env.data?.records_requiring_reconciliation)
        assertEquals(0, env.data?.unauthorized_sends)
        assertEquals(0, env.data?.unknown_sends)
    }

    @Test fun catalogFilterAndSort() {
        val items = listOf(
            ProductListItem("p_planned", "Plan", "PLANNED", null, "UNKNOWN", "RUB"),
            ProductListItem("p_active", "Active prod", "ACTIVE", 10000.0, "10000 RUB", "RUB"),
            ProductListItem("p_draft", "Draft prod", "DRAFT", null, "UNKNOWN", "RUB"),
        )
        val ui = CatalogUi(catalog = ProductCatalog(items = items, total = 3))
        // default sort: ACTIVE first
        assertEquals("p_active", ui.visibleItems.first().product_id)
        // status filter
        val filtered = ui.copy(statusFilter = "DRAFT").visibleItems
        assertEquals(1, filtered.size)
        assertEquals("p_draft", filtered.first().product_id)
        // search
        val searched = ui.copy(query = "active").visibleItems
        assertEquals(1, searched.size)
    }
}
