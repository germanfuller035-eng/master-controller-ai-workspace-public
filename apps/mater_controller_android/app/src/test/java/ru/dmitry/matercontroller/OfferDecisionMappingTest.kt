package ru.dmitry.matercontroller

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.CommandResult
import ru.dmitry.matercontroller.core.model.DecisionBody
import ru.dmitry.matercontroller.core.model.Envelope
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.feature.commercial.OfferReviewAction

/**
 * RC3 — offer-review owner decision proofs. The 4 status-only actions map to the documented backend
 * `decision` verbs; DecisionBody serializes; CommandResult parses from a snake_case Envelope. None of
 * these actions sends a message — they only change the offer status.
 */
class OfferDecisionMappingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test fun actionDecisionMappingMatchesContract() {
        assertEquals("APPROVE_DRAFT_FOR_SEND_REVIEW", OfferReviewAction.APPROVE_TEXT_ONLY.decision)
        assertEquals("REQUEST_CHANGES", OfferReviewAction.REQUEST_CHANGES.decision)
        assertEquals("REJECT_INTERNAL_DRAFT", OfferReviewAction.REJECT_DRAFT.decision)
        assertEquals("RETURN_FOR_EDIT", OfferReviewAction.RESTORE_TO_REVIEW.decision)
        // OPEN_PREVIEW is not a command — no decision verb.
        assertNull(OfferReviewAction.OPEN_PREVIEW.decision)
    }

    @Test fun decisionBodySerializesWithRevision() {
        val body = DecisionBody(decision = "APPROVE_DRAFT_FOR_SEND_REVIEW", expectedRevision = 42)
        val text = json.encodeToString(DecisionBody.serializer(), body)
        assertTrue(text.contains("\"decision\":\"APPROVE_DRAFT_FOR_SEND_REVIEW\""))
        assertTrue(text.contains("\"expectedRevision\":42"))
    }

    @Test fun commandResultParsesSnakeCaseEnvelope() {
        val raw = """{"ok":true,"data":{"ok":true,"id":"offer_dbbbf391d547","entity":"offer","revision":43,"decision":"APPROVE_DRAFT_FOR_SEND_REVIEW"},"error":null}"""
        val env = json.decodeFromString(Envelope.serializer(CommandResult.serializer()), raw)
        assertTrue(env.ok)
        val r = env.data!!
        assertTrue(r.ok)
        assertEquals("offer_dbbbf391d547", r.id)
        assertEquals("offer", r.entity)
        assertEquals(43, r.revision)
        assertEquals("APPROVE_DRAFT_FOR_SEND_REVIEW", r.decision)
    }

    @Test fun conflictEnvelopeCarriesActualRevisionInDetails() {
        // 409 REVISION_CONFLICT body shape — details.actual must be readable, ok must be false.
        val raw = """{"ok":false,"data":null,"error":{"code":"REVISION_CONFLICT","message":"stale","details":{"actual":44}}}"""
        val env = json.decodeFromString(Envelope.serializer(CommandResult.serializer()), raw)
        assertFalse(env.ok)
        assertEquals("REVISION_CONFLICT", env.error?.code)
    }

    @Test fun decisionTargetStatusLocalizedNeverRaw() {
        for (a in OfferReviewAction.entries) {
            val target = OwnerLocalization.renderOfferActionTargetStatusRu(a.code)
            assertFalse("raw code leaked: $target", target.contains("_"))
            val effect = OwnerLocalization.renderOfferActionEffectRu(a.code)
            assertFalse(effect.contains("_"))
        }
        // Restore-to-review copy is owner-facing, not the raw verb.
        assertFalse(OwnerLocalization.renderOfferActionTitleRu("RESTORE_TO_REVIEW").contains("_"))
    }
}
