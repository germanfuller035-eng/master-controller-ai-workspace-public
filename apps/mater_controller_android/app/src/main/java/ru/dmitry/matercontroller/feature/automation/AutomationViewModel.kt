package ru.dmitry.matercontroller.feature.automation

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
import ru.dmitry.matercontroller.core.model.AutomationStatusDto
import javax.inject.Inject

data class AutomationUi(
    val loading: Boolean = true,
    val error: String? = null,
    val status: AutomationStatusDto? = null,
)

@HiltViewModel
class AutomationViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(AutomationUi())
    val ui: StateFlow<AutomationUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.automationStatus2()) {
                is DataResult.Success -> _ui.update { it.copy(loading = false, status = r.data, error = null) }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = r.message) }
            }
        }
    }
}
