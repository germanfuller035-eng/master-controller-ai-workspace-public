package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.FirstTouchArtifactDto
import ru.dmitry.matercontroller.core.model.FirstTouchCandidatesDto
import ru.dmitry.matercontroller.core.model.FirstTouchSummaryDto

/** First Touch DTO mapping (snake_case wire, no-send invariants). */
class FirstTouchDtoMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun parsesSummary() {
        val raw = """{"ok":true,"data":{"leads_scored":62,"pilot_eligible":7,"top_5_count":5,"top_3_count":3,"recommended_pilot":"BETON-MASTERS_RU","controlled_send_gate":"DISABLED","transport_enabled":false,"no_send":true},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(FirstTouchSummaryDto.serializer()), raw)
        val d = env.data!!
        assertEquals(62, d.leadsScored)
        assertEquals(7, d.pilotEligible)
        assertEquals("BETON-MASTERS_RU", d.recommendedPilot)
        assertEquals("DISABLED", d.controlledSendGate)
        assertFalse(d.transportEnabled)
        assertTrue(d.noSend)
    }

    @Test fun parsesCandidates() {
        val raw = """{"ok":true,"data":{"leads_scored":62,"pilot_eligible":7,"top_5":[{"lead_id":"DKBI_RU","company":"ДКБИ","hook_type":"WEAK_WEBSITE","quality_score":98,"eligible":true,"score":84}],"top_3":[],"recommended_pilot":{"lead_id":"BETON-MASTERS_RU","score":84,"eligible":true},"no_send":true},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(FirstTouchCandidatesDto.serializer()), raw)
        val d = env.data!!
        assertEquals(1, d.top5.size)
        assertEquals("DKBI_RU", d.top5[0].leadId)
        assertEquals(98, d.top5[0].qualityScore)
        assertEquals("BETON-MASTERS_RU", d.recommendedPilot?.leadId)
    }

    @Test fun parsesArtifactNoSend() {
        val raw = """{"ok":true,"data":{"artifact_type":"FIRST_TOUCH","lead_id":"BETON-MASTERS_RU","status":"QA_PASSED","hook":{"hook_type":"CONTACT_DISCOVERY_FRICTION","evidence_url":"https://x.ru","business_impact":"клиенту сложнее найти контакт"},"subject_variants":[{"id":"subj_a","text":"Наблюдение по сайту","score":100}],"body_variants":[{"id":"body_a","text":"Здравствуйте...","metrics":{"word_count":84,"cta_count":1,"links":0,"has_price":false}}],"recommended_subject_id":"subj_a","recommended_body_id":"body_a","quality":{"total_score":98,"gate_result":"PASS","failure_reasons":[]},"compliance":{"gate_result":"PASS"},"deliverability":{"status":"READY_NO_SEND"},"content_hash":"abc123","no_send":true},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(FirstTouchArtifactDto.serializer()), raw)
        val a = env.data!!
        assertEquals("QA_PASSED", a.status)
        assertEquals("CONTACT_DISCOVERY_FRICTION", a.hook?.hookType)
        assertEquals(98, a.quality.totalScore)
        assertEquals("PASS", a.quality.gateResult)
        assertEquals("PASS", a.compliance.gateResult)
        assertEquals("READY_NO_SEND", a.deliverability.status)
        assertEquals(1, a.bodyVariants[0].metrics.ctaCount)
        assertEquals(0, a.bodyVariants[0].metrics.links)
        assertFalse(a.bodyVariants[0].metrics.hasPrice)
        assertTrue(a.noSend)
    }
}
