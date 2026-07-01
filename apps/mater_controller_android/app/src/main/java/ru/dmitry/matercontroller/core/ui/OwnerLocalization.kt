package ru.dmitry.matercontroller.core.ui

import ru.dmitry.matercontroller.core.model.NextActionData

/**
 * Centralized owner-facing localization (presentation layer ONLY).
 *
 * Rules (mirror the Telegram api_only/views.mjs contract):
 *  - Domain/API values are NEVER mutated; canonical state keeps its raw strings.
 *  - Translation happens here, at render time, and nowhere else.
 *  - A raw backend enum must never reach the owner UI.
 *  - Unknown value → a safe generic Russian label (never the raw key, never null/"—").
 *  - Canonical identifiers (lead_id, deviceId, etc.) are NOT translated.
 *  - "Mini Audit" is a product/brand name and stays as-is.
 */
object OwnerLocalization {

    private fun norm(v: String?): String =
        (v ?: "").trim().lowercase().replace(Regex("[\\s-]+"), "_")

    /** Public normalized form of a backend enum (lowercase, separators → underscore). For filtering. */
    fun normStatus(v: String?): String = norm(v)

    // ---------------------------------------------------------------------
    // Commercial money (Integration Wave 1). A null amount is UNKNOWN and is rendered as a word,
    // never as 0. The classification (FACT|TARGET|ESTIMATE|UNKNOWN) is shown as a Russian qualifier.
    // ---------------------------------------------------------------------
    fun renderMoneyRu(amount: Double?, currency: String? = "RUB", cls: String? = null): String {
        if (amount == null) return "нет данных"
        val whole = if (amount % 1.0 == 0.0) amount.toLong().toString() else String.format("%.2f", amount)
        val cur = when (norm(currency)) { "rub", "" -> "₽"; "usd" -> "$"; "eur" -> "€"; else -> currency ?: "" }
        val q = renderValueClassRu(cls)
        return if (q.isEmpty()) "$whole $cur" else "$whole $cur · $q"
    }

    fun renderValueClassRu(cls: String?): String = when (norm(cls)) {
        "fact" -> "подтверждено"
        "estimate" -> "оценка"
        "target" -> "план"
        "unknown" -> "нет данных"
        else -> ""
    }

    /** True when an optional value carries real content (not null/blank/placeholder). */
    fun hasValue(v: String?): Boolean {
        if (v == null) return false
        val t = v.trim()
        if (t.isEmpty()) return false
        return !Regex("^(null|undefined|—|none|unknown|n/?a)$", RegexOption.IGNORE_CASE).matches(t)
    }

    // ---------------------------------------------------------------------
    // Lead status (singular owner wording on a card / detail).
    // ---------------------------------------------------------------------
    private val LEAD_STATUS = mapOf(
        "waiting_reply" to "ожидает ответа",
        "ready_to_send" to "готов к отправке",
        "verified_ready" to "проверен и готов к обработке",
        "followup_due" to "требуется повторный контакт",
        "send_uncertain" to "результат отправки требует проверки",
        "needs_identity_verification" to "нужна проверка компании",
        "hold_no_public_email" to "не найден публичный email",
        "written_channel_search_queue" to "требуется поиск другого канала",
        "hold_later" to "отложен",
        "rejected" to "отклонён",
        "approval_pending" to "ожидает подтверждения",
        "audit_ready" to "аудит готов к проверке",
        "drafting" to "готовится черновик",
        "draft_ready" to "черновик готов",
        "manual_review_product_routing" to "продуктовый маршрут",
        "staging" to "новый кандидат",
        "new" to "новый",
        "contacted" to "контакт установлен",
        "interested" to "проявлен интерес",
        "won" to "сделка выиграна",
        "lost" to "сделка проиграна",
        "closed" to "закрыт",
    )

    fun renderLeadStatusRu(value: String?): String {
        if (!hasValue(value)) return "другой рабочий статус"
        return LEAD_STATUS[norm(value)] ?: "другой рабочий статус"
    }

    // ---------------------------------------------------------------------
    // Route / next-action hint / eligibility category.
    // ---------------------------------------------------------------------
    private val ROUTE = mapOf(
        "send" to "готов к отправке",
        "ready_send" to "готов к отправке",
        "waiting_reply" to "ожидание ответа",
        "send_uncertain" to "проверка результата отправки",
        "needs_email" to "поиск email",
        "needs_audit" to "подготовка аудита",
        "manual_review_product_routing" to "продуктовый маршрут",
        "product_routing" to "продуктовый маршрут",
        "blocked" to "заблокирован",
        "review" to "ручная проверка",
    )

    /** Returns null when the route is empty/unknown so the caller can hide the row. */
    fun renderRouteRu(value: String?): String? {
        if (!hasValue(value)) return null
        return ROUTE[norm(value)] ?: "нет данных"
    }

    // ---------------------------------------------------------------------
    // Next-action reason. Priority: reasonCode → kind → legacy reason allowlist → fallback.
    // The raw English `reason` ("proven SMTP 250 and >48h since send") is NEVER shown.
    // ---------------------------------------------------------------------
    private const val FOLLOWUP_DUE =
        "Доставка письма подтверждена. Прошло более 48 часов — пора проверить ответ и подготовить повторное обращение."

    private val REASON_CODE = mapOf(
        // canonical reason_code allowlist
        "followup_due_delivery_confirmed_48h" to FOLLOWUP_DUE,
        "waiting_for_reply" to "Письмо отправлено, ответа пока нет. Ожидаем реакцию адресата.",
        "reply_requires_response" to "Получен ответ — требуется ваша реакция и подготовка ответа.",
        "interested_reply" to "Получен заинтересованный ответ — подготовьте следующий шаг.",
        "unmatched_reply" to "Получен ответ, который не удалось сопоставить с лидом — нужна ручная проверка.",
        "audit_needs_review" to "Аудит готов к проверке перед подготовкой письма.",
        "audit_evidence_insufficient" to "Недостаточно доказательств для аудита — нужно собрать больше данных.",
        "draft_awaiting_approval" to "Черновик письма готов и ждёт вашего утверждения (отправка остаётся заблокированной).",
        "draft_blocked" to "Черновик заблокирован — устраните причину перед утверждением.",
        "send_uncertain" to "Результат предыдущей отправки неясен — требуется проверка перед повтором.",
        "identity_verification_required" to "Нужно подтвердить личность/компанию лида.",
        "no_public_email" to "Публичный email не найден — требуется поиск другого канала.",
        "channel_search_required" to "Идёт поиск подходящего канала связи.",
        "product_routing_review" to "Нужно выбрать подходящий продукт для лида.",
        "dead_letter_review" to "Задача попала в dead-letter — требуется ручной разбор.",
        "scheduler_paused" to "Планировщик приостановлен — действий по расписанию нет.",
        "manual_review" to "Требуется ручная проверка перед следующим шагом.",
        "no_available_action" to "Приоритетных действий сейчас нет.",
        // legacy reason aliases
        "followup_due" to FOLLOWUP_DUE,
        "waiting_reply" to "Письмо отправлено, ответа пока нет. Ожидаем реакцию адресата.",
        "audit_review" to "Аудит готов к проверке перед подготовкой письма.",
        "insufficient_audit_evidence" to "Недостаточно доказательств для аудита — нужно собрать больше данных.",
        "draft_approval" to "Черновик письма готов и ждёт вашего утверждения (отправка остаётся заблокированной).",
        "blocked_draft" to "Черновик заблокирован — устраните причину перед утверждением.",
        "uncertain_send" to "Результат предыдущей отправки неясен — требуется проверка перед повтором.",
        "identity_verification" to "Нужно подтвердить личность/компанию лида.",
        "channel_search" to "Идёт поиск подходящего канала связи.",
        "product_routing" to "Нужно выбрать подходящий продукт для лида.",
        "dead_letter" to "Задача попала в dead-letter — требуется ручной разбор.",
        "review" to "Требуется проверка перед следующим шагом.",
    )

