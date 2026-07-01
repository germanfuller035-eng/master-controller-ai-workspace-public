package ru.dmitry.matercontroller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.dmitry.matercontroller.core.model.NextActionData
import ru.dmitry.matercontroller.core.model.Lead
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.feature.pipeline.PipelineQueue
import ru.dmitry.matercontroller.feature.approvals.ApprovalQueue
import ru.dmitry.matercontroller.feature.replies.ReplyFilter

/**
 * Owner-facing localization + raw-value-removal proofs (Phase 13).
 * The live next-action DTO is { kind, reason, lead }; for DKBI_RU kind="followup" and
 * reason="proven SMTP 250 and >48h since send" (raw English — must never reach the owner).
 */
class OwnerLocalizationTest {

    private val FOLLOWUP = "Доставка письма подтверждена. Прошло более 48 часов — пора проверить ответ и подготовить повторное обращение."

    // 1. Follow-up DTO → specific Russian reason.
    @Test fun followupDtoYieldsSpecificRussianReason() {
        val a = NextActionData(kind = "followup", reason = "proven SMTP 250 and >48h since send", lead = Lead(leadId = "DKBI_RU", company = "ДКБИ"))
        assertEquals(FOLLOWUP, OwnerLocalization.renderNextActionReasonRu(a))
    }

    // 2. Raw SMTP reason absent from the rendered string.
    @Test fun noRawSmtpReason() {
        val a = NextActionData(kind = "followup", reason = "proven SMTP 250 and >48h since send")
        val out = OwnerLocalization.renderNextActionReasonRu(a)
        assertFalse(out.contains("SMTP"))
        assertFalse(out.contains("proven"))
        assertFalse(out.contains("since send"))
        assertFalse(out.contains("followup"))
    }

    // 3-5. Pipeline queue titles localized (no raw enum text).
    @Test fun pipelineQueueTitlesLocalized() {
        assertEquals("Продуктовый маршрут", PipelineQueue.PRODUCT_ROUTING.title)
        assertEquals("Новые кандидаты", PipelineQueue.STAGING.title)
        assertEquals("Проверенные лиды", PipelineQueue.VERIFIED_READY.title)
        // canonical status strings are UNCHANGED
        assertEquals("STAGING", PipelineQueue.STAGING.status)
        assertEquals("verified_ready", PipelineQueue.VERIFIED_READY.status)
        assertEquals("manual_review_product_routing", PipelineQueue.PRODUCT_ROUTING.status)
    }

    @Test fun queueNameRendererLocalized() {
        assertEquals("Продуктовый маршрут", OwnerLocalization.renderQueueNameRu("manual_review_product_routing"))
        assertEquals("Новые кандидаты", OwnerLocalization.renderQueueNameRu("STAGING"))
        assertEquals("Проверенные лиды", OwnerLocalization.renderQueueNameRu("verified_ready"))
    }

    // 6. approval pending localized.
    @Test fun approvalPendingLocalized() {
        assertEquals("ожидает подтверждения", OwnerLocalization.renderApprovalStatusRu("approval_pending"))
    }

    // 7. BLOCKED localized.
    @Test fun blockedAutosendLocalized() {
        assertEquals("заблокирована", OwnerLocalization.renderAutomationStateRu("BLOCKED"))
        assertFalse(OwnerLocalization.renderAutomationStateRu("BLOCKED").contains("BLOCKED"))
    }

    // 8. waiting_reply localized.
    @Test fun waitingReplyLocalized() {
        assertEquals("ожидает ответа", OwnerLocalization.renderLeadStatusRu("waiting_reply"))
        assertFalse(OwnerLocalization.renderLeadStatusRu("waiting_reply").contains("waiting"))
    }

    // 9. send_uncertain localized.
    @Test fun sendUncertainLocalized() {
        assertEquals("результат отправки требует проверки", OwnerLocalization.renderLeadStatusRu("send_uncertain"))
    }

    // 10. Unknown status → safe fallback (never the raw key).
    @Test fun unknownStatusSafeFallback() {
        assertEquals("другой рабочий статус", OwnerLocalization.renderLeadStatusRu("some_new_internal_key"))
        assertEquals("требуется проверка", OwnerLocalization.renderApprovalStatusRu("totally_unknown"))
    }

    // 11. null/empty never rendered as raw placeholder.
    @Test fun nullEmptyNotRawPlaceholder() {
        assertEquals("другой рабочий статус", OwnerLocalization.renderLeadStatusRu(null))
        assertEquals("другой рабочий статус", OwnerLocalization.renderLeadStatusRu(""))
        assertFalse(OwnerLocalization.hasValue(null))
        assertFalse(OwnerLocalization.hasValue(""))
        assertFalse(OwnerLocalization.hasValue("—"))
        assertFalse(OwnerLocalization.hasValue("null"))
        assertTrue(OwnerLocalization.hasValue("dkbi.ru"))
    }

