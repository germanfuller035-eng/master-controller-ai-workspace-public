package ru.dmitry.matercontroller.feature.system

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
import ru.dmitry.matercontroller.core.model.SystemStatus
import javax.inject.Inject

data class SystemUi(val loading: Boolean = true, val error: String? = null, val status: SystemStatus? = null, val offline: Boolean = false, val cachedAt: Long? = null)

@HiltViewModel
class SystemViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(SystemUi())
    val ui: StateFlow<SystemUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.systemStatus()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, status = r.data, offline = r.fromCache, cachedAt = r.cachedAt, error = null) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = "Нет соединения и сохранённых данных.") }
            }
        }
    }
}
