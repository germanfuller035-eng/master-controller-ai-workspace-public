package ru.dmitry.matercontroller.feature.firsttouch

import androidx.compose.foundation.layout.*
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
import ru.dmitry.matercontroller.core.model.FirstTouchCandidateRow
import ru.dmitry.matercontroller.core.ui.EmptyState
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.ui.SectionCard

/**
 * «Первое касание» — read-only. Summary + candidates + recommended pilot + per-candidate detail.
 * No send button anywhere; the controlled send gate is shown as disabled.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FirstTouchScreen(onBack: () -> Unit, vm: FirstTouchViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Первое касание") },
            navigationIcon = { IconButton(onClick = onBack, modifier = Modifier.testTag("screen.firsttouch.control.back")) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            actions = { TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.firsttouch.control.refresh")) { Text("Обновить") } },
        )
    }) { pad ->
        when {
            ui.loading -> Box(Modifier.padding(pad).fillMaxSize().testTag("first_touch")) {
                LoadingState()
            }
            ui.error != null && ui.summary == null -> Box(Modifier.padding(pad).fillMaxSize().testTag("first_touch")) {
                ErrorState(ui.error!!, onRetry = vm::refresh)
            }
            else -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("first_touch")) {
                if (ui.offline) { OfflineBanner(ui.cachedAt); Spacer(Modifier.height(8.dp)) }
                Text("Первое касание", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_first_touch"))
                Text("Черновик первого сообщения для ручного контура. Сохранение здесь не отправляет клиенту сообщение.", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                PilotSafetyChips(tag = "pilot_first_touch_safety_chips")
                Spacer(Modifier.height(8.dp))
                SectionCard("Проблема", subtitle = "ручной процесс / потеря времени / нет прозрачности", tag = "pilot_first_touch_problem")
                SectionCard("Ценность предложения", subtitle = "Сократить ручную обработку и сделать следующий шаг видимым", tag = "pilot_first_touch_value")
                SectionCard("Черновик первого сообщения", subtitle = "Короткий текст без обещаний, окупаемость только как предположение.", tag = "pilot_first_touch_draft")
                Button(enabled = false, onClick = {}, modifier = Modifier.fillMaxWidth().testTag("pilot_first_touch_save")) { Text("Сохранить черновик") }
                Text("Символов в черновике: ручной режим · не отправлено", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(12.dp))
                ui.summary?.let { s ->
                    Text("Подбор лида", style = MaterialTheme.typography.titleMedium)
                    SectionCard("Лидов проверено", trailing = s.leadsScored.toString(), tag = "ft_scored")
                    SectionCard("Подходят для ручного контура", trailing = s.pilotEligible.toString(), tag = "ft_eligible")
                    SectionCard("Рекомендованный лид", subtitle = s.recommendedPilot ?: "—", tag = "ft_pilot")
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Отправка отключена. Сообщение клиенту не отправляется. " +
                            "Шлюз отправки: ${ruGate(s.controlledSendGate)}.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(12.dp))
                }
                ui.candidates?.let { c ->
                    Text("Кандидаты (топ-5)", style = MaterialTheme.typography.titleMedium)
                    if (c.top5.isEmpty()) EmptyState("Нет подходящих кандидатов")
                    c.top5.forEach { row -> CandidateCard(row) { vm.openCandidate(row.leadId) } }
                    if (c.blocked.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        Text("Заблокированы для ручного контура", style = MaterialTheme.typography.titleMedium)
                        c.blocked.forEach { b ->
                            SectionCard(
                                b.company ?: b.leadId,
                                subtitle = b.blockedReasons.joinToString(", ") { ruBlock(it) },
                                tag = "ft_blocked_${b.leadId}",
                            )
                        }
                    }
                }
            }
        }
    }

    ui.selected?.let { art ->
        AlertDialog(
            onDismissRequest = vm::closeCandidate,
            confirmButton = { TextButton(onClick = vm::closeCandidate, modifier = Modifier.testTag("ft_close")) { Text("Закрыть") } },
            title = { Text(art.leadId) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    art.hook?.let { h ->
                        Text("Крючок", fontWeight = FontWeight.SemiBold)
                        Text(ruHook(h.hookType) + (h.title?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall)
                        h.businessImpact?.let { Text("Возможное влияние: $it", style = MaterialTheme.typography.bodySmall) }
                        h.evidenceUrl?.let { Text("Доказательство: $it", style = MaterialTheme.typography.bodySmall) }
                        Spacer(Modifier.height(8.dp))
                    }
                    Text("Тема (рекомендуемая)", fontWeight = FontWeight.SemiBold)
                    Text(art.subjectVariants.firstOrNull { it.id == art.recommendedSubjectId }?.text ?: art.subjectVariants.firstOrNull()?.text ?: "—", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Text("Текст (рекомендуемый)", fontWeight = FontWeight.SemiBold)
                    Text(art.bodyVariants.firstOrNull { it.id == art.recommendedBodyId }?.text ?: art.bodyVariants.firstOrNull()?.text ?: "—", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Text("Оценка качества: ${art.quality.totalScore} (${ruGate(art.quality.gateResult)})", style = MaterialTheme.typography.bodySmall)
                    Text("Соответствие правилам: ${ruGate(art.compliance.gateResult)}", style = MaterialTheme.typography.bodySmall)
                    Text("Готовность доставки: ${ruDeliv(art.deliverability.status)}", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    // 0.6.0-rc10: owner commands (без отправки). approve-text-only != approve-send.
                    HorizontalDivider()
                    Spacer(Modifier.height(8.dp))
                    Text("Действия владельца (без отправки)", fontWeight = FontWeight.SemiBold)
                    if (ui.activeDraftId == null) {
                        TextButton(onClick = { vm.generateDraft(art.leadId) }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_generate")) { Text("Подготовить черновик") }
                    } else {
                        Row {
                            TextButton(onClick = { art.recommendedSubjectId?.let { vm.selectSubject(it) } }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_select_subject")) { Text("Выбрать тему") }
                            TextButton(onClick = { art.recommendedBodyId?.let { vm.selectBody(it) } }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_select_body")) { Text("Выбрать текст") }
                        }
                        Row {
                            TextButton(onClick = { vm.approveTextOnly() }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_approve_text")) { Text("Одобрить только текст") }
                            TextButton(onClick = { vm.returnToAudit() }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_return_audit")) { Text("Вернуть на аудит") }
                        }
                        Row {
                            TextButton(onClick = { vm.reject("отклонено владельцем") }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_reject")) { Text("Отклонить") }
                            TextButton(onClick = { vm.selectPilot(art.leadId) }, enabled = !ui.commandBusy, modifier = Modifier.testTag("ft_select_pilot")) { Text("Выбрать лид") }
                        }
                    }
                    ui.commandMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.testTag("ft_cmd_msg")) }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (ui.textApproved) "Текст одобрен. Отправка требует отдельного разрешения владельца."
                        else "Сообщение клиенту не отправляется.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary,
                    )
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CandidateCard(row: FirstTouchCandidateRow, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp).testTag("ft_cand_${row.leadId}")) {
        Column(Modifier.padding(14.dp)) {
            Text(row.company ?: row.leadId, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("Крючок: ${ruHook(row.hookType)} · Оценка: ${row.qualityScore ?: "—"}", style = MaterialTheme.typography.bodySmall)
            Text("Сегмент: ${row.segment ?: "—"} · Продукт: ${row.product ?: "—"}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun ruHook(t: String?): String = when (t) {
    "REQUEST_PATH_FRICTION" -> "Путь до заявки"
    "FORM_FRICTION" -> "Сложность формы"
    "CATALOG_TO_REQUEST_GAP" -> "Разрыв каталог → заявка"
    "CONTACT_DISCOVERY_FRICTION" -> "Сложно найти контакт"
    "MOBILE_CONVERSION_FRICTION" -> "Мобильный путь"
    "TRUST_GAP" -> "Нехватка доверия"
    "UNCLEAR_RESPONSE_TIME" -> "Неясное время ответа"
    "WEAK_WEBSITE" -> "Слабый сайт"
    "WEAK_PRIMARY_CTA" -> "Слабый призыв к действию"
    null -> "—"
    else -> "Другой угол"
}
private fun ruBlock(r: String?): String = when (r) {
    "BLOCKED_IDENTITY_MISMATCH" -> "идентичность не подтверждена"
    "BLOCKED_CONTACT_UNVERIFIED" -> "контакт не подтверждён (получен автоматически)"
    "BLOCKED_UNCERTAIN_PRIOR_SEND" -> "неопределённая прошлая отправка"
    "BLOCKED_PRIOR_SEND" -> "уже была отправка"
    "CONTACT_NOT_EVIDENCED" -> "контакт без доказательства"
    else -> r ?: "—"
}
private fun ruDeliv(s: String?): String = when (s) {
    "READY_NO_SEND" -> "готова (без отправки)"
    "CONTACT_EVIDENCE_WEAK" -> "контакт требует подтверждения"
    "RECIPIENT_DOMAIN_INVALID" -> "адрес получателя некорректен"
    "BLOCKED_SUPPRESSION" -> "заблокирована (подавление)"
    else -> s ?: "—"
}

private fun ruGate(s: String?): String = when (s) {
    "PASS" -> "прошёл"
    "FAIL" -> "не прошёл"
    "BLOCKED" -> "заблокирован"
    "DISABLED" -> "выключен"
    "ENABLED" -> "включён"
    "READY_NO_SEND" -> "готово без отправки"
    null -> "нет данных"
    else -> "требует проверки"
}