    // Reason renderer: kind priority, legacy reason allowlist, safe fallback, never undefined.
    @Test fun reasonKindPriorityAndFallback() {
        assertEquals(FOLLOWUP, OwnerLocalization.renderNextActionReasonRu(NextActionData(kind = "followup")))
        // unknown kind + unknown reason → safe fallback
        val out = OwnerLocalization.renderNextActionReasonRu(NextActionData(kind = "zzz", reason = "also unknown"))
        assertEquals("Требуется проверить следующее действие.", out)
        // null action never throws / never "null"
        val n = OwnerLocalization.renderNextActionReasonRu(null)
        assertTrue(n.isNotBlank())
        assertFalse(n.contains("null"))
    }

    @Test fun reasonCodeAllowlistCovered() {
        val codes = listOf(
            "waiting_for_reply", "reply_requires_response", "interested_reply", "unmatched_reply",
            "audit_needs_review", "audit_evidence_insufficient", "draft_awaiting_approval", "draft_blocked",
            "send_uncertain", "identity_verification_required", "no_public_email", "channel_search_required",
            "product_routing_review", "dead_letter_review", "scheduler_paused", "manual_review", "no_available_action",
        )
        for (c in codes) {
            val out = OwnerLocalization.renderNextActionReasonRu(NextActionData(reason = c))
            assertTrue("code $c should map", out != "Требуется проверить следующее действие.")
            // no raw english code leaks
            assertFalse(out.lowercase().contains(c))
        }
    }

    // Replies: tabs localized, all categories preserved, no raw "Bounce".
    @Test fun replyFilterTabsLocalized() {
        val labels = ReplyFilter.entries.map { it.label }
        assertEquals(listOf("Новые", "Все", "Интерес", "Отказ", "Недоставка", "Не определено"), labels)
        assertFalse(labels.any { it.contains("Bounce", ignoreCase = true) })
        // category wire values unchanged
        assertEquals("bounce", ReplyFilter.BOUNCE.category)
        assertEquals("unmatched", ReplyFilter.UNMATCHED.category)
    }

    @Test fun replyClassLocalized() {
        assertEquals("Интерес", OwnerLocalization.renderReplyClassRu("interested"))
        assertEquals("Отказ", OwnerLocalization.renderReplyClassRu("not_interested"))
        assertEquals("Недоставка", OwnerLocalization.renderReplyClassRu("bounce"))
        assertEquals("Не определено", OwnerLocalization.renderReplyClassRu("unmatched"))
        assertEquals("Не определено", OwnerLocalization.renderReplyClassRu(null))
    }

    // System hub owner-facing text.
    @Test fun systemHubOwnerFacing() {
        assertEquals("работает", OwnerLocalization.renderWriterStateRu(true))
        assertEquals("не активен", OwnerLocalization.renderWriterStateRu(false))
        assertEquals("заблокирована", OwnerLocalization.renderAutomationStateRu("BLOCKED"))
        assertEquals("выключена", OwnerLocalization.renderLiveSendRu(false))
        assertEquals("выполнено", OwnerLocalization.renderJobStatusRu("COMPLETED"))
        assertEquals("dead-letter", OwnerLocalization.renderJobStatusRu("dead_letter"))
    }

    // Approval queue keys/statuses unchanged (canonical), titles Russian.
    @Test fun approvalQueueCanonicalUnchanged() {
        assertEquals("approval_pending", ApprovalQueue.DRAFTS.status)
        assertEquals("audit_ready", ApprovalQueue.AUDITS.status)
        assertEquals("Черновики писем", ApprovalQueue.DRAFTS.title)
    }

    // Route renderer hides unknown/empty (returns null).
    @Test fun routeRendererHidesEmpty() {
        assertEquals(null, OwnerLocalization.renderRouteRu(null))
        assertEquals(null, OwnerLocalization.renderRouteRu(""))
        assertEquals("ожидание ответа", OwnerLocalization.renderRouteRu("waiting_reply"))
        assertEquals("готов к отправке", OwnerLocalization.renderRouteRu("send"))
    }

    // Error codes localized, never raw class names / envelopes.
    @Test fun errorCodesLocalized() {
        assertTrue(OwnerLocalization.renderErrorCodeRu("CONFLICT").contains("изменились"))
        assertTrue(OwnerLocalization.renderErrorCodeRu("UNAUTHORIZED").contains("Переподключите"))
        assertFalse(OwnerLocalization.renderErrorCodeRu("CONFLICT").contains("CONFLICT"))
    }

