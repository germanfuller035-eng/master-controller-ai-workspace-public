package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.ConversationTimeline
import ru.dmitry.matercontroller.core.model.ConversationsList
import ru.dmitry.matercontroller.core.model.DeliveryContainment
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.PresaleHealth

/** RC3 transport-readiness Android proofs: delivery containment, conversation timeline, pre-sale health. */
class TransportReadinessMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun deliveryContainmentParsesNoAutoResend() {
        val raw = """{"ok":true,"data":{"records_total":3,"by_category":{"ATTEMPT_UNPROVEN":3},"owner_review_queue":[{"leadId":"U1","category":"ATTEMPT_UNPROVEN","ownerReviewRequired":true,"automaticResendAllowed":false,"confirmedSent":false}],"automatic_resend_allowed":false,"automatic_followup_allowed":false},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(DeliveryContainment.serializer()), raw)
        assertEquals(3, env.data?.records_total)
        assertFalse(env.data!!.automatic_resend_allowed)
        assertFalse(env.data!!.automatic_followup_allowed)
        val rec = env.data!!.owner_review_queue.first()
        assertFalse(rec.automaticResendAllowed)
        assertFalse(rec.confirmedSent)
        assertTrue(rec.ownerReviewRequired)
    }

    @Test fun conversationTimelineSendCapabilityNone() {
        val raw = """{"ok":true,"data":{"conversation_id":"conv_L1","lead_id":"L1","events":[{"at":"2026-06-01T00:00:00Z","type":"LEAD_CREATED"},{"at":"2026-06-03T00:00:00Z","type":"OFFER_DRAFT_PREPARED","status":"READY_FOR_SEND_REVIEW"}],"event_count":2,"send_capability":"NONE"},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ConversationTimeline.serializer()), raw)
        assertEquals("NONE", env.data?.send_capability)
        assertEquals(2, env.data?.events?.size)
        assertEquals("LEAD_CREATED", env.data?.events?.first()?.type)
    }

    @Test fun conversationsListParses() {
        val raw = """{"ok":true,"data":{"items":[{"conversation_id":"conv_L1","lead_id":"L1","event_count":3,"has_offer":true,"has_reply":false}],"total":1},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ConversationsList.serializer()), raw)
        assertEquals(1, env.data?.total)
        assertTrue(env.data!!.items.first().has_offer)
    }

    @Test fun presaleHealthParses() {
        val raw = """{"ok":true,"data":{"lead_id":"L1","state":"OWNER_REVIEW","communication_health":"CONTACTED_AWAITING","delivery_status_confidence":"NONE","reply_received":false,"followup_due":false},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(PresaleHealth.serializer()), raw)
        assertEquals("OWNER_REVIEW", env.data?.state)
        assertEquals("NONE", env.data?.delivery_status_confidence)
        assertFalse(env.data!!.reply_received)
    }
}