    // Stable next-action `kind` enum produced by the backend operator-mode
    // (getMiniAuditOperatorState().nextAction.kind).
    private val KIND = mapOf(
        "followup" to FOLLOWUP_DUE,
        "ready_send" to "Лид готов к отправке: письмо и аудит подготовлены, отправка ожидает подтверждения.",
        "prepare_email" to "Аудит готов, но письмо ещё не подготовлено — нужно собрать черновик.",
        "repair_preview" to "Не хватает превью аудита — требуется восстановить материалы перед письмом.",
        "verify_email" to "Рабочий email не найден — требуется проверка контакта лида.",
        "verify_proof" to "Результат предыдущей отправки не подтверждён — нужно проверить доставку.",
        "none" to "Приоритетных действий сейчас нет.",
        "no_action" to "Приоритетных действий сейчас нет.",
    )

    fun renderNextActionReasonRu(action: NextActionData?): String {
        val a = action ?: return "Требуется проверить следующее действие."
        // 1) stable reason_code / action type (if the DTO ever carries one in `reason` as a code)
        // 2) stable `kind`
        KIND[norm(a.kind)]?.let { return it }
        // 3) exact allowlisted legacy reason text (no fuzzy parsing)
        REASON_CODE[norm(a.reason)]?.let { return it }
        // 4) safe fallback (never raw English, never null/undefined)
        return "Требуется проверить следующее действие."
    }

    // ---------------------------------------------------------------------
    // Pipeline / approval queue names.
    // ---------------------------------------------------------------------
    private val QUEUE = mapOf(
        "manual_review_product_routing" to "Продуктовый маршрут",
        "product_routing" to "Продуктовый маршрут",
        "staging" to "Новые кандидаты",
        "verified_ready" to "Проверенные лиды",
        "audit_ready" to "Аудиты",
        "approval_pending" to "Черновики писем",
        "followups" to "Follow-up",
        "needs_response" to "Черновики ответов",
        "mini_audit" to "Mini Audit",
    )

    fun renderQueueNameRu(value: String?): String {
        if (!hasValue(value)) return "Другой раздел"
        return QUEUE[norm(value)] ?: "Другой раздел"
    }

    // ---------------------------------------------------------------------
    // Approval / decision status.
    // ---------------------------------------------------------------------
    private val APPROVAL_STATUS = mapOf(
        "approval_pending" to "ожидает подтверждения",
        "audit_ready" to "аудит готов к проверке",
        "followup_due" to "требуется повторный контакт",
        "followups" to "требуется повторный контакт",
        "reply_draft" to "черновик ответа",
        "needs_response" to "требуется ответ",
        "blocked" to "заблокировано",
        "failed" to "ошибка обработки",
        "manual_review" to "требуется ручная проверка",
        "waiting_review" to "ожидает проверки",
        "dead_letter" to "задача в dead-letter",
        "draft_ready" to "черновик готов",
        "rejected" to "отклонено",
        "approved" to "подтверждено",
    )

    fun renderApprovalStatusRu(value: String?): String {
        if (!hasValue(value)) return "требуется проверка"
        return APPROVAL_STATUS[norm(value)]
            ?: LEAD_STATUS[norm(value)]
            ?: "требуется проверка"
    }

    // ---------------------------------------------------------------------
    // Reply classification.
    // ---------------------------------------------------------------------
    private val REPLY_CLASS = mapOf(
        "interested" to "Интерес",
        "not_interested" to "Отказ",
        "question" to "Вопрос",
        "bounce" to "Недоставка",
        "auto_reply" to "Автоответ",
        "unmatched" to "Не определено",
        "new" to "Новый",
    )

    fun renderReplyClassRu(value: String?): String {
        if (!hasValue(value)) return "Не определено"
        return REPLY_CLASS[norm(value)] ?: "Не определено"
    }

    // ---------------------------------------------------------------------
    // Automation state (writer / autosend / live send).
    // ---------------------------------------------------------------------
    fun renderAutomationStateRu(value: String?): String {
        val n = norm(value)
        return when {
            n.contains("block") -> "заблокирована"
            n == "off" || n == "false" -> "выключена"
            n == "on" || n == "true" -> "включена"
            !hasValue(value) -> "—"
            else -> "заблокирована"
        }
    }

    fun renderWriterStateRu(canonicalWriter: Boolean): String =
        if (canonicalWriter) "работает" else "не активен"

    fun renderLiveSendRu(sendAllowedLive: Boolean): String =
        if (sendAllowedLive) "включена" else "выключена"

    // ---------------------------------------------------------------------
    // Product price. UNKNOWN/absent price is NEVER rendered as 0 ₽.
    // ---------------------------------------------------------------------
    fun renderProductPriceRu(amount: Double?, currency: String? = "RUB", display: String? = null): String {
        if (amount == null) {
            val d = norm(display)
            return if (d == "free") "бесплатно" else "цена не определена"
        }
        val cur = when (norm(currency)) { "rub", "" -> "₽"; "usd" -> "$"; "eur" -> "€"; else -> (currency ?: "₽") }
        val whole = if (amount % 1.0 == 0.0) amount.toLong().toString() else amount.toString()
        // Group thousands with a thin space (Russian convention).
        val grouped = whole.reversed().chunked(3).joinToString(" ").reversed()
        return "$grouped $cur"
    }

    fun renderProductStatusRu(value: String?): String = when (norm(value)) {
        "active" -> "Активен"
        "draft" -> "Черновик"
        "planned" -> "Запланирован"
        else -> "—"
    }

