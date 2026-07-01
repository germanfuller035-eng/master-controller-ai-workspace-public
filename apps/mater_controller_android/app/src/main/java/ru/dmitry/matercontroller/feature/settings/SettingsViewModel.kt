package ru.dmitry.matercontroller.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.ErrorCodes
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.data.SettingsStore
import ru.dmitry.matercontroller.core.designsystem.ThemeMode
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settings: SettingsStore,
    private val repo: MaterRepository,
) : ViewModel() {
    val themeMode: Flow<ThemeMode> = settings.themeMode
    val bgRefresh: Flow<Boolean> = settings.bgRefresh
    val notifications: Flow<Boolean> = settings.notifications
    val baseUrl: Flow<String> = settings.baseUrl

    val deviceId: String? get() = repo.deviceId
    val deviceName: String? get() = repo.deviceName
    val currentBaseUrl: String get() = repo.currentBaseUrl

    // Real connection status, derived from a live health read — never a hardcoded "подключено".
    // null = checking; true = API answered; false = no connection.
    private val _connected = MutableStateFlow<Boolean?>(null)
    val connected: StateFlow<Boolean?> = _connected.asStateFlow()
    private val _connectionMessage = MutableStateFlow("Проверяем рабочий сервер...")
    val connectionMessage: StateFlow<String> = _connectionMessage.asStateFlow()

    init { checkConnection() }

    fun checkConnection() {
        viewModelScope.launch {
            _connected.value = null
            _connectionMessage.value = "Проверяем рабочий сервер..."
            when (val health = repo.checkHealth(repo.currentBaseUrl)) {
                is DataResult.Error -> {
                    _connected.value = false
                    _connectionMessage.value = "Рабочий сервер недоступен с телефона. Проверьте интернет или включите USB-канал."
                }
                is DataResult.Success -> {
                    when (val auth = repo.checkAuthorized()) {
                        is DataResult.Success -> {
                            _connected.value = true
                            _connectionMessage.value = "Рабочий сервер подключён. Можно обновлять данные и запускать поиск."
                        }
                        is DataResult.Error -> {
                            _connected.value = false
                            _connectionMessage.value = when (auth.code) {
                                ErrorCodes.UNAUTHORIZED -> "Сервер доступен, но устройство не авторизовано. Отвяжите телефон и подключите его заново по коду."
                                ErrorCodes.FORBIDDEN -> "Сервер доступен, но у устройства недостаточно прав для рабочего контура."
                                else -> "Сервер доступен, но рабочий контур не подтвердился. Повторите проверку или подключите телефон заново."
                            }
                        }
                    }
                }
            }
        }
    }

    /** Owner-friendly device label with safe fallback; never the raw token. */
    val deviceLabel: String get() = repo.deviceName?.takeIf { it.isNotBlank() } ?: "Устройство Android"

    /** Shortened technical id (dev_74c7…3c92), shown as a secondary line only. */
    val shortDeviceId: String? get() = repo.deviceId?.let { id ->
        if (id.length > 12) "${id.take(8)}…${id.takeLast(4)}" else id
    }

    fun setTheme(mode: ThemeMode) = viewModelScope.launch { settings.setTheme(mode) }
    fun setBgRefresh(v: Boolean) = viewModelScope.launch { settings.setBgRefresh(v) }
    fun setNotifications(v: Boolean) = viewModelScope.launch { settings.setNotifications(v) }
    fun unpair() = repo.unpair()

    fun useRemoteServer() = switchServer(REMOTE_BASE_URL)
    fun useUsbServer() = switchServer(USB_BASE_URL)

    private fun switchServer(url: String) = viewModelScope.launch {
        repo.setBaseUrl(url)
        settings.setBaseUrl(url)
        checkConnection()
    }

    companion object {
        const val REMOTE_BASE_URL = "https://195-96-132-82.sslip.io"
        const val USB_BASE_URL = "http://127.0.0.1:8787"
    }
}
