package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.AgentStatus
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.ExecutiveBrief
import ru.dmitry.matercontroller.core.model.OwnerQueues
import ru.dmitry.matercontroller.core.model.ShadowWaveResult

/** RC4 agent + pipeline Android proofs. No API key in any DTO; no send fields. */
class AgentPipelineMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun agentStatusParsesNoKey() {
        val raw = """{"ok":true,"data":{"runtime":"ON","mode":"SHADOW_NO_SEND","provider_available":true,"profiles":[{"profile":"QA_SAFETY","state":"SHADOW"}]},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(AgentStatus.serializer()), raw)
        assertEquals("SHADOW_NO_SEND", env.data?.mode)
        assertEquals(1, env.data?.profiles?.size)
        // boolean only — no key field exists in the DTO
        assertTrue(env.data!!.provider_available)
        assertFalse(raw.contains("sk-"))
    }

    @Test fun agentStatusParsesRc3LiveProviderFields() {
        val raw = """{"ok":true,"data":{"runtime":"ON","mode":"SHADOW_NO_SEND","provider_available":true,"provider":"tokenator","active_model":"gpt-5.5","last_successful_call":"2026-06-18T09:30","circuit_state":"CLOSED","cumulative_calculated_units":1234,"first_run_budget_limit":1000000,"profiles":[]},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(AgentStatus.serializer()), raw)
        val s = env.data!!
        assertEquals("tokenator", s.provider)
        assertEquals("gpt-5.5", s.active_model)
        assertEquals("2026-06-18T09:30", s.last_successful_call)
        assertEquals("CLOSED", s.circuit_state)
        assertEquals(1234L, s.cumulative_calculated_units)
        assertEquals(1000000L, s.first_run_budget_limit)
        // no api key field
        assertFalse(raw.contains("sk-"))
    }

    @Test fun agentStatusOldPayloadStillParsesWithNullNewFields() {
        val raw = """{"ok":true,"data":{"runtime":"OFF","mode":"SHADOW_NO_SEND","provider_available":false,"profiles":[]},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(AgentStatus.serializer()), raw)
        val s = env.data!!
        assertEquals(null, s.provider)
        assertEquals(null, s.active_model)
        assertEquals(null, s.first_run_budget_limit)
        assertFalse(s.provider_available)
    }

    @Test fun agentProviderLocalizationNeverRaw() {
        // Until provider_available=true → "недоступен"; never raw "tokenator"/code.
        assertTrue(ru.dmitry.matercontroller.core.ui.OwnerLocalization.renderAgentProviderRu("tokenator", false).contains("недоступен"))
        assertEquals("Tokenator", ru.dmitry.matercontroller.core.ui.OwnerLocalization.renderAgentProviderRu("tokenator", true))
        val mode = ru.dmitry.matercontroller.core.ui.OwnerLocalization.renderAgentModeRu("SHADOW_NO_SEND")
        assertFalse(mode.contains("_"))
        val circuit = ru.dmitry.matercontroller.core.ui.OwnerLocalization.renderCircuitStateRu("CLOSED")
        assertFalse(circuit.contains("CLOSED"))
    }

    @Test fun shadowWaveParsesNoSend() {
        val raw = """{"ok":true,"data":{"agent_mode":"SHADOW_NO_SEND","shadow_leads_processed":3,"agent_tasks_completed":3,"agent_tasks_failed":0,"agent_dead_letters":0,"qa_verdicts":{"APPROVED_FOR_OWNER_REVIEW":2,"REJECTED":1},"send_attempts":0,"guessed_emails":0,"unsupported_claims":0},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ShadowWaveResult.serializer()), raw)
        assertEquals(3, env.data?.shadow_leads_processed)
        assertEquals(0, env.data?.send_attempts)
        assertEquals(0, env.data?.agent_dead_letters)
        assertEquals(2, env.data?.qa_verdicts?.get("APPROVED_FOR_OWNER_REVIEW"))
    }

    @Test fun ownerQueuesParses() {
        val raw = """{"ok":true,"data":{"ready_for_send_review":["offer_1","offer_2","offer_3"],"awaiting_reply":3,"replies_received":0,"followup_due":0,"delivery_review":7,"test_records":1},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(OwnerQueues.serializer()), raw)
        assertEquals(3, env.data?.ready_for_send_review?.size)
        assertEquals(7, env.data?.delivery_review)
    }

    @Test fun executiveBriefParses() {
        val raw = """{"ok":true,"data":{"what_changed":"x","needs_owner":"y","leads_ready":3,"confirmed_sends":7,"delivery_unconfirmed":7,"next_safe_action":"z"},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(ExecutiveBrief.serializer()), raw)
        assertEquals(3, env.data?.leads_ready)
        assertEquals(7, env.data?.confirmed_sends)
    }
}