    // ---------------------------------------------------------------------
    // Offer review (0.6.0-rc2). Offer lifecycle status + owner decision, owner-facing wording.
    // No send: READY_FOR_SEND_REVIEW means "awaiting owner's send-review decision", not "sent".
    // ---------------------------------------------------------------------
    fun renderOfferStatusRu(value: String?): String = when (norm(value)) {
        "ready_for_owner_review" -> "На проверку владельцем"
        "ready_for_send_review" -> "Ожидает проверки отправки"
        "changes_requested" -> "Запрошены правки"
        "approved" -> "Текст одобрен"
        "rejected" -> "Отклонён"
        "draft" -> "Черновик"
        else -> "Другой статус"
    }

    fun renderOfferDecisionRu(value: String?): String = when (norm(value)) {
        "approve" -> "Текст одобрен"
        "approve_draft_for_send_review" -> "Одобрен к проверке отправки"
        "request_changes", "return_for_edit" -> "Запрошены правки"
        "reject", "reject_internal_draft" -> "Отклонён"
        else -> "Решение не принято"
    }

    fun renderSendCapabilityRu(value: String?): String = when (norm(value)) {
        "none" -> "Отправка недоступна"
        "ready" -> "Готов к отправке (после контроля)"
        else -> "Отправка недоступна"
    }

    fun renderConfidenceRu(value: String?): String = when (norm(value)) {
        "system_observed" -> "подтверждено системой"
        "owner_confirmed" -> "подтверждено владельцем"
        "inferred" -> "предположительно"
        else -> "нет данных"
    }

    /** Human company label from a canonical lead_id (e.g. STROYDVOR-UG_RU → СтройДвор-Юг). */
    private val LEAD_ID_COMPANY = mapOf(
        "stroydvor_ug_ru" to "СтройДвор-Юг",
        "dkbi_ru" to "ДКБИ",
        "zavodatom_ru" to "Завод Атом",
    )

    fun companyFromLeadId(leadId: String?): String? {
        if (!hasValue(leadId)) return null
        return LEAD_ID_COMPANY[norm(leadId)]
    }

    // Offer action dialog copy (0.6.0-rc2). All actions are text-only; none send a message.
    fun renderOfferActionTitleRu(action: String?): String = when (norm(action)) {
        "open_preview" -> "Предпросмотр предложения"
        "request_changes" -> "Запросить правки"
        "reject_draft" -> "Отклонить черновик"
        "approve_text_only" -> "Одобрить только текст"
        "restore_to_review" -> "Вернуть на проверку"
        else -> "Действие"
    }

    fun renderOfferActionBodyRu(action: String?): String = when (norm(action)) {
        "open_preview" -> "Предпросмотр текста предложения. Сообщение клиенту не отправляется."
        "request_changes" -> "Черновик помечен на доработку. Сообщение клиенту не отправляется."
        "reject_draft" -> "Черновик отклонён. Сообщение клиенту не отправляется."
        "approve_text_only" -> "Текст одобрен. Это не отправляет сообщение — отправка остаётся за отдельным гейтом и сейчас отключена."
        "restore_to_review" -> "Черновик возвращён на проверку. Сообщение клиенту не отправляется."
        else -> "Сообщение клиенту не отправляется."
    }

    /** Short owner-facing label for the offer status a decision will move the offer INTO. */
    fun renderOfferActionTargetStatusRu(action: String?): String = when (norm(action)) {
        "approve_text_only" -> "Ожидает проверки отправки"
        "request_changes" -> "Запрошены правки"
        "reject_draft" -> "Отклонён"
        "restore_to_review" -> "Ожидает проверки отправки"
        else -> "Другой статус"
    }

    /** One-line "what changes" hint shown in the confirmation dialog before a decision. */
    fun renderOfferActionEffectRu(action: String?): String = when (norm(action)) {
        "approve_text_only" -> "Текст будет одобрен. Сделка не создаётся, статус остаётся в проверке отправки."
        "request_changes" -> "Черновик уйдёт на доработку — потребуется новый текст."
        "reject_draft" -> "Внутренний черновик будет отклонён."
        "restore_to_review" -> "Предложение вернётся в очередь проверки отправки."
        else -> "Изменится только внутренний статус."
    }

    const val OFFER_NO_SEND_NOTE = "Клиенту ничего не отправляется."

    // ---------------------------------------------------------------------
    // Agents live provider (RC3). Raw codes (tokenator / SHADOW_NO_SEND / CLOSED) never reach the UI.
    // ---------------------------------------------------------------------
    fun renderAgentProviderRu(provider: String?, available: Boolean): String {
        if (!available) return "AI-провайдер недоступен"
        return when (norm(provider)) {
            "tokenator" -> "Tokenator"
            "" -> "AI-провайдер недоступен"
            else -> provider ?: "AI-провайдер недоступен"
        }
    }

    fun renderAgentModeRu(value: String?): String = when (norm(value)) {
        "shadow_no_send" -> "Теневой, без отправки"
        "shadow" -> "Теневой, без отправки"
        "off" -> "Выключен"
        else -> "Теневой, без отправки"
    }

    fun renderCircuitStateRu(value: String?): String = when (norm(value)) {
        "closed" -> "в норме"
        "open" -> "защита сработала (запросы приостановлены)"
        "half_open" -> "пробное восстановление"
        else -> "нет данных"
    }

    // ---------------------------------------------------------------------
    // Source / scheduler health.
    // ---------------------------------------------------------------------
    private val SOURCE_HEALTH = mapOf(
        "ok" to "работает",
        "healthy" to "работает",
        "keyless" to "без ключа",
        "no_key" to "ключ не предоставлен",
        "degraded" to "работает с ограничениями",
        "down" to "недоступен",
        "paused" to "приостановлен",
    )

    fun renderSourceHealthRu(value: String?): String {
        if (!hasValue(value)) return "нет данных"
        return SOURCE_HEALTH[norm(value)] ?: "нет данных"
    }

    private val SCHEDULER_STATE = mapOf(
        "running" to "работает",
        "active" to "работает",
        "paused" to "приостановлен",
        "stopped" to "остановлен",
        "idle" to "ожидание",
    )

    fun renderSchedulerStateRu(value: String?): String {
        if (!hasValue(value)) return "нет данных"
        return SCHEDULER_STATE[norm(value)] ?: "нет данных"
    }

    // ---------------------------------------------------------------------
    // Job / queue status.
    // ---------------------------------------------------------------------
    private val JOB_STATUS = mapOf(
        "completed" to "выполнено",
        "running" to "в работе",
        "queued" to "в очереди",
        "pending" to "ожидает",
        "failed" to "ошибка",
        "dead_letter" to "dead-letter",
        "dead" to "dead-letter",
        "retrying" to "повтор",
        "cancelled" to "отменено",
    )

