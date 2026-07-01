package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test
import ru.dmitry.matercontroller.core.model.*

/** DTO + mapper coverage for the v0.4.0 operations/approval domains. */
class OpsDtoMappingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true; explicitNulls = false }

    @Test fun jobSummaryFullPayload() {
        val raw = """{"ok":true,"data":{"jobs":[{"job_id":"j1","job_type":"AUDIT_GENERATE","entity_type":"lead","entity_id":"KZ-1","status":"DEAD_LETTER","attempts":3,"max_attempts":3,"error_code":"AUDIT_DEP","last_error":"dep missing","created_at":"2026-06-16T10:00:00Z"}]}}"""
        val env = json.decodeFromString(Envelope.serializer(JobsData.serializer()), raw)
        val j = env.data!!.jobs.single()
        assertEquals("j1", j.jobId)
        assertEquals("AUDIT_GENERATE", j.jobType)
        assertEquals("DEAD_LETTER", j.status)
        assertEquals(3, j.attempts)
        assertEquals("AUDIT_DEP", j.errorCode)
    }

    @Test fun jobSummaryMinimalPayload() {
        val j = json.decodeFromString(JobSummary.serializer(), """{"job_id":"x"}""")
        assertEquals("x", j.jobId)
        assertEquals(0, j.attempts)         // default, not crash
        assertNull(j.jobType)
    }

    @Test fun auditFindingMapsSnakeCase() {
        val f = json.decodeFromString(AuditFinding.serializer(), """{"category":"SEO","severity":"high","title":"No meta","source_url":"https://x","business_implication":"low traffic","suggested_fix":"add tags","checked_at":"2026-06-16T00:00:00Z"}""")
        assertEquals("SEO", f.category)
        assertEquals("https://x", f.sourceUrl)
        assertEquals("low traffic", f.businessImplication)
        assertEquals("add tags", f.suggestedFix)
    }

    @Test fun schedulerStatusParses() {
        val s = json.decodeFromString(SchedulerStatus.serializer(), """{"enabled":true,"mode":"daily","paused":false,"daily_candidate_limit":50,"candidates_today":12,"schedulers_running":1}""")
        assertTrue(s.enabled)
        assertEquals(50, s.dailyCandidateLimit)
        assertEquals(1, s.schedulersRunning)
    }

    @Test fun sourceHealthHidesNoCredentialValue() {
        val sh = json.decodeFromString(SourceHealth.serializer(), """{"id":"overpass","name":"Overpass","enabled":true,"credential_status":"NONE_REQUIRED","health":"ok","request_count":42}""")
        assertEquals("overpass", sh.id)
        assertEquals("NONE_REQUIRED", sh.credentialStatus)  // status only, never a secret value
        assertEquals(42, sh.requestCount)
    }

    @Test fun mutationResultNeverImpliesSendByDefault() {
        val m = json.decodeFromString(MutationResult.serializer(), """{"ok":true,"status":"rejected","revision":67}""")
        assertTrue(m.ok)
        assertNull(m.sent)    // absence of sent=true must never be read as delivered
    }

    @Test fun unknownEnumAndExtraFieldsIgnored() {
        // unknown server fields must not break parsing
        val j = json.decodeFromString(JobSummary.serializer(), """{"job_id":"j","status":"SOME_NEW_STATUS","futureField":123}""")
        assertEquals("SOME_NEW_STATUS", j.status)
    }
}
