package ru.dmitry.matercontroller.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionScreen(
    onPaired: () -> Unit,
    onLocalMode: () -> Unit = {},
    vm: AuthViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    val canPair = s.pairingCode.length == 6 && s.deviceName.isNotBlank()

    Scaffold(topBar = { TopAppBar(title = { Text("Подключение к Master Controller") }) }) { pad ->
        Column(
            Modifier.padding(pad).padding(20.dp).verticalScroll(rememberScrollState()),
        ) {
            Text("Master Controller", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(4.dp))
            Text("Подключите телефон к рабочему серверу или откройте локальный ручной режим.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(20.dp))

            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = !s.remote, onClick = { vm.onRemote(false) },
                    shape = SegmentedButtonDefaults.itemShape(0, 2),
                    modifier = Modifier.testTag("seg_local"),
                ) { Text("Локальный ПК") }
                SegmentedButton(
                    selected = s.remote, onClick = { vm.onRemote(true) },
                    shape = SegmentedButtonDefaults.itemShape(1, 2),
                    modifier = Modifier.testTag("seg_remote"),
                ) { Text("Рабочий сервер") }
            }
            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = s.baseUrl, onValueChange = vm::onBaseUrl,
                label = { Text(if (s.remote) "Адрес рабочего сервера" else "Адрес USB-канала") },
                singleLine = true, modifier = Modifier.fillMaxWidth().testTag("field_base_url"),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = s.pairingCode, onValueChange = vm::onCode,
                label = { Text("Код подключения") },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { vm.pair(onPaired) }),
                singleLine = true, modifier = Modifier.fillMaxWidth().testTag("field_code"),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = s.deviceName, onValueChange = vm::onDeviceName,
                label = { Text("Имя устройства") },
                singleLine = true, modifier = Modifier.fillMaxWidth().testTag("field_device"),
            )
            Spacer(Modifier.height(16.dp))

            OutlinedButton(
                onClick = vm::checkConnection, enabled = !s.checking,
                modifier = Modifier.fillMaxWidth().testTag("btn_check"),
            ) {
                if (s.checking) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text(if (s.remote) "Проверить рабочий сервер" else "Проверить USB-канал")
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { vm.pair(onPaired) }, enabled = !s.pairing && canPair,
                modifier = Modifier.fillMaxWidth().testTag("btn_pair"),
            ) {
                if (s.pairing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text(if (s.remote) "Подключить к рабочему серверу" else "Подключить устройство")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = onLocalMode,
                enabled = !s.pairing,
                modifier = Modifier.fillMaxWidth().testTag("btn_local_sales_mode"),
            ) { Text("Открыть локальный режим") }
            Text(
                "Локальный режим открывает ручной контур продаж на этом ПК. Платежи выключены.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )

            s.message?.let {
                Spacer(Modifier.height(16.dp))
                val colors = CardDefaults.elevatedCardColors(
                    containerColor = when (s.healthOk) {
                        true -> MaterialTheme.colorScheme.surfaceVariant
                        false -> MaterialTheme.colorScheme.errorContainer
                        null -> MaterialTheme.colorScheme.surfaceVariant
                    },
                )
                val textColor = when (s.healthOk) {
                    false -> MaterialTheme.colorScheme.onErrorContainer
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                ElevatedCard(Modifier.fillMaxWidth().testTag("connect_message"), colors = colors) {
                    Text(it, color = textColor, modifier = Modifier.padding(12.dp))
                }
            }

            if (s.remote) {
                Spacer(Modifier.height(20.dp))
                Text(
                    "Рабочий сервер требует интернет на телефоне и код подключения. Если сеть недоступна, используйте локальный режим.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
            }
        }
    }
}
