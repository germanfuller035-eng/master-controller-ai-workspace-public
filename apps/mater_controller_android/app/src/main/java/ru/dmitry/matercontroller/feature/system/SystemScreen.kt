package ru.dmitry.matercontroller.feature.system

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
fun SystemScreen(vm: SystemViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text("Система") }) }) { pad ->
        when {
            ui.loading -> LoadingState(Modifier.padding(pad))
            ui.error != null -> ErrorState(ui.error!!, onRetry = vm::refresh, modifier = Modifier.padding(pad))
            else -> {
                val s = ui.status
                Column(
                    Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("system_screen"),
                ) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Состояние системы", style = MaterialTheme.typography.titleLarge)
                        TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.system.control.refresh")) { Text("Обновить") }
                    }
                    Spacer(Modifier.height(8.dp))
                    StatusRow("Сервер", s?.api?.let { "доступен" } ?: "нет данных")
                    StatusRow("Резервный канал", s?.telegramBot?.let { tb -> if (tb.polling == true) "активен" else tb.status ?: "нет данных" } ?: "нет данных")
                    StatusRow("Хранилище лидов", if (s?.leadStore?.exists == true) "OK (${s.leadStore.sizeBytes ?: 0} б)" else "нет")
                    StatusRow("История отправочных решений", if (s?.outboundLedger?.exists == true) "есть" else "нет")
                    StatusRow("История писем", if (s?.emailLedger?.exists == true) "есть" else "нет")
                    StatusRow("Почтовая отправка", if (s?.smtpConfigured == true) "настроена, но требует ручного разрешения" else "не настроена")
                    StatusRow("Автоотправка", if ((s?.autosend ?: "").equals("BLOCKED", ignoreCase = true)) "выключена" else s?.autosend ?: "выключена")
                    ServerFunnelBlock(s)
                    StatusRow("Последняя синхронизация", s?.lastSync ?: "—")
                }
            }
        }
    }
}

@Composable
private fun ServerFunnelBlock(status: ru.dmitry.matercontroller.core.model.SystemStatus?) {
    val f = status?.serverFunnel
    Spacer(Modifier.height(12.dp))
    Text("Серверная воронка", style = MaterialTheme.typography.titleMedium)
    Text(
        f?.ownerVisibleRu?.status ?: "Нет данных от сервера.",
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
    )
    StatusRow("Входящая почта", when {
        f?.yandexImapRead?.enabled == true && f.yandexImapRead.snapshotExists -> "прочитано: ${f.yandexImapRead.count}"
        f?.yandexImapRead?.enabled == true -> "нужно обновить"
        else -> "недоступна"
    })
    StatusRow("Разбор писем", if (f?.emailClassification?.enabled == true) "включён" else "нет данных")
    StatusRow("Локальная воронка", if (f?.crmLocalWrite?.enabled == true && f.crmLocalWrite.privateOnly) "включена, приватно" else "нет данных")
    StatusRow("Подтверждение владельца", if (f?.telegramApproval?.cardReady == true) "карточки готовы" else "нет данных")
    StatusRow("Одна ручная отправка", if (f?.yandexSmtpReady?.configured == true) "после подтверждения" else "требуется настройка")
    StatusRow("Автоответы", if (f?.safety?.autoReply == "OFF") "выключены" else "требуют проверки")
    StatusRow("Массовая отправка", if (f?.safety?.massSend == "OFF") "выключена" else "требует проверки")
    StatusRow("Платежи", if (f?.safety?.paymentLive == "OFF") "выключены" else "требуют проверки")
    StatusRow("Рабочая база", if (f?.safety?.productionDbWrite == "OFF") "отдельное разрешение" else "требует проверки")
    Text(
        f?.ownerVisibleRu?.nextAction ?: "Обновите данные и проверьте следующий шаг.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 8.dp),
    )
    Text(
        f?.ownerVisibleRu?.blockedReason ?: "Живые действия требуют отдельного подтверждения.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
    )
}

@Composable
private fun StatusRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyLarge)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
    HorizontalDivider()
}
