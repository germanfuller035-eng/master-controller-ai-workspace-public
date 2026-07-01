package ru.dmitry.matercontroller.feature.multichannel

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
import ru.dmitry.matercontroller.core.model.ChannelsList
import ru.dmitry.matercontroller.core.model.InboundList
import ru.dmitry.matercontroller.core.model.MultichannelOwnerQueue
import ru.dmitry.matercontroller.core.model.SourceHealthList
import ru.dmitry.matercontroller.core.model.SourcesList
import ru.dmitry.matercontroller.core.ui.OwnerLocalization
import javax.inject.Inject

data class MultichannelUi(
    val loading: Boolean = true,
    val error: String? = null,
    val sources: SourcesList? = null,
    val sourcesHealth: SourceHealthList? = null,
    val channels: ChannelsList? = null,
    val inbound: InboundList? = null,
    val queue: MultichannelOwnerQueue? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class MultichannelViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(MultichannelUi())
    val ui: StateFlow<MultichannelUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val s = repo.sources(); val sh = repo.sourcesHealth(); val c = repo.channels()
            val inb = repo.inbound(); val q = repo.multichannelOwnerQueue()
            if (s is DataResult.Error && s.code != "FEATURE_DISABLED") {
                _ui.update { it.copy(loading = false, error = OwnerLocalization.renderErrorCodeRu(s.code)) }
                return@launch
            }
            _ui.update {
                it.copy(
                    loading = false,
                    sources = (s as? DataResult.Success)?.data,
                    sourcesHealth = (sh as? DataResult.Success)?.data,
                    channels = (c as? DataResult.Success)?.data,
                    inbound = (inb as? DataResult.Success)?.data,
                    queue = (q as? DataResult.Success)?.data,
                    offline = (s as? DataResult.Success)?.fromCache == true,
                    error = null,
                )
            }
        }
    }
}
