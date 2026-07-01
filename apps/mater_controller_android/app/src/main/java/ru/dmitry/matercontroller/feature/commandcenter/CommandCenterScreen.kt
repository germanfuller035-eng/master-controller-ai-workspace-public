package ru.dmitry.matercontroller.feature.commandcenter

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.IncidentCard
import ru.dmitry.matercontroller.core.ui.LoadingState
import ru.dmitry.matercontroller.core.ui.OfflineBanner
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips

private fun severityRu(s: String?): String = when ((s ?: "").uppercase()) {
    "P0" -> "Критично"; "P1" -> "Важно"; "P2" -> "Инфо"; "P3" -> "Сводка"; else -> ""
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommandCenterScreen(
    onOpenDecisions: () -> Unit = {},
    onOpenIncidents: () -> Unit = {},
    onOpenDeepLink: (String) -> Unit = {},
    vm: CommandCenterViewModel = hiltViewModel(),
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Командный центр") }) }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).testTag("command_center_screen"),
        ) {
            if (ui.offline) OfflineBanner(ui.cachedAt)
            when {
                ui.loading -> LoadingState()
                ui.error != null && ui.snapshot == null -> ErrorState(ui.error!!, onRetry = vm::refresh)
                else -> {
                    val snap = ui.snapshot
                    val brief = ui.brief
                    Text("Командный центр", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(12.dp).testTag("pilot_command_center"))
                    Text("Что требует владельца: решения, инциденты, надёжность и расходы. Отправка, платежи и запись в рабочую базу остаются выключены.", Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.bodySmall)
                    PilotSafetyChips(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), tag = "pilot_command_center_safety_chips")
                    // 2. how important — system state + primary constraint
                    Card(Modifier.fillMaxWidth().padding(12.dp)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Состояние системы", style = MaterialTheme.typography.labelMedium)
                            Text(snap?.system_state_ru ?: brief?.system_state_ru ?: "—", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            val c = snap?.primary_constraint ?: brief?.primary_constraint
                            if (c?.text_ru != null) {
                                Divider(Modifier.padding(vertical = 4.dp))
                                Text("Главное ограничение", style = MaterialTheme.typography.labelMedium)
                                Text(c.text_ru!!, style = MaterialTheme.typography.bodyMedium)
                            }
                            AssistChip(onClick = {}, enabled = false, label = { Text("Исходящие отключены") }, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    // 3. what the system already did
                    val acts = snap?.automatic_actions.orEmpty()
                    if (acts.isNotEmpty()) {
                        SectionTitle("Исправлено автоматически")
                        acts.takeLast(5).forEach { a ->
                            ListItem(headlineContent = { Text(a.playbook ?: "—") }, supportingContent = { Text(a.result ?: "") })
                        }
                    }
                    // 4. owner decisions (<=3)
                    val decs = snap?.owner_decisions.orEmpty()
                    SectionTitle("Решения владельца" + if (decs.isNotEmpty()) " (${decs.size})" else "")
                    if (decs.isEmpty()) {
                        Text("Решений не требуется", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodyMedium)
                    } else {
                        decs.take(3).forEach { d ->
                            Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).testTag("decision_${d.decision_id}")) {
                                Column(Modifier.padding(12.dp)) {
                                    Text("[${severityRu(d.priority)}] ${d.title_ru ?: ""}", style = MaterialTheme.typography.bodyLarge)
                                }
                            }
                        }
                        TextButton(onClick = onOpenDecisions, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Все решения") }
                    }
                    // critical incidents
                    val incs = snap?.critical_incidents.orEmpty()
                    if (incs.isNotEmpty()) {
                        SectionTitle("Критические инциденты")
                        incs.forEach { i ->
                            IncidentCard(
                                title = i.title_ru ?: "—",
                                subtitle = "Проверьте детали и стоп-контекст в разделе Система.",
                                severity = "R5",
                                modifier = Modifier.padding(horizontal = 12.dp),
                            )
                        }
                        TextButton(onClick = onOpenIncidents, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Все инциденты") }
                    }
                    // 1. what happened — recent events
                    val ev = snap?.recent_events.orEmpty()
                    if (ev.isNotEmpty()) {
                        SectionTitle("Что произошло")
                        ev.forEach { e ->
                            ListItem(
                                headlineContent = { Text(e.title_ru ?: "—") },
                                overlineContent = { Text(severityRu(e.severity)) },
                            )
                        }
                    }
                    // P3 summary line
                    if (brief?.recommendation_ru != null) {
                        SectionTitle("Сводка")
                        Text(brief.recommendation_ru!!, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(t: String) {
    Text(t, Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}