    // ---- RC3: source localization ----
    @Test fun sourceLocalized() {
        assertEquals("Ручная проверка из CSV", OwnerLocalization.renderLeadSourceRu("manual_verified_csv"))
        assertEquals("Lead Hunter", OwnerLocalization.renderLeadSourceRu("lead_hunter"))
        assertEquals("OpenStreetMap", OwnerLocalization.renderLeadSourceRu("overpass"))
        assertEquals("2ГИС", OwnerLocalization.renderLeadSourceRu("2gis"))
    }

    @Test fun sourceHiddenWhenAbsent() {
        assertEquals(null, OwnerLocalization.renderLeadSourceRu(null))
        assertEquals(null, OwnerLocalization.renderLeadSourceRu(""))
        assertEquals(null, OwnerLocalization.renderLeadSourceRu("—"))
    }

    @Test fun sourceUnknownSafeFallbackNoRaw() {
        val out = OwnerLocalization.renderLeadSourceRu("weird_internal_provider_x")
        assertEquals("Источник не определён", out)
        assertFalse(out!!.contains("weird"))
        assertFalse(out.contains("_"))
    }

    // ---- RC3: blocker localization + redundancy ----
    @Test fun alreadyWaitingReplyLocalized() {
        val p = OwnerLocalization.renderBlockerRu("ALREADY_WAITING_REPLY")!!
        assertEquals("Уже ожидает ответа", p.text)
        assertTrue(p.hideWhenRedundant)
    }

    @Test fun alreadyWaitingReplyHiddenWhenRedundant() {
        // status waiting_reply + ALREADY_WAITING_REPLY → blocker dropped (redundant)
        val lines = OwnerLocalization.renderBlockerLinesRu(listOf("ALREADY_WAITING_REPLY"), "waiting_reply")
        assertTrue(lines.isEmpty())
        // but with a different status it is shown
        val shown = OwnerLocalization.renderBlockerLinesRu(listOf("ALREADY_WAITING_REPLY"), "verified_ready")
        assertEquals(listOf("Уже ожидает ответа"), shown)
    }

    @Test fun sendUncertainLocalizedWithAction() {
        val p = OwnerLocalization.renderBlockerRu("SEND_UNCERTAIN")!!
        assertEquals("Результат отправки требует проверки", p.text)
        assertEquals("Проверьте результат отправки вручную", p.recommendedAction)
    }

    @Test fun missingPreviewLocalized() {
        assertEquals("Предпросмотр аудита ещё не сформирован", OwnerLocalization.renderBlockerRu("MISSING_PREVIEW")!!.text)
        assertEquals("Предпросмотр аудита ещё не сформирован", OwnerLocalization.renderAuditMissingReasonRu("audit_not_generated"))
    }

    @Test fun unknownBlockerSafeFallbackNoRaw() {
        val p = OwnerLocalization.renderBlockerRu("SOME_NEW_GUARD_CODE")!!
        assertEquals("Требуется ручная проверка", p.text)
        assertFalse(p.text.contains("GUARD"))
        assertFalse(p.text.contains("_"))
    }

    @Test fun blockerLinesNeverContainRawCodes() {
        val raw = listOf("ALREADY_WAITING_REPLY", "SEND_UNCERTAIN", "MISSING_PREVIEW", "NO_PUBLIC_EMAIL", "ZZZ_UNKNOWN")
        val lines = OwnerLocalization.renderBlockerLinesRu(raw, "verified_ready")
        for (l in lines) {
            assertFalse("raw code leaked: $l", Regex("[A-Z]{2,}(_[A-Z]+)+").containsMatchIn(l))
            assertFalse(l.contains("_"))
        }
    }

    @Test fun emptyBlockersYieldNoLines() {
        assertTrue(OwnerLocalization.renderBlockerLinesRu(emptyList(), "waiting_reply").isEmpty())
        assertTrue(OwnerLocalization.renderBlockerLinesRu(null, null).isEmpty())
    }

    // ---- RC3: follow-up terminology ----
    @Test fun followupTermIsRussian() {
        assertEquals("Повторный контакт", OwnerLocalization.FOLLOWUP_TERM)
        assertFalse(OwnerLocalization.FOLLOWUP_TERM.lowercase().contains("follow"))
    }

    // ---- RC3: locale date, source timestamp unchanged ----
    @Test fun dateLocalizedTimestampNotMutated() {
        // DKBI sent_at
        assertEquals("12 июня 2026, 21:43", OwnerLocalization.renderDateRu("2026-06-12T21:43:29.190Z"))
        // unparseable input is returned trimmed, never null
        assertEquals(null, OwnerLocalization.renderDateRu(null))
        val odd = OwnerLocalization.renderDateRu("not-a-date")
        assertTrue(odd == "not-a-date")
    }

    @Test fun auditMissingReasonNeverRaw() {
        val out = OwnerLocalization.renderAuditMissingReasonRu("audit_not_generated")
        assertFalse(out.contains("_"))
        assertFalse(out.contains("audit_not_generated"))
    }
}