    fun renderJobStatusRu(value: String?): String {
        if (!hasValue(value)) return "нет данных"
        return JOB_STATUS[norm(value)] ?: "нет данных"
    }

    // ---------------------------------------------------------------------
    // Error codes → owner-facing message.
    // ---------------------------------------------------------------------
    fun renderErrorCodeRu(value: String?): String = when (norm(value)) {
        "unauthorized" -> "Подключение устройства больше недействительно. Переподключите устройство."
        "forbidden" -> "Недостаточно прав для этого действия."
        "not_found" -> "Данные не найдены. Обновите список."
        "conflict" -> "Данные изменились на сервере. Обновите экран и повторите действие."
        "revision_conflict" -> "Данные изменились на сервере. Загружена актуальная версия — проверьте и повторите при необходимости."
        "maintenance" -> "Сервер на обслуживании. Повторите позже."
        "rate_limited" -> "Слишком много запросов. Повторите чуть позже."
        "unavailable" -> "Сервер временно недоступен. Повторите позже."
        "timeout" -> "Превышено время ожидания ответа сервера."
        "network" -> "Нет соединения. Показаны сохранённые данные."
        else -> "Произошла ошибка. Повторите позже."
    }

    // ---------------------------------------------------------------------
    // Lead source (Phase 2). Returns null when absent so the row can be hidden.
    // DTO/Room values are never mutated — this is render-time only.
    // ---------------------------------------------------------------------
    private val SOURCE = mapOf(
        "manual_verified_csv" to "Ручная проверка из CSV",
        "lead_hunter" to "Lead Hunter",
        "leadhunter" to "Lead Hunter",
        "overpass" to "OpenStreetMap",
        "openstreetmap" to "OpenStreetMap",
        "osm" to "OpenStreetMap",
        "dataforseo" to "DataForSEO",
        "two_gis" to "2ГИС",
        "2gis" to "2ГИС",
        "yandex" to "Яндекс",
        "manual" to "Добавлено вручную",
        "manual_csv" to "Добавлено вручную (CSV)",
        "csv" to "Импорт из CSV",
        "website" to "Сайт компании",
    )

    fun renderLeadSourceRu(value: String?): String? {
        if (!hasValue(value)) return null
        return SOURCE[norm(value)] ?: "Источник не определён"
    }

    // ---------------------------------------------------------------------
    // Blocker localization (Phase 3) with redundancy rules (Phase 4).
    // ---------------------------------------------------------------------
    enum class BlockerSeverity { INFO, WARNING, ERROR }

    data class OwnerBlockerPresentation(
        val text: String,
        val severity: BlockerSeverity,
        val recommendedAction: String? = null,
        /** True when this blocker merely restates the lead's localized status (Phase 4). */
        val hideWhenRedundant: Boolean = false,
        /** The lead status (normalized) this blocker duplicates, if any. */
        val redundantWithStatus: String? = null,
    )

    private fun blockerPresentation(code: String): OwnerBlockerPresentation? = when (code) {
        "already_waiting_reply" -> OwnerBlockerPresentation(
            text = "Уже ожидает ответа", severity = BlockerSeverity.INFO,
            recommendedAction = "Повторное действие временно не требуется",
            hideWhenRedundant = true, redundantWithStatus = "waiting_reply",
        )
        "send_uncertain" -> OwnerBlockerPresentation(
            text = "Результат отправки требует проверки", severity = BlockerSeverity.WARNING,
            recommendedAction = "Проверьте результат отправки вручную",
            hideWhenRedundant = true, redundantWithStatus = "send_uncertain",
        )
        "missing_preview" -> OwnerBlockerPresentation(
            text = "Предпросмотр аудита ещё не сформирован", severity = BlockerSeverity.INFO,
        )
        "missing_email", "no_public_email" -> OwnerBlockerPresentation(
            text = "Не найден публичный email", severity = BlockerSeverity.WARNING,
        )
        "identity_not_verified", "needs_identity_verification" -> OwnerBlockerPresentation(
            text = "Компания не прошла проверку", severity = BlockerSeverity.WARNING,
        )
        "channel_search_required" -> OwnerBlockerPresentation(
            text = "Требуется найти другой канал связи", severity = BlockerSeverity.WARNING,
        )
        "audit_evidence_insufficient" -> OwnerBlockerPresentation(
            text = "Недостаточно доказательств для аудита", severity = BlockerSeverity.WARNING,
        )
        "draft_blocked" -> OwnerBlockerPresentation(
            text = "Черновик заблокирован", severity = BlockerSeverity.ERROR,
        )
        "revision_conflict" -> OwnerBlockerPresentation(
            text = "Данные изменились на сервере", severity = BlockerSeverity.WARNING,
        )
        "opt_out" -> OwnerBlockerPresentation(
            text = "Компания отказалась от сообщений", severity = BlockerSeverity.ERROR,
        )
        "legacy_only" -> OwnerBlockerPresentation(
            text = "Требуется ручная проверка", severity = BlockerSeverity.INFO,
        )
        else -> null
    }

    /** Single blocker → presentation. Unknown → safe fallback (never the raw code). */
    fun renderBlockerRu(value: String?): OwnerBlockerPresentation? {
        if (!hasValue(value)) return null
        return blockerPresentation(norm(value))
            ?: OwnerBlockerPresentation(text = "Требуется ручная проверка", severity = BlockerSeverity.INFO)
    }

    /**
     * Render a blocker LIST into owner-facing lines, applying redundancy rules against the
     * lead's status: a blocker that merely restates the localized status is dropped. Returns an
     * empty list when nothing meaningful remains (caller then shows "отсутствуют"). Never emits a
     * raw code.
     */
    fun renderBlockerLinesRu(blockers: List<String>?, status: String? = null): List<String> {
        if (blockers.isNullOrEmpty()) return emptyList()
        val st = norm(status)
        val out = LinkedHashSet<String>()
        for (b in blockers) {
            if (!hasValue(b)) continue
            val p = renderBlockerRu(b) ?: continue
            if (p.hideWhenRedundant && p.redundantWithStatus != null && p.redundantWithStatus == st) continue
            out.add(p.text)
        }
        return out.toList()
    }

    // ---------------------------------------------------------------------
    // Audit "missing preview/body" reason.
    // ---------------------------------------------------------------------
    fun renderAuditMissingReasonRu(value: String?): String = when (norm(value)) {
        "audit_not_generated", "missing_preview" -> "Предпросмотр аудита ещё не сформирован"
        "audit_evidence_insufficient" -> "Недостаточно доказательств для аудита"
        else -> "Аудит ещё не сформирован"
    }

