package ru.dmitry.matercontroller

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.ControlledCommercialLeadDto
import ru.dmitry.matercontroller.core.model.ControlledLeadImportBody
import ru.dmitry.matercontroller.core.model.ControlledTransportResultDto
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.PaymentApprovalBody
import ru.dmitry.matercontroller.core.model.TransportSendApprovedBody

class ControlledCommercialDtoMappingTest {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        encodeDefaults = true
    }

    @Test
    fun leadImportUsesRequiredCommercialFieldsAndDryRunDefault() {
        val body = ControlledLeadImportBody(
            sourceBatchId = "batch_1",
            leads = listOf(
                ControlledCommercialLeadDto(
                    leadId = "lead_1",
                    companyName = "Example",
                    website = "https://example.test",
                    source = "owner_site",
                    sourceUrl = "https://example.test",
                    confidence = "high",
                    collectedAt = "2026-06-29T10:00:00Z",
                    contactChannel = "email",
                    contactValue = "owner@example.test",
                    contactSourceUrl = "https://example.test/contacts",
                    contactConfidence = "high",
                ),
            ),
        )

        val encoded = json.encodeToString(body)

        assertTrue(encoded.contains("\"lead_id\""))
        assertTrue(encoded.contains("\"company_name\""))
        assertTrue(encoded.contains("\"contact_source_url\""))
        assertTrue(encoded.contains("\"dry_run\":true"))
    }

    @Test
    fun transportResultNeverImpliesOutboundByDefault() {
        val raw = """{"ok":true,"data":{"status":"DRY_RUN","outbound_count":0,"payload_hash":"abc","audit_record_id":"audit_1"},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ControlledTransportResultDto.serializer()), raw)
        val data = env.data!!

        assertEquals("DRY_RUN", data.status)
        assertEquals(0, data.outboundCount)
        assertEquals("abc", data.payloadHash)
    }

    @Test
    fun sendApprovedBodyDefaultsToDryRun() {
        val body = TransportSendApprovedBody(
            approvalId = "approval_1",
            payloadHash = "hash_1",
            exactChannel = "email",
            exactRecipient = "owner@example.test",
            exactSubject = "Тема",
            exactBodyHash = "body_hash",
        )

        assertTrue(json.encodeToString(body).contains("\"dry_run\":true"))
    }

    @Test
    fun paymentApprovalRequiresOwnerConfirmationField() {
        val body = PaymentApprovalBody(
            client = "Example",
            dealId = "deal_1",
            amount = 10000,
            currency = "RUB",
            product = "Mini Audit",
            invoiceId = "invoice_1",
            paymentProvider = "manual",
            paymentLinkHash = "hash",
            expiry = "2026-06-30T00:00:00Z",
            ownerConfirmation = false,
        )
        val encoded = json.encodeToString(body)

        assertTrue(encoded.contains("\"payment_link_hash\""))
        assertTrue(encoded.contains("\"deal_id\""))
        assertTrue(encoded.contains("\"owner_confirmation\":false"))
        assertFalse(encoded.contains("card"))
    }
}
