package ru.dmitry.matercontroller

import org.junit.Assert.*
import org.junit.Test
import ru.dmitry.matercontroller.core.data.ErrorCodes
import ru.dmitry.matercontroller.core.ui.ScreenPhase
import ru.dmitry.matercontroller.core.ui.screenPhaseForError
import ru.dmitry.matercontroller.feature.approvals.ApprovalQueue
import ru.dmitry.matercontroller.feature.pipeline.PipelineQueue

/** Distinct HTTP→error-code mapping and error→screen-phase mapping. */
class ErrorMappingTest {
    @Test fun httpStatusesMapToDistinctCodes() {
        assertEquals(ErrorCodes.UNAUTHORIZED, ErrorCodes.fromHttp(401))
        assertEquals(ErrorCodes.FORBIDDEN, ErrorCodes.fromHttp(403))
        assertEquals(ErrorCodes.NOT_FOUND, ErrorCodes.fromHttp(404))
        assertEquals(ErrorCodes.CONFLICT, ErrorCodes.fromHttp(409))
        assertEquals(ErrorCodes.MAINTENANCE, ErrorCodes.fromHttp(423))
        assertEquals(ErrorCodes.RATE_LIMITED, ErrorCodes.fromHttp(429))
        assertEquals(ErrorCodes.UNAVAILABLE, ErrorCodes.fromHttp(503))
        assertEquals(ErrorCodes.SERVER, ErrorCodes.fromHttp(500))
    }

    @Test fun errorCodesMapToScreenPhases() {
        assertEquals(ScreenPhase.Unauthorized, screenPhaseForError(ErrorCodes.UNAUTHORIZED))
        assertEquals(ScreenPhase.Maintenance, screenPhaseForError(ErrorCodes.MAINTENANCE))
        assertEquals(ScreenPhase.Conflict, screenPhaseForError(ErrorCodes.CONFLICT))
        assertEquals(ScreenPhase.RateLimited, screenPhaseForError(ErrorCodes.RATE_LIMITED))
        assertEquals(ScreenPhase.Unavailable, screenPhaseForError(ErrorCodes.UNAVAILABLE))
        assertEquals(ScreenPhase.Error, screenPhaseForError(ErrorCodes.SERVER))
    }

    @Test fun approvalQueuesMapToCanonicalStatus() {
        assertEquals("audit_ready", ApprovalQueue.AUDITS.status)
        assertEquals("approval_pending", ApprovalQueue.DRAFTS.status)
        assertEquals("followups", ApprovalQueue.FOLLOWUPS.status)
        assertEquals(ApprovalQueue.DRAFTS, ApprovalQueue.fromKey("drafts"))
        assertEquals(ApprovalQueue.AUDITS, ApprovalQueue.fromKey("garbage")) // safe fallback
    }

    @Test fun pipelineQueuesMapToCanonicalStatus() {
        assertEquals("manual_review_product_routing", PipelineQueue.PRODUCT_ROUTING.status)
        assertEquals("STAGING", PipelineQueue.STAGING.status)
        assertEquals("verified_ready", PipelineQueue.VERIFIED_READY.status)
    }
}