    /**
     * RC6 (defect B): audit artifact status → owner-facing label. Raw codes never reach the UI.
     * Used by the lead-detail «Аудит» tab when audit_ready=false («Аудит не готов: <status>»).
     */
    fun renderAuditStatusRu(value: String?): String = when (norm(value)) {
        "ready", "audit_ready", "client_facing_ready" -> "готов"
        "draft", "drafting", "in_progress" -> "готовится"
        "needs_review", "qa_review", "waiting_review" -> "на проверке"
        "needs_rework", "rework" -> "требуется доработка"
        "evidence_insufficient", "audit_evidence_insufficient" -> "недостаточно доказательств"
        "not_generated", "missing", "none", "pending" -> "ещё не сформирован"
        "quarantined", "quarantine" -> "карантин"
        "rejected" -> "отклонён"
        else -> if (hasValue(value)) "не готов" else "ещё не сформирован"
    }

    // ---------------------------------------------------------------------
    // Owner-facing follow-up terminology (Phase 7). Internal enum/route/DTO keep "followup".
    // ---------------------------------------------------------------------
    const val FOLLOWUP_TERM = "Повторный контакт"
    const val FOLLOWUP_TERM_ACTION = "подготовить повторное обращение"

    // ---------------------------------------------------------------------
    // Network / transport error → owner-facing message. Raw exception text
    // (connection closed, java.net.*, okhttp3.*, retrofit2.*) is NEVER shown.
    // ---------------------------------------------------------------------
    fun renderNetworkErrorRu(error: Throwable?): String {
        val name = (error?.javaClass?.simpleName ?: "")
        val msg = (error?.message ?: "")
        val hay = "$name $msg".lowercase()
        return when {
            hay.contains("unknownhost") || hay.contains("no address") -> "Нет соединения с сервером"
            hay.contains("sslexception") || hay.contains("ssl") || hay.contains("certificate") || hay.contains("handshake") ->
                "Не удалось установить защищённое соединение"
            hay.contains("sockettimeout") || hay.contains("timeout") || hay.contains("timed out") -> "Время ожидания истекло"
            hay.contains("connectexception") || hay.contains("connection refused") -> "Не удалось подключиться к серверу"
            hay.contains("connection closed") || hay.contains("connection reset") ||
                hay.contains("socketexception") || hay.contains("unexpected end of stream") -> "Нет соединения с сервером"
            hay.contains("502") || hay.contains("503") || hay.contains("504") -> "Сервер временно недоступен"
            else -> "Нет соединения с сервером"
        }
    }

    /** Owner-facing offline banner / empty-state strings. */
    const val OFFLINE_BANNER = "Офлайн-режим: показаны сохранённые данные"
    const val OFFLINE_EMPTY = "Нет соединения и сохранённых данных.\nПодключитесь к интернету и повторите попытку."
    const val OFFLINE_MUTATION_DISABLED = "Действие недоступно без соединения с сервером."

