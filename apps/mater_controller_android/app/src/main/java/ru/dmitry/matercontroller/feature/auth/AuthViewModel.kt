package ru.dmitry.matercontroller.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.ErrorCodes
import ru.dmitry.matercontroller.core.data.MaterRepository
import javax.inject.Inject

data class ConnectState(
    val baseUrl: String = "https://195-96-132-82.sslip.io",
    val pairingCode: String = "",
    val deviceName: String = "Android",
    val remote: Boolean = true,
    val checking: Boolean = false,
    val pairing: Boolean = false,
    val healthOk: Boolean? = null,
    val message: String? = null,
    val paired: Boolean = false,
)

private const val REMOTE_BASE_URL = "https://195-96-132-82.sslip.io"
private const val LOCAL_BASE_URL = "http://127.0.0.1:8787"

/** Cold-start profile restoration phase, gates the UI before any API call. */
enum class StartupPhase { RESTORING, READY }

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: MaterRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ConnectState(paired = repo.isPaired))
    val state: StateFlow<ConnectState> = _state.asStateFlow()

    private val _startup = MutableStateFlow(StartupPhase.RESTORING)
    val startup: StateFlow<StartupPhase> = _startup.asStateFlow()

    /** True only after a paired profile with a usable base URL has been restored. */
    private val _restoredPaired = MutableStateFlow(false)
    val restoredPaired: StateFlow<Boolean> = _restoredPaired.asStateFlow()

    init {
        viewModelScope.launch {
            val ok = repo.restoreProfile()
            _restoredPaired.update { ok }
            _state.update { it.copy(paired = ok) }
            _startup.update { StartupPhase.READY }
        }
    }

    val isPaired: Boolean get() = repo.isPaired

    fun onBaseUrl(v: String) = _state.update { it.copy(baseUrl = v, healthOk = null, message = null) }
    fun onCode(v: String) = _state.update { it.copy(pairingCode = v.filter { c -> c.isDigit() }.take(6)) }
    fun onDeviceName(v: String) = _state.update { it.copy(deviceName = v) }
    fun onRemote(v: Boolean) = _state.update {
        it.copy(
            remote = v,
            baseUrl = if (v) REMOTE_BASE_URL else LOCAL_BASE_URL,
            healthOk = null,
            message = null,
        )
    }

    fun checkConnection() {
        val s = _state.value
        _state.update { it.copy(checking = true, message = null, healthOk = null) }
        viewModelScope.launch {
            when (val r = repo.checkHealth(s.baseUrl)) {
                is DataResult.Success -> _state.update { it.copy(checking = false, healthOk = true, message = "Сервер доступен") }
                is DataResult.Error -> {
                    val msg = if (r.code == ErrorCodes.TIMEOUT) {
                        "Сервер не ответил. Включите Wi‑Fi или VPN и повторите."
                    } else {
                        "Сервер недоступен. Проверьте сеть или откройте локальный режим."
                    }
                    _state.update { it.copy(checking = false, healthOk = false, message = msg) }
                }
            }
        }
    }

    fun pair(onPaired: () -> Unit) {
        val s = _state.value
        if (s.pairingCode.length != 6) {
            _state.update { it.copy(message = "Введите 6-значный код") }
            return
        }
        _state.update { it.copy(pairing = true, message = null) }
        viewModelScope.launch {
            when (val r = repo.pair(s.baseUrl, s.pairingCode, s.deviceName)) {
                is DataResult.Success -> {
                    _state.update { it.copy(pairing = false, paired = true, message = "Подключено") }
                    onPaired()
                }
                is DataResult.Error -> {
                    val msg = when (r.code) {
                        "PAIRING_CODE_INVALID", "PAIRING_CODE_USED", "PAIRING_CODE_EXPIRED" -> "Неверный код подключения"
                        ErrorCodes.TIMEOUT -> "Сервер не ответил. Включите Wi‑Fi или VPN и повторите."
                        else -> "Не удалось подключиться. Проверьте адрес и сеть или откройте локальный режим."
                    }
                    _state.update { it.copy(pairing = false, message = msg) }
                }
            }
        }
    }
}
