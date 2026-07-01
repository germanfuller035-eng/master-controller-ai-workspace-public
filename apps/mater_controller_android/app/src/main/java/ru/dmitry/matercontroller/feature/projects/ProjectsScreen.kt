package ru.dmitry.matercontroller.feature.projects

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.dmitry.matercontroller.core.ui.ErrorState
import ru.dmitry.matercontroller.core.ui.LoadingState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectsScreen(onOpenMiniAudit: () -> Unit, vm: ProjectsViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Проекты") }) }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> Column(
                Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("projects_screen"),
            ) {
                ui.projects.forEach { project ->
                    if (project.id == "mini_audit") {
                        val s = ui.miniAuditStatus
                        Card(onClick = onOpenMiniAudit, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("project_mini_audit")) {
                            Column(Modifier.padding(16.dp)) {
                                Text(project.name, style = MaterialTheme.typography.titleLarge)
                                Text("Статус: ${project.status}", style = MaterialTheme.typography.bodySmall)
                                if (s != null) {
                                    Spacer(Modifier.height(8.dp))
                                    Text("Готовы: ${s.readySend} · Ждут ответа: ${s.waitingReply} · Follow-up: ${s.followupDue}", style = MaterialTheme.typography.bodyMedium)
                                    Text("Проверка: ${s.needsCheck} · Неопределённые: ${s.sendUncertain}", style = MaterialTheme.typography.bodyMedium)
                                }
                                Spacer(Modifier.height(12.dp))
                                Button(onClick = onOpenMiniAudit, modifier = Modifier.testTag("btn_open_mini_audit")) { Text("Открыть") }
                            }
                        }
                    } else {
                        Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Column(Modifier.padding(16.dp)) {
                                Text(project.name, style = MaterialTheme.typography.titleMedium)
                                Text("Статус: ${project.status}", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Text("Добавление модулей — позже")
                }
            }
        }
    }
}