    fun renderCachedAtRu(cachedAt: Long?): String {
        val d = renderDateRu(cachedAt?.let { java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", java.util.Locale.US).format(java.util.Date(it)) })
        return if (d != null) "Данные сохранены ранее. Последнее обновление: $d" else OFFLINE_BANNER
    }

    // ---------------------------------------------------------------------
    // RC4: product display names (canonical product_id → Russian product name).
    // The backend now provides product_name_ru in the offer preview; this is the
    // fallback for screens that only have a product_id.
    // ---------------------------------------------------------------------
    private val PRODUCT_NAME = mapOf(
        "mini_audit" to "Мини-аудит сайта и пути клиента до заявки",
    )

    /** Russian product name. Prefers an explicit server-provided name, then the local map. */
    fun renderProductNameRu(productId: String?, serverNameRu: String? = null): String {
        if (hasValue(serverNameRu)) return serverNameRu!!.trim()
        if (!hasValue(productId)) return "Продукт не указан"
        return PRODUCT_NAME[norm(productId)] ?: (productId!!.trim())
    }

    // ---------------------------------------------------------------------
    // RC4: agent role / profile names (canonical profile code → Russian role).
    // ---------------------------------------------------------------------
    private val AGENT_ROLE = mapOf(
        "chief_orchestrator" to "Оркестратор",
        "lead_intelligence" to "Аналитик лидов",
        "mini_audit" to "Агент мини-аудита",
        "offer" to "Агент предложений",
        "qa_safety" to "Контроль качества и безопасности",
        "qa_and_safety" to "Контроль качества и безопасности",
    )

    fun renderAgentRoleRu(value: String?): String {
        if (!hasValue(value)) return "Агент"
        return AGENT_ROLE[norm(value)] ?: (value!!.trim())
    }

    // ---------------------------------------------------------------------
    // RC4: QA verdicts.
    // ---------------------------------------------------------------------
    fun renderQaVerdictRu(value: String?): String = when (norm(value)) {
        "approved_for_owner_review", "approved" -> "одобрено"
        "needs_rework", "rework" -> "доработка"
        "rejected" -> "отклонено"
        "quarantined", "quarantine" -> "карантин"
        else -> "нет данных"
    }

    // ---------------------------------------------------------------------
    // RC4: API mode (provider transport mode).
    // ---------------------------------------------------------------------
    fun renderApiModeRu(value: String?): String = when (norm(value)) {
        "responses" -> "Responses API"
        "chat", "chat_completions" -> "Chat Completions"
        "completions" -> "Completions"
        "off", "disabled" -> "выключен"
        else -> if (hasValue(value)) value!!.trim() else "нет данных"
    }

    // ---------------------------------------------------------------------
    // RC4: AI cost class + calculated-units formatting.
    // Calculated units are an internal accounting unit, NEVER rubles.
    // ---------------------------------------------------------------------
    /** Money cost: UNKNOWN/null class → «нет данных», never units-as-money. */
    fun renderAiMoneyRu(amount: Double?, cls: String?, currency: String? = "RUB"): String {
        val n = norm(cls)
        if (n == "unknown" || amount == null) return "нет данных"
        return renderMoneyRu(amount, currency, cls)
    }

    /** Group thousands with a thin space; an internal accounting unit, not money. */
    fun formatCalculatedUnits(v: Long?): String {
        if (v == null) return "нет данных"
        return v.toString().reversed().chunked(3).joinToString(" ").reversed()
    }

    fun renderCostClassRu(value: String?): String = when (norm(value)) {
        "free", "no_cost", "zero" -> "бесплатно"
        "low" -> "низкая стоимость"
        "medium", "moderate" -> "средняя стоимость"
        "high" -> "высокая стоимость"
        "paid" -> "платный"
        "unknown" -> "нет данных"
        else -> if (hasValue(value)) value!!.trim() else "нет данных"
    }

    // ---------------------------------------------------------------------
    // RC4: provider registry state + key presence.
    // ---------------------------------------------------------------------
    fun renderProviderStateRu(value: String?): String = when (norm(value)) {
        "active", "enabled", "ready" -> "активен"
        "standby", "idle" -> "в резерве"
        "disabled", "off" -> "отключён"
        "quarantined" -> "карантин"
        "error", "failed" -> "ошибка"
        "no_key", "keyless" -> "нет ключа"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    fun renderKeyPresenceRu(value: String?): String = when (norm(value)) {
        "present", "configured", "true", "yes" -> "ключ настроен"
        "absent", "missing", "false", "no", "none" -> "ключ не предоставлен"
        else -> "нет данных"
    }

    // ---------------------------------------------------------------------
    // RC4: source enabled/credential/capability states (authoritative /sources).
    // ---------------------------------------------------------------------
    fun renderSourceEnabledRu(enabled: Boolean?): String = when (enabled) {
        true -> "включён"
        false -> "отключён"
        null -> "нет данных"
    }

    fun renderCredentialStateRu(value: String?): String = when (norm(value)) {
        "present", "configured", "ok", "valid" -> "доступ настроен"
        "missing", "absent", "none", "required" -> "нужны учётные данные"
        "invalid", "expired" -> "учётные данные недействительны"
        "not_required", "keyless", "public" -> "не требуется"
        else -> "нет данных"
    }

    fun renderCapabilityRu(value: String?): String = when (norm(value)) {
        "inbound" -> "приём входящих"
        "outbound" -> "исходящие"
        "discovery" -> "поиск лидов"
        "enrichment" -> "обогащение данных"
        "verification" -> "проверка"
        else -> if (hasValue(value)) value!!.trim() else "нет данных"
    }

    // ---------------------------------------------------------------------
    // RC4: knowledge radar — urgency / route / category / trust / window.
    // ---------------------------------------------------------------------
    fun renderUrgencyRu(value: String?): String = when (norm(value)) {
        "critical", "urgent" -> "срочно"
        "high" -> "высокий приоритет"
        "medium", "normal" -> "средний приоритет"
        "low" -> "низкий приоритет"
        "info", "informational" -> "к сведению"
        else -> "нет данных"
    }

    fun renderKnowledgeRouteRu(value: String?): String = when (norm(value)) {
        "owner_review", "owner" -> "на проверку владельцем"
        "legal_review", "legal" -> "на юридическую проверку"
        "security_review", "security" -> "на проверку безопасности"
        "auto_file", "archive" -> "в архив"
        "ignore", "discard" -> "не относится"
        "research", "investigate" -> "требует изучения"
        "monitor", "watch" -> "наблюдение"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    fun renderKnowledgeCategoryRu(value: String?): String = when (norm(value)) {
        "legal", "regulation", "compliance" -> "Право и регулирование"
        "security", "vulnerability" -> "Безопасность"
        "tax", "finance", "accounting" -> "Налоги и финансы"
        "tech", "technology", "platform" -> "Технологии"
        "market", "competitor", "competition" -> "Рынок и конкуренты"
        "ai", "ai_models", "llm" -> "ИИ и модели"
        "product" -> "Продукт"
        "process", "operations" -> "Процессы"
        else -> if (hasValue(value)) value!!.trim() else "Прочее"
    }

    fun renderTrustRu(value: String?): String = when (norm(value)) {
        "high", "verified", "official" -> "высокое доверие"
        "medium", "moderate" -> "среднее доверие"
        "low", "unverified" -> "низкое доверие"
        else -> "нет данных"
    }

    /** Source tier (1..4) → owner-facing label. Tier 1 = самые надёжные. */
    fun renderSourceTierRu(tier: Int?): String = when (tier) {
        1 -> "уровень 1 (официальные)"
        2 -> "уровень 2 (профильные)"
        3 -> "уровень 3 (отраслевые)"
        4 -> "уровень 4 (прочие)"
        else -> "нет данных"
    }

    fun renderKnowledgeWindowRu(value: String?): String = when (norm(value)) {
        "urgent" -> "Срочное"
        "weekly" -> "Недельная сводка"
        "monthly" -> "Месячный обзор"
        else -> "Сводка"
    }

    fun renderImpactRu(value: String?): String = when (norm(value)) {
        "high", "critical" -> "высокое влияние"
        "medium", "moderate" -> "среднее влияние"
        "low" -> "низкое влияние"
        "none", "no" -> "нет влияния"
        else -> "нет данных"
    }

    /** Owner-facing "no automatic actions" guarantee for the knowledge radar. */
    const val KNOWLEDGE_NO_AUTO = "Автоматические действия: нет"

    /**
     * RC6 (defect C): radar status endpoint freshness — LIVE means the response came straight from
     * the radar service; CACHE means a server-side cached snapshot. Distinct from the app's own
     * offline cache banner.
     */
    fun renderRadarEndpointRu(value: String?): String = when (norm(value)) {
        "live" -> "вживую (LIVE)"
        "cache", "cached" -> "из кэша сервера (CACHE)"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    /** True when radar data is served from a server-side cache (CACHE), not live. */
    fun isRadarCache(value: String?): Boolean = norm(value).let { it == "cache" || it == "cached" }

    /**
     * RC6 (defect C): radar-specific error message. A radar-only outage must NOT read as a global
     * «нет соединения». This wording scopes the failure to the radar so the rest of the app is not
     * implied to be offline.
     */
    fun renderRadarErrorRu(code: String?): String = when (norm(code)) {
        "unauthorized" -> "Подключение устройства больше недействительно. Переподключите устройство."
        "network", "timeout", "unavailable" -> "Радар знаний временно недоступен. Остальные разделы работают. Показаны сохранённые данные радара, если они есть."
        "not_found" -> "Радар знаний не настроен на сервере."
        else -> "Не удалось получить состояние радара. Попробуйте обновить."
    }

    /**
     * RC6 (defect C): human-readable «возраст данных» from an ISO timestamp relative to now.
     * Returns null when the timestamp is absent/unparsable so the caller can hide the row.
     */
    fun renderDataAgeRu(iso: String?, nowMillis: Long = System.currentTimeMillis()): String? {
        if (!hasValue(iso)) return null
        val m = Regex("""^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?""").find(iso!!.trim()) ?: return null
        val (y, mo, d, h, mi) = m.destructured
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(y.toInt(), mo.toInt() - 1, d.toInt(), h.toInt(), mi.toInt(), 0)
        val then = cal.timeInMillis
        val diff = nowMillis - then
        if (diff < 0) return "только что"
        val mins = diff / 60000
        return when {
            mins < 1 -> "только что"
            mins < 60 -> "$mins мин назад"
            mins < 1440 -> "${mins / 60} ч назад"
            else -> "${mins / 1440} дн назад"
        }
    }

    // ---------------------------------------------------------------------
    // RC4: offer preview — missing field reason.
    // ---------------------------------------------------------------------
    fun renderMissingFieldReasonRu(reason: String?): String {
        if (!hasValue(reason)) return "нет данных"
        return "нет данных: ${reason!!.trim()}"
    }

    /**
     * RC5: owner-facing "next step" line with provenance. When the step is present it is shown with
     * its source label and computed time; when absent the backend's missing_fields reason is used,
     * else a neutral placeholder. The raw missing_fields key lives here, not in a screen literal.
     */
    fun renderNextStepRu(step: String?, source: String?, createdAt: String?, missingFields: Map<String, String>): String {
        if (hasValue(step)) {
            return buildString {
                append(step!!.trim())
                if (hasValue(source)) append(" · источник: ${source!!.trim()}")
                renderDateRu(createdAt)?.let { append(" · $it") }
            }
        }
        val reason = missingFields["next_step"]
        return if (hasValue(reason)) renderMissingFieldReasonRu(reason) else "следующий шаг не указан"
    }

    // ---------------------------------------------------------------------
    // Locale-aware date formatting (does NOT mutate the source timestamp).
    // Accepts an ISO-8601 instant; returns a Russian short form, or the trimmed
    // input if it can't be parsed (never null/"—").
    // ---------------------------------------------------------------------
    private val RU_MONTHS = listOf(
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    )

    fun renderDateRu(iso: String?): String? {
        if (!hasValue(iso)) return null
        val s = iso!!.trim()
        // Parse YYYY-MM-DDтHH:MM without pulling in java.time formatting locale data.
        val m = Regex("""^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})""").find(s)
            ?: return s.replace("T", " ").take(16)
        val (y, mo, d, h, mi) = m.destructured
        val monthIdx = (mo.toIntOrNull() ?: 1).coerceIn(1, 12) - 1
        val day = d.toIntOrNull() ?: 1
        return "$day ${RU_MONTHS[monthIdx]} $y, $h:$mi"
    }

    // =====================================================================
    // RC5 — owner-facing localization for the new RC5 read models.
    // =====================================================================

    // ---------------------------------------------------------------------
    // RC5: source telemetry health_state. Raw codes never reach the UI.
    // ---------------------------------------------------------------------
    fun renderHealthStateRu(value: String?): String = when (norm(value)) {
        "healthy", "ok" -> "работает"
        "idle", "never_run" -> "ещё не запускался"
        "disabled", "off" -> "отключён"
        "credential_required", "needs_credentials", "no_key" -> "нужен ключ"
        "degraded" -> "работает с ограничениями"
        "failing", "error", "down" -> "ошибка"
        "paused" -> "приостановлен"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    fun renderLastErrorCategoryRu(value: String?): String = when (norm(value)) {
        "auth", "unauthorized", "credential" -> "ошибка доступа"
        "timeout" -> "превышено время ожидания"
        "rate_limited", "quota" -> "превышен лимит запросов"
        "network", "connection" -> "ошибка соединения"
        "parse", "format" -> "ошибка формата данных"
        "server", "upstream" -> "ошибка на стороне источника"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    /** FREE → «бесплатный», PAID → «платный» (telemetry cost class binary form). */
    fun renderCostClassBinaryRu(value: String?): String = when (norm(value)) {
        "free", "no_cost", "zero" -> "бесплатный"
        "paid", "premium" -> "платный"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    /**
     * A counter value that must be a real number OR explicit «нет данных». RC5 rule: never show a
     * false 0 for a source that is disabled / has never run — only show 0 when the backend really
     * reports a numeric value. `disabled` suppresses a misleading 0.
     */
    fun renderCounterRu(value: Long?, disabled: Boolean = false): String = when {
        value != null -> formatCalculatedUnits(value)
        disabled -> "—"
        else -> "нет данных"
    }

    // ---------------------------------------------------------------------
    // RC5: AI usage provenance. raw tokens may be a number OR the string "UNKNOWN".
    // "UNKNOWN" → «неизвестно». Null → «нет данных». Number → grouped value. NEVER a false 0.
    // ---------------------------------------------------------------------
    fun renderRawTokensRu(value: String?): String {
        if (value == null) return "нет данных"
        val t = value.trim()
        if (t.isEmpty()) return "нет данных"
        if (t.equals("UNKNOWN", ignoreCase = true)) return "неизвестно"
        val n = t.toLongOrNull() ?: return t // unparsable string → show as-is, never coerce to 0
        return formatCalculatedUnits(n)
    }

    /** by_source units key → owner-facing label. */
    fun renderUsageSourceRu(value: String?): String = when (norm(value)) {
        "actual_provider_response" -> "фактический ответ провайдера"
        "estimated" -> "оценка"
        "confirmed_historical_evidence" -> "подтверждённая история"
        "synthetic_test" -> "служебные данные"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }

    /**
     * by_source breakdown as localized (label → value) pairs. Built here so the screen never holds
     * the raw SCREAMING_SNAKE keys (owner-UI safety). Order is stable and meaningful.
     */
    fun usageBySourceLines(bs: ru.dmitry.matercontroller.core.model.AiUsageBySourceUnits?): List<Pair<String, Long?>> {
        if (bs == null) return emptyList()
        return listOf(
            renderUsageSourceRu("actual_provider_response") to bs.ACTUAL_PROVIDER_RESPONSE,
            renderUsageSourceRu("estimated") to bs.ESTIMATED,
            renderUsageSourceRu("confirmed_historical_evidence") to bs.CONFIRMED_HISTORICAL_EVIDENCE,
            renderUsageSourceRu("synthetic_test") to bs.SYNTHETIC_TEST,
        )
    }

    // ---------------------------------------------------------------------
    // RC5: knowledge radar verification badge. Internal-only data must be explicitly visible.
    // ---------------------------------------------------------------------
    fun renderVerificationRu(value: String?): String = when (norm(value)) {
        "verified" -> "проверено"
        "test_only" -> "служебное"
        "synthetic" -> "примерные данные"
        "unverified" -> "не проверено"
        else -> "нет данных"
    }

    /** True only for VERIFIED — used to colour the badge as trustworthy. */
    fun isVerified(value: String?): Boolean = norm(value) == "verified"

    /** True when the finding is internal-only/synthetic (badge must warn). */
    fun isTestOnly(value: String?): Boolean = norm(value).let { it == "test_only" || it == "synthetic" }

    fun renderApplicabilityRu(value: String?): String = when (norm(value)) {
        "applicable", "affected" -> "применимо к вашему стеку"
        "not_applicable", "unaffected" -> "не относится к вашему стеку"
        "partial" -> "частично применимо"
        "unknown" -> "применимость не определена"
        else -> if (hasValue(value)) "нет данных" else "применимость не определена"
    }

    fun renderStackMatchRu(value: String?): String? {
        if (!hasValue(value)) return null
        return when (norm(value)) {
            "match", "matched", "true", "yes" -> "совпадает с вашим стеком"
            "no_match", "false", "no" -> "не совпадает с вашим стеком"
            "partial" -> "частичное совпадение"
            else -> value!!.trim()
        }
    }

    // ---------------------------------------------------------------------
    // RC5: owner settings — profile names, source strategy, validation errors.
    // ---------------------------------------------------------------------
    fun renderProfileRu(value: String?): String = when (norm(value)) {
        "economy", "economical", "frugal" -> "Экономный"
        "balanced", "default" -> "Сбалансированный"
        "active", "aggressive" -> "Активный"
        "custom", "manual" -> "Пользовательский"
        else -> if (hasValue(value)) value!!.trim() else "Сбалансированный"
    }

    /** Wire profile code for a given UI index/label (kept out of UI literals). */
    fun renderSourceStrategyRu(value: String?): String = when (norm(value)) {
        "free_only" -> "Только бесплатные"
        "free_with_paid_reserve", "free_then_paid" -> "Бесплатные с платным резервом"
        "all_allowed", "all" -> "Все разрешённые"
        else -> if (hasValue(value)) "нет данных" else "Только бесплатные"
    }

    /** owner settings validation error code → owner-facing message. */
    fun renderSettingsErrorRu(code: String?, field: String? = null, limit: Double? = null): String {
        val limitTxt = limit?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }
        return when (norm(code)) {
            "exceeds_hard_limit" -> "Превышен жёсткий лимит" + (limitTxt?.let { " (максимум $it)" } ?: "")
            "paid_source_requires_confirmation" -> "Для платных источников требуется подтверждение, и сейчас нет настроенных учётных данных"
            "validation", "invalid" -> "Недопустимое значение"
            else -> "Проверьте значение"
        }
    }

    /** owner-facing field labels for the settings diff/forms (no raw snake_case in UI). */
    fun renderSettingsFieldRu(field: String?): String = when (norm(field)) {
        "discovery_runs_per_day" -> "Запусков поиска в день"
        "raw_candidates_per_day" -> "Сырых кандидатов в день"
        "verified_leads_per_day" -> "Проверенных лидов в день"
        "sites_checked_per_day" -> "Проверок сайтов в день"
        "same_segment_rescan_days" -> "Повторный обход сегмента (дней)"
        "owner_queue_max" -> "Максимум в очереди владельца"
        "audit_ready_queue_max" -> "Максимум готовых аудитов в очереди"
        "ai_audits_per_day" -> "ИИ-аудитов в день"
        "offers_per_day" -> "Предложений в день"
        "daily_calculated_units_limit" -> "Дневной лимит расчётных единиц"
        "premium_calls_per_day" -> "Премиальных вызовов в день"
        "repair_attempts" -> "Попыток восстановления"
        "fallback_attempts" -> "Резервных попыток"
        "provider_concurrency" -> "Параллельность провайдера"
        "source_strategy" -> "Стратегия источников"
        "profile" -> "Профиль"
        "morning_discovery_time" -> "Утренний запуск"
        "evening_discovery_time" -> "Вечерний запуск"
        "processing_window" -> "Окно обработки"
        "timezone" -> "Часовой пояс"
        "confirm_paid_sources" -> "Подтверждение платных источников"
        else -> if (hasValue(field)) field!!.trim() else "Параметр"
    }

    /** True when the timezone is unknown — caller must warn and NOT assume UTC. */
    fun isTimezoneUnknown(value: String?): Boolean {
        if (!hasValue(value)) return true
        return norm(value) == "timezone_unknown" || norm(value) == "unknown"
    }

    const val TIMEZONE_UNKNOWN_WARNING = "Часовой пояс не определён. Время указано как есть — не предполагается UTC."

    /**
     * RC6 (defect F): owner-facing timezone label. The backend now reports a real IANA zone
     * (e.g. "Europe/Moscow"). Known zones get a readable Russian label; an unknown zone is handled
     * by [isTimezoneUnknown] + [TIMEZONE_UNKNOWN_WARNING] (UTC is never assumed).
     */
    fun renderTimezoneRu(value: String?): String = when (norm(value)) {
        "europe_moscow", "europe/moscow" -> "Europe/Moscow (МСК, UTC+3)"
        else -> if (hasValue(value)) value!!.trim() else "нет данных"
    }

    /** Short timezone suffix appended to schedule times (e.g. «08:00 (МСК)»). */
    private fun timezoneSuffix(tz: String?): String = when (norm(tz)) {
        "europe_moscow", "europe/moscow" -> "МСК"
        else -> if (hasValue(tz) && !isTimezoneUnknown(tz)) tz!!.trim() else ""
    }

    /**
     * RC6 (defect F): render a schedule time/window in the owner's timezone, never assuming UTC.
     * When the zone is known the local label is appended (e.g. «08:00 (МСК)»); when unknown the time
     * is shown as-is (the screen also shows [TIMEZONE_UNKNOWN_WARNING]). The raw value is never mutated.
     */
    fun renderScheduleTimeRu(time: String?, tz: String?): String {
        if (!hasValue(time)) return "нет данных"
        val t = time!!.trim()
        val sfx = timezoneSuffix(tz)
        return if (sfx.isEmpty()) t else "$t ($sfx)"
    }

    // ---------------------------------------------------------------------
    // RC5: reservoir / funnel labels.
    // ---------------------------------------------------------------------
    fun renderReservoirStateRu(value: String?): String = when (norm(value)) {
        "raw", "discovered" -> "сырые"
        "technically_alive", "alive" -> "технически живые"
        "business_identified", "identified" -> "определён бизнес"
        "contact_verified", "verified" -> "контакт подтверждён"
        "audit_candidate", "audit_candidates" -> "кандидаты на аудит"
        "audit_ready" -> "готовы к аудиту"
        "promoted", "canonical", "promoted_to_canonical" -> "переведены в основную базу"
        "rejected" -> "отклонены"
        "queued", "pending" -> "в очереди"
        else -> if (hasValue(value)) value!!.trim() else "нет данных"
    }

    /** common_crawl_mode internal-only mode must be explicitly visible. */
    fun renderCrawlModeRu(value: String?): String = when (norm(value)) {
        "test_only" -> "служебный"
        "live", "production" -> "рабочий"
        "disabled", "off" -> "отключён"
        else -> if (hasValue(value)) "нет данных" else "нет данных"
    }
}
