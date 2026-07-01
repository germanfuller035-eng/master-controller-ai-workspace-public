package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.model.PipelineLeadsData
import ru.dmitry.matercontroller.feature.pipeline.PipelineQueue

/**
 * Locks the pipeline queue contract for the first Android queue package:
 *  - score_v2 (candidate_score) and score_v1 (score) parse into SEPARATE fields, never merged.
 *  - snake_case wire fields map correctly.
 *  - the three queues resolve to the canonical backend status strings.
 */
class PipelineQueueMappingTest {
    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test
    fun parsesPipelineLeadsKeepingBothScoresSeparate() {
        val raw = """
            {"ok":true,"data":{"items":[
              {"lead_id":"KZ-77","company":"ТОО Пример","status":"verified_ready",
               "website_status":"FOUND","email_status":"OFFICIAL_PAGE","identity_status":"IDENTITY_VERIFIED",
               "candidate_score":72,"candidate_score_version":"score_v2","score":90.0,
               "lead_route":"AUDIT","region":"KZ","industry":"retail","serverOnlyField":"ignored"}
            ]},"requestId":"req_pipe"}
        """.trimIndent()
        val env = json.decodeFromString(Envelope.serializer(PipelineLeadsData.serializer()), raw)
        assertTrue(env.ok)
        val lead = env.data!!.items.single()
        assertEquals("KZ-77", lead.lead_id)
        // score_v2 and score_v1 land in distinct fields with distinct types.
        assertEquals(72, lead.candidateScoreV2)
        assertEquals("score_v2", lead.candidateScoreVersionV2)
        assertEquals(90.0, lead.canonicalScoreV1!!, 0.0001)
        assertEquals("FOUND", lead.website_status)
        assertEquals("AUDIT", lead.lead_route)
    }

    @Test
    fun missingScoresStayNullNotZero() {
        val raw = """{"ok":true,"data":{"items":[{"lead_id":"X","company":"NoScore"}]}}"""
        val env = json.decodeFromString(Envelope.serializer(PipelineLeadsData.serializer()), raw)
        val lead = env.data!!.items.single()
        assertNull(lead.candidateScoreV2)
        assertNull(lead.canonicalScoreV1)
    }

    @Test
    fun emptyQueueParsesToEmptyItems() {
        val raw = """{"ok":true,"data":{"items":[]}}"""
        val env = json.decodeFromString(Envelope.serializer(PipelineLeadsData.serializer()), raw)
        assertTrue(env.data!!.items.isEmpty())
    }

    @Test
    fun threeQueuesMapToCanonicalStatusStrings() {
        assertEquals("manual_review_product_routing", PipelineQueue.PRODUCT_ROUTING.status)
        assertEquals("STAGING", PipelineQueue.STAGING.status)
        assertEquals("verified_ready", PipelineQueue.VERIFIED_READY.status)
    }

    @Test
    fun fromKeyResolvesByEnumNameAndStatus() {
        assertEquals(PipelineQueue.VERIFIED_READY, PipelineQueue.fromKey("VERIFIED_READY"))
        assertEquals(PipelineQueue.VERIFIED_READY, PipelineQueue.fromKey("verified_ready"))
        assertEquals(PipelineQueue.PRODUCT_ROUTING, PipelineQueue.fromKey("PRODUCT_ROUTING"))
        assertEquals(PipelineQueue.PRODUCT_ROUTING, PipelineQueue.fromKey("manual_review_product_routing"))
        assertEquals(PipelineQueue.STAGING, PipelineQueue.fromKey("STAGING"))
        // unknown falls back to STAGING (never crashes the screen)
        assertEquals(PipelineQueue.STAGING, PipelineQueue.fromKey("garbage"))
    }
}
