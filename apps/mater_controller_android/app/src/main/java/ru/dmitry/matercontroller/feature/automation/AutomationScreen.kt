package ru.dmitry.matercontroller.feature.automation

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
import ru.dmitry.matercontroller.core.ui.SectionCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AutomationScreen(vm: AutomationViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Автоматизация") }) }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> {
                val s = ui.status
                Column(Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("automation_screen")) {
                    SectionCard(title = "Каноническая запись", trailing = if (s?.canonicalWriter == true) "да" else "нет", tag = "auto_writer")
                    SectionCard(title = "Автоотправка", trailing = if (s?.autosend.equals("BLOCKED", ignoreCase = true)) "заблокировано" else (s?.autosend ?: "заблокировано"), tag = "auto_autosend")
                    SectionCard(title = "Живая отправка", trailing = if (s?.sendAllowedLive == true) "ВКЛ" else "ВЫКЛ", tag = "auto_send")
                    SectionCard(title = "Ревизия хранилища", trailing = (s?.storeRevision ?: 0).toString(), tag = "auto_rev")
                    SectionCard(title = "Заданий в очереди", trailing = (s?.queued ?: 0).toString(), tag = "auto_queued")
                    SectionCard(title = "Заданий в работе", trailing = (s?.running ?: 0).toString(), tag = "auto_running")
                    SectionCard(title = "Ошибочные задания", trailing = (s?.deadLetter ?: 0).toString(), tag = "auto_dead")
                    SectionCard(title = "Обслуживание", trailing = if (s?.maintenance == true) "ВКЛ" else "выкл", tag = "auto_maint")
                    Spacer(Modifier.height(8.dp))
                    Text("Ручная отправка доступна через отправочный пакет. Автоотправка без владельца выключена.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}
