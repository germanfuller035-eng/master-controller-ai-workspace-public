package ru.dmitry.matercontroller.feature.commercial

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.model.OfferDto
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.ApprovalRiskCard
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips

/**
 * «Ожидают отправки (проверка)» — список реальных предложений к проверке отправки (без отправки).
 * Открывается из карточки очереди. Каждая карточка ведёт на детальный экран предложения.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfferReviewListScreen(
    onBack: () -> Unit,
    onOpenOffer: (String) -> Unit,
    vm: OfferReviewViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Ожидают отправки (проверка)") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.commercial.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.commercial.control.refresh")) { Text("Обновить") } },
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().testTag("offer_review_list")) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Предложения на проверку", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_proposals"))
                Text("Очередь черновиков и решений владельца. Ничего не отправляется из этого экрана.", style = MaterialTheme.typography.bodySmall)
                PilotSafetyChips(tag = "pilot_proposals_safety_chips")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = true, onClick = {}, label = { Text("все") })
                    FilterChip(selected = false, onClick = {}, label = { Text("нужно решение") })
                    FilterChip(selected = false, onClick = {}, label = { Text("черновики") })
                }
            }
            when {
                ui.loading -> LoadingState()
                ui.error != null && ui.offers.isEmpty() -> ErrorState(ui.error!!, onRetry = vm::refresh)
                ui.offers.isEmpty() -> EmptyState(
                    message = "Нет предложений к проверке",
                    nextAction = "Нажмите «Обновить» или подготовьте черновик в ручном контуре продаж.",
                )
                else -> LazyColumn(Modifier.fillMaxSize().padding(8.dp)) {
                    items(ui.offers, key = { it.offer_id }) { offer ->
                        OfferRow(offer, onClick = { onOpenOffer(offer.offer_id) })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OfferRow(offer: OfferDto, onClick: () -> Unit) {
    val title = OwnerLocalization.companyFromLeadId(offer.lead_id) ?: offer.lead_id ?: offer.offer_id
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp, horizontal = 4.dp).testTag("offer_row_${offer.offer_id}"),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(2.dp))
            Text("Статус: ${OwnerLocalization.renderOfferStatusRu(offer.status)}", style = MaterialTheme.typography.bodySmall)
            Text(
                "Цена: ${OwnerLocalization.renderMoneyRu(offer.price_snapshot, offer.currency, "TARGET")}",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(2.dp))
            Text("Нажмите, чтобы открыть предложение", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

/**
 * Детальный просмотр предложения. Показывает компанию, продукт, цену, статус, уверенность контакта,
 * сводку условий и QA-вердикт. Действия владельца строго без отправки сообщений: каждое меняет только
 * внутренний статус через backend-команду offers/{id}/decision. Success показывается ТОЛЬКО после
 * подтверждённого ответа сервера и повторного чтения предложения. OPEN_PREVIEW открывает реальный
 * предпросмотр письма.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfferDetailScreen(
    offerId: String,
    onBack: () -> Unit,
    vm: OfferDetailViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(offerId) { vm.load(offerId) }
    var pendingAction by remember { mutableStateOf<OfferReviewAction?>(null) }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Предложение") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.commercial.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = { vm.load(offerId) }) { Text("Обновить") } },
        )
    }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null && ui.offer == null -> ErrorState(ui.error!!, onRetry = { vm.load(offerId) }, modifier = Modifier.padding(pad))
            ui.offer == null -> EmptyState("Предложение не найдено", Modifier.padding(pad))
            else -> {
                val o = ui.offer!!
                Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("offer_detail_${o.offer_id}")) {
                    if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                    val company = OwnerLocalization.companyFromLeadId(o.lead_id) ?: o.lead_id ?: o.offer_id
                    Text(company, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.testTag("pilot_offer_detail"))
                    Text("Детали предложения: черновик решения, не отправка клиенту.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(8.dp))
                    PilotSafetyChips(tag = "pilot_offer_detail_safety_chips")
                    Spacer(Modifier.height(8.dp))
                    DetailLine("Продукт", OwnerLocalization.renderProductNameRu(o.product_id))
                    DetailLine("Цена", OwnerLocalization.renderMoneyRu(o.price_snapshot, o.currency, "TARGET"))
                    DetailLine("Статус предложения", OwnerLocalization.renderOfferStatusRu(o.status))
                    DetailLine("Уверенность контакта", OwnerLocalization.renderConfidenceRu(o.confidence))
                    DetailLine("Решение владельца", OwnerLocalization.renderOfferDecisionRu(o.owner_decision))
                    DetailLine("Возможность отправки", OwnerLocalization.renderSendCapabilityRu(o.send_capability))
                    if (OwnerLocalization.hasValue(o.scope_snapshot)) {
                        Spacer(Modifier.height(8.dp))
                        Text("Состав предложения", style = MaterialTheme.typography.titleSmall)
                        Text(o.scope_snapshot!!, style = MaterialTheme.typography.bodySmall)
                    }
                    if (o.acceptance_snapshot.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text("Критерии приёмки", style = MaterialTheme.typography.titleSmall)
                        o.acceptance_snapshot.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }

                    // ---- submit outcome (success / error / conflict), shown ONLY after a confirmed response ----
                    ui.submitMessage?.let { msg ->
                        Spacer(Modifier.height(12.dp))
                        val container = when (ui.submitState) {
                            SubmitState.SUCCESS -> MaterialTheme.colorScheme.secondaryContainer
                            SubmitState.CONFLICT -> MaterialTheme.colorScheme.tertiaryContainer
                            else -> MaterialTheme.colorScheme.errorContainer
                        }
                        Surface(color = container, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().testTag("offer_submit_outcome")) {
                            Row(Modifier.padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text(msg, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                TextButton(onClick = vm::clearSubmitOutcome) { Text("Скрыть") }
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    ApprovalRiskCard(
                        title = "Решение по предложению",
                        riskLevel = "R4",
                        riskLabel = "коммерческий статус",
                        whatChanges = "сервер сохранит решение по предложению после подтверждения",
                        whatDoesNotHappen = "сообщение клиенту не отправляется, счёт и платёж не создаются",
                        nextStep = "сначала откройте предпросмотр и проверьте текст, цену и блокировки",
                        tag = "offer_detail_risk",
                    )
                    Text("Действия (без отправки)", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(4.dp))
                    if (ui.offline) {
                        Text(OwnerLocalization.OFFLINE_MUTATION_DISABLED, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }

                    val submitting = ui.submitState == SubmitState.SUBMITTING
                    // State-machine gating computed in the ViewModel (no raw status literal in UI):
                    // approve/changes/reject only while awaiting send-review; restore only when
                    // rejected / changes-requested.
                    val canDecide = ui.canDecideReview
                    val canRestore = ui.canRestore

                    // Preview is always available (read-only, never sends).
                    OutlinedButton(
                        onClick = { vm.loadPreview(offerId) },
                        enabled = !submitting,
                        modifier = Modifier.fillMaxWidth().testTag("offer_act_preview"),
                    ) { Text("Открыть предпросмотр") }

                    DecisionButton("Одобрить только текст", tag = "offer_act_approve", enabled = canDecide) { pendingAction = OfferReviewAction.APPROVE_TEXT_ONLY }
                    DecisionButton("Запросить правки", tag = "offer_act_changes", enabled = canDecide) { pendingAction = OfferReviewAction.REQUEST_CHANGES }
                    DecisionButton("Отклонить черновик", tag = "offer_act_reject", enabled = canDecide) { pendingAction = OfferReviewAction.REJECT_DRAFT }
                    DecisionButton("Вернуть на проверку", tag = "offer_act_restore", enabled = canRestore) { pendingAction = OfferReviewAction.RESTORE_TO_REVIEW }

                    if (submitting) {
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("Отправляем команду…", style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    // ---- action history (previous → new state) ----
                    if (ui.history.isNotEmpty()) {
                        Spacer(Modifier.height(16.dp))
                        Text("История действий", style = MaterialTheme.typography.titleSmall)
                        ui.history.asReversed().forEach { h ->
                            Text(
                                "• ${h.actionLabel}: ${h.result} (${h.previousStatus ?: "—"} → ${h.newStatus ?: "—"})",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Отправка сообщений отключена. «Одобрить только текст» фиксирует одобрение текста и не отправляет сообщение клиенту.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }

    // Confirmation dialog BEFORE sending the command. Confirm actually executes submitDecision.
    pendingAction?.let { action ->
        val o = ui.offer
        AlertDialog(
            onDismissRequest = { pendingAction = null },
            title = { Text(OwnerLocalization.renderOfferActionTitleRu(action.code)) },
            text = {
                Column {
                    Text("Текущий статус: ${OwnerLocalization.renderOfferStatusRu(o?.status)}", style = MaterialTheme.typography.bodyMedium)
                    Text("Новый статус: ${OwnerLocalization.renderOfferActionTargetStatusRu(action.code)}", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(OwnerLocalization.renderOfferActionEffectRu(action.code), style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(6.dp))
                    Text(OwnerLocalization.OFFER_NO_SEND_NOTE, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.submitDecision(offerId, action)
                        pendingAction = null
                    },
                    modifier = Modifier.testTag("offer_action_confirm"),
                ) { Text("Подтвердить") }
            },
            dismissButton = { TextButton(onClick = { pendingAction = null }) { Text("Отмена") } },
        )
    }

    // Real preview dialog (read-only email preview for the offer's lead).
    if (ui.previewState != PreviewState.IDLE) {
        OfferPreviewDialog(ui = ui, offer = ui.offer, onDismiss = vm::clearPreview)
    }
}

@Composable
private fun DecisionButton(label: String, tag: String, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().testTag(tag)) { Text(label) }
}

/**
 * Authoritative read-only preview of the offer (GET /offers/{id}/preview). Shows ALL backend
 * fields; missing ones render as explicit «нет данных» / «нет данных: <reason>» — никогда не
 * выдумывает значения. Blockers are shown exactly as the backend returns them. Reiterates the
 * без отправки guarantee.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OfferPreviewDialog(ui: OfferDetailUi, offer: OfferDto?, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.testTag("offer_preview_close")) { Text("Закрыть") } },
        title = { Text("Предпросмотр предложения") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).testTag("offer_preview")) {
                when (ui.previewState) {
                    PreviewState.LOADING -> LoadingState()
                    PreviewState.ERROR -> Text(ui.previewError ?: "Не удалось загрузить предпросмотр", color = MaterialTheme.colorScheme.error)
                    else -> {
                        val p = ui.preview
                        val company = OwnerLocalization.companyFromLeadId(p?.lead_id ?: offer?.lead_id)
                            ?: p?.company ?: p?.lead_id ?: offer?.lead_id
                        PreviewLine("Компания", company)
                        PreviewLine("ID лида", p?.lead_id ?: offer?.lead_id)
                        PreviewLine("ID предложения", p?.offer_id ?: offer?.offer_id)
                        PreviewLine("Продукт", OwnerLocalization.renderProductNameRu(p?.product_id ?: offer?.product_id, p?.product_name_ru))
                        PreviewLine("Версия продукта", p?.product_version)
                        PreviewLine("Цена", OwnerLocalization.renderMoneyRu(p?.price ?: offer?.price_snapshot, p?.currency ?: offer?.currency, "TARGET"))
                        PreviewLine("Канал", p?.channel)
                        val recipient = buildString {
                            append(if (OwnerLocalization.hasValue(p?.recipient)) p!!.recipient!! else "нет данных")
                            if (p?.recipient_verified == true) append(" · подтверждён")
                            else if (p?.recipient_verified == false) append(" · не подтверждён")
                        }
                        PreviewLine("Получатель", recipient)
                        PreviewLine("Тема", p?.subject)

                        Spacer(Modifier.height(6.dp))
                        Text("Текст сообщения", style = MaterialTheme.typography.titleSmall)
                        Text(
                            if (OwnerLocalization.hasValue(p?.body_text)) p!!.body_text!! else "нет данных",
                            style = MaterialTheme.typography.bodySmall,
                        )

                        Spacer(Modifier.height(6.dp))
                        Text("Основные выводы", style = MaterialTheme.typography.titleSmall)
                        if (p?.findings?.isNotEmpty() == true) {
                            p.findings.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                            p.finding_count?.let { Text("Всего выводов: $it", style = MaterialTheme.typography.labelSmall) }
                        } else {
                            Text("нет данных", style = MaterialTheme.typography.bodySmall)
                        }

                        // RC5: next step with provenance. When absent, prefer the backend's
                        // missing_fields reason over a generic placeholder; never invent a step.
                        PreviewLine(
                            "Следующий шаг",
                            OwnerLocalization.renderNextStepRu(p?.next_step, p?.next_step_source, p?.next_step_created_at, p?.missing_fields ?: emptyMap()),
                        )

                        Spacer(Modifier.height(6.dp))
                        Text("Вложения", style = MaterialTheme.typography.titleSmall)
                        if (p?.attachments?.isNotEmpty() == true) {
                            p.attachments.forEach { a ->
                                Text("• ${a.name ?: "вложение"}", style = MaterialTheme.typography.bodySmall)
                            }
                        } else {
                            Text(if (OwnerLocalization.hasValue(p?.attachments_note)) p!!.attachments_note!! else "нет вложений", style = MaterialTheme.typography.bodySmall)
                        }

                        Spacer(Modifier.height(6.dp))
                        PreviewLine("Создано", OwnerLocalization.renderDateRu(p?.version_created_at) ?: "нет данных")
                        PreviewLine("Обновлено", OwnerLocalization.renderDateRu(p?.version_updated_at) ?: "нет данных")
                        PreviewLine("Контент-хэш", p?.content_hash)
                        PreviewLine("Статус предложения", OwnerLocalization.renderOfferStatusRu(p?.status ?: offer?.status))
                        PreviewLine("Решение владельца", OwnerLocalization.renderOfferDecisionRu(p?.owner_decision ?: offer?.owner_decision))
                        PreviewLine("Возможность отправки", OwnerLocalization.renderSendCapabilityRu(p?.send_capability ?: offer?.send_capability))

                        // Blockers shown EXACTLY as backend returns (no ALREADY_AWAITING_REPLY injected).
                        Spacer(Modifier.height(6.dp))
                        Text("Блокировки", style = MaterialTheme.typography.titleSmall)
                        if (p?.blockers?.isNotEmpty() == true) {
                            OwnerLocalization.renderBlockerLinesRu(p.blockers, p.status).let { lines ->
                                if (lines.isNotEmpty()) lines.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                                else Text("отсутствуют", style = MaterialTheme.typography.bodySmall)
                            }
                        } else {
                            Text("отсутствуют", style = MaterialTheme.typography.bodySmall)
                        }

                        // Missing fields → explicit reason, never invented.
                        if (p?.missing_fields?.isNotEmpty() == true) {
                            Spacer(Modifier.height(6.dp))
                            Text("Отсутствующие данные", style = MaterialTheme.typography.titleSmall)
                            p.missing_fields.forEach { (field, reason) ->
                                Text("• $field — ${OwnerLocalization.renderMissingFieldReasonRu(reason)}", style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (OwnerLocalization.hasValue(p?.no_send_notice)) p!!.no_send_notice!! else OwnerLocalization.OFFER_NO_SEND_NOTE,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        },
    )
}

@Composable
private fun PreviewLine(label: String, value: String?, fallback: String = "нет данных") {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text("$label: ", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
        Text(if (OwnerLocalization.hasValue(value)) value!! else fallback, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text("$label: ", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
