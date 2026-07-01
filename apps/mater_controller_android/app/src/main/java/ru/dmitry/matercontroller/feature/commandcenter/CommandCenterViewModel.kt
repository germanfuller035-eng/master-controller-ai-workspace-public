package ru.dmitry.matercontroller.feature.commandcenter

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
import ru.dmitry.matercontroller.core.model.CommandBrief
import ru.dmitry.matercontroller.core.model.OwnerSnapshot
import javax.inject.Inject

/**
 * Owner Command Center home (0.8.0). Read-only: surfaces the four owner answers
 * (what happened / how important / what the system did / what decision is needed).
 * Never sends; outbound stays blocked server-side.
 */
data class CommandCenterUi(
    val loading: Boolean = true,
    val error: String? = null,
    val snapshot: OwnerSnapshot? = null,
    val brief: CommandBrief? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class CommandCenterViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CommandCenterUi())
    val ui: StateFlow<CommandCenterUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val snapRes = repo.ownerSnapshot()
            val briefRes = repo.commandBrief()
            val snap = (snapRes as? DataResult.Success)?.data
            val brief = (briefRes as? DataResult.Success)?.data
            if (snapRes is DataResult.Error && brief == null) {
                _ui.update { it.copy(loading = false, error = snapRes.message) }
                return@launch
            }
            _ui.update {
                it.copy(
                    loading = false,
                    snapshot = snap,
                    brief = brief,
                    offline = (snapRes as? DataResult.Success)?.fromCache ?: false,
                    cachedAt = (snapRes as? DataResult.Success)?.cachedAt,
                    error = null,
                )
            }
        }
    }
}
