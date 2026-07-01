package ru.dmitry.matercontroller.feature.projects

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
import ru.dmitry.matercontroller.core.model.MiniAuditStatus
import ru.dmitry.matercontroller.core.model.Project
import javax.inject.Inject

data class ProjectsUi(
    val loading: Boolean = true,
    val error: String? = null,
    val projects: List<Project> = emptyList(),
    val miniAuditStatus: MiniAuditStatus? = null,
)

@HiltViewModel
class ProjectsViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ProjectsUi())
    val ui: StateFlow<ProjectsUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val p = repo.projects()
            val s = repo.status()
            when (p) {
                is DataResult.Success -> _ui.update {
                    it.copy(loading = false, projects = p.data.projects, miniAuditStatus = (s as? DataResult.Success)?.data)
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = p.message) }
            }
        }
    }
}
