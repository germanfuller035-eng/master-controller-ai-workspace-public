package ru.dmitry.matercontroller.feature.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import ru.dmitry.matercontroller.core.ui.PilotSafetyChips
import ru.dmitry.matercontroller.core.designsystem.ThemeMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onUnpair: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val theme by vm.themeMode.collectAsState(initial = ThemeMode.DARK)
    val bg by vm.bgRefresh.collectAsState(initial = true)
    val notif by vm.notifications.collectAsState(initial = true)
    val connected by vm.connected.collectAsState()
    var confirmUnpair by remember { mutableStateOf(false) }
    Scaffold(topBar = { TopAppBar(title = { Text("Настройки") }) }) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()).testTag("settings_screen"),
        ) {
            Text("Настройки", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.testTag("pilot_settings"))
            Text("Рабочий ручной режим: email запускает владелец, результат фиксируется локально, платежи выключены.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            PilotSafetyChips(tag = "pilot_settings_safety_chips")
            Spacer(Modifier.height(12.dp))
            Text("Переключатели безопасности", style = MaterialTheme.typography.titleMedium)
            PilotModeSwitch("ручная отправка владельцем", checked = true, tag = "pilot_toggle_manual_send")
            PilotModeSwitch("без платежей", checked = true, tag = "pilot_toggle_no_payment")
            PilotModeSwitch("локальная фиксация результата", checked = true, tag = "pilot_toggle_local_result")
            Spacer(Modifier.height(16.dp))

            Text("Профиль соединения", style = MaterialTheme.typography.titleMedium)
            val baseUrl by vm.baseUrl.collectAsState(initial = vm.currentBaseUrl)
            Text("Сервер: ${serverLabel(baseUrl)}", style = MaterialTheme.typography.bodySmall)
            Text("Телефон: ${ownerDeviceLabel(vm.deviceLabel)}", style = MaterialTheme.typography.bodySmall)
            vm.shortDeviceId?.let { Text("Код телефона: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)) }
            // Live status from a real health read — never a hardcoded "подключено".
            val statusRu = when (connected) { true -> "подключено"; false -> "нет соединения"; else -> "проверка…" }
            Text(
                "Статус подключения: $statusRu",
                style = MaterialTheme.typography.bodySmall,
                color = if (connected == false) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.testTag("settings_conn_status"),
            )
            TextButton(onClick = vm::checkConnection, modifier = Modifier.testTag("settings_recheck")) { Text("Проверить соединение") }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = vm::useRemoteServer,
                    modifier = Modifier.weight(1f).testTag("settings_use_remote_server"),
                ) { Text("VPS") }
                OutlinedButton(
                    onClick = vm::useUsbServer,
                    modifier = Modifier.weight(1f).testTag("settings_use_usb_server"),
                ) { Text("USB-канал") }
            }
            Text(
                "USB-канал работает через подключённый ноутбук и ADB reverse. Внешние действия не запускаются.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f),
            )
            Spacer(Modifier.height(16.dp))

            Text("Тема", style = MaterialTheme.typography.titleMedium)
            Row {
                FilterChip(selected = theme == ThemeMode.DARK, onClick = { vm.setTheme(ThemeMode.DARK) }, label = { Text("Тёмная") }, modifier = Modifier.testTag("theme_chip_dark"))
                Spacer(Modifier.width(8.dp))
                FilterChip(selected = theme == ThemeMode.LIGHT, onClick = { vm.setTheme(ThemeMode.LIGHT) }, label = { Text("Светлая") }, modifier = Modifier.testTag("theme_chip_light"))
                Spacer(Modifier.width(8.dp))
                FilterChip(selected = theme == ThemeMode.SYSTEM, onClick = { vm.setTheme(ThemeMode.SYSTEM) }, label = { Text("Системная") }, modifier = Modifier.testTag("theme_chip_system"))
            }
            Spacer(Modifier.height(16.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Фоновое обновление")
                Switch(checked = bg, onCheckedChange = vm::setBgRefresh, modifier = Modifier.testTag("switch_bg"))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Уведомления")
                Switch(checked = notif, onCheckedChange = vm::setNotifications, modifier = Modifier.testTag("switch_notif"))
            }
            Spacer(Modifier.height(24.dp))

            // Unpair is irreversible — require a confirmation dialog (no single-tap reset).
            Button(
                onClick = { confirmUnpair = true },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().testTag("btn_unpair"),
            ) { Text("Выйти / отвязать") }

            if (confirmUnpair) {
                AlertDialog(
                    onDismissRequest = { confirmUnpair = false },
                    title = { Text("Отвязать устройство?") },
                    text = { Text("Токен сопряжения будет удалён. Чтобы снова подключиться, потребуется новый код подключения. Действие необратимо.") },
                    confirmButton = {
                        TextButton(
                            onClick = { confirmUnpair = false; vm.unpair(); onUnpair() },
                            modifier = Modifier.testTag("btn_unpair_confirm"),
                        ) { Text("Отвязать") }
                    },
                    dismissButton = { TextButton(onClick = { confirmUnpair = false }, modifier = Modifier.testTag("btn_unpair_cancel")) { Text("Отмена") } },
                )
            }

            Spacer(Modifier.height(16.dp))
            Text("Версия приложения: ${ru.dmitry.matercontroller.BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall)
            Text("Код сборки: ${ru.dmitry.matercontroller.BuildConfig.VERSION_CODE}", style = MaterialTheme.typography.bodySmall)
        Text("Автоотправка выключена. Ручной email запускает владелец.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun PilotModeSwitch(label: String, checked: Boolean, tag: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label)
            Text("Заблокировано для безопасного ручного контура.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.68f))
        }
        Switch(checked = checked, onCheckedChange = {}, enabled = false, modifier = Modifier.testTag(tag))
    }
}

private fun ownerDeviceLabel(label: String): String =
    if (
        label.contains("TEST", ignoreCase = true) ||
        label.contains("DEBUG", ignoreCase = true) ||
        label.count { it == '_' } >= 2
    ) {
        "текущий телефон"
    } else {
        label
    }

private fun serverLabel(url: String): String = when {
    url.contains("127.0.0.1:8787") -> "USB-канал с ноутбуком"
    url.contains("195-96-132-82.sslip.io") -> "рабочий VPS"
    url.isBlank() -> "не выбран"
    else -> "свой адрес"
}
