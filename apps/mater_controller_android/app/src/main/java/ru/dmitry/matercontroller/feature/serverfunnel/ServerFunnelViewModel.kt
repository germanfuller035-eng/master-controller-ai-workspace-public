package ru.dmitry.matercontroller.feature.serverfunnel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.model.ServerFunnelApprovalCardResponse
import ru.dmitry.matercontroller.core.model.ServerFunnelApprovalRequest
import ru.dmitry.matercontroller.core.model.ServerFunnelEmailDetailData
import ru.dmitry.matercontroller.core.model.ServerFunnelMailData
import ru.dmitry.matercontroller.core.model.ServerFunnelReplyDraft
import ru.dmitry.matercontroller.core.model.ServerFunnelStatus
import javax.inject.Inject

data class ServerFunnelUiState(
    val loading: Boolean = true,
    val actionBusy: Boolean = false,
    val error: String? = null,
    val status: ServerFunnelStatus? = null,
    val mail: ServerFunnelMailData? = null,
    val detail: ServerFunnelEmailDetailData? = null,
    val draft: ServerFunnelReplyDraft? = null,
    val approval: ServerFunnelApprovalCardResponse? = null,
    val notice: String? = null,
)

@HiltViewModel
class ServerFunnelViewModel @Inject constructor(
    private val repo: MaterRepository,
) : ViewModel() {
    private val _ui = MutableStateFlow(ServerFunnelUiState())
    val ui: StateFlow<ServerFunnelUiState> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val status = repo.serverFunnelStatus()
            val mail = repo.serverFunnelMail()
            val statusData = (status as? DataResult.Success)?.data
            val mailData = (mail as? DataResult.Success)?.data
            val error = (status as? DataResult.Error)?.message ?: (mail as? DataResult.Error)?.message
            _ui.update {
                it.copy(
                    loading = false,
                    status = statusData ?: it.status,
                    mail = mailData ?: it.mail,
                    error = if (statusData == null && mailData == null) error else null,
                )
            }
        }
    }

    fun refreshMailReadonly() {
        _ui.update { it.copy(actionBusy = true, notice = null, error = null) }
        viewModelScope.launch {
            val refreshed = repo.serverFunnelRefreshImapReadonly()
            if (refreshed is DataResult.Error) {
                _ui.update { it.copy(actionBusy = false, error = refreshed.message) }
                return@launch
            }
            repo.serverFunnelApplySnapshot()
            _ui.update { it.copy(actionBusy = false, notice = "Почта обновлена без отправки и без изменения писем.") }
            refresh()
        }
    }

    fun openEmail(emailId: String) {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val res = repo.serverFunnelEmail(emailId)) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, detail = res.data, error = null) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = res.message) }
            }
        }
    }

    fun prepareDraft(emailId: String) {
        _ui.update { it.copy(actionBusy = true, error = null, notice = null) }
        viewModelScope.launch {
            when (val res = repo.serverFunnelReplyDraft(emailId)) {
                is DataResult.Success -> _ui.update { it.copy(actionBusy = false, draft = res.data, notice = "Черновик сохранён. Ничего не отправлено.") }
                is DataResult.Error -> _ui.update { it.copy(actionBusy = false, error = res.message) }
            }
        }
    }

    fun createApproval(emailId: String, sendTelegram: Boolean) {
        val draft = _ui.value.draft
        _ui.update { it.copy(actionBusy = true, error = null, notice = null) }
        viewModelScope.launch {
            val req = ServerFunnelApprovalRequest(
                subject = draft?.subject,
                body = draft?.body,
                sendTelegram = sendTelegram,
            )
            when (val res = repo.serverFunnelApprovalCard(emailId, req)) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        actionBusy = false,
                        approval = res.data,
                        notice = if (res.data.telegramSent) "Карточка отправлена владельцу в Telegram." else "Пакет подготовлен. Клиенту ничего не отправлено.",
                    )
                }
                is DataResult.Error -> _ui.update { it.copy(actionBusy = false, error = res.message) }
            }
        }
    }
}
