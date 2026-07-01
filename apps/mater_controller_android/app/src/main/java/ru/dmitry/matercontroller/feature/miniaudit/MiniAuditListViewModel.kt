package ru.dmitry.matercontroller.feature.miniaudit

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
import ru.dmitry.matercontroller.core.model.Lead
import javax.inject.Inject

data class ListUi(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<Lead> = emptyList(),
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val search: String = "",
)

@HiltViewModel
class MiniAuditListViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(ListUi())
    val ui: StateFlow<ListUi> = _ui.asStateFlow()
    private var bucket: String = "all"

    fun load(bucket: String) {
        this.bucket = bucket
        refresh()
    }

    fun onSearch(q: String) {
        _ui.update { it.copy(search = q) }
        refresh()
    }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val search = _ui.value.search.ifBlank { null }
            val result: ListResult = when (bucket) {
                "send_uncertain" -> when (val r = repo.sendUncertain()) {
                    is DataResult.Success -> ListResult.Ok(filterSearch(r.data.items, search), r.fromCache, r.cachedAt)
                    is DataResult.Error -> ListResult.Err(r.message)
                }
                "followups" -> when (val r = repo.followups()) {
                    is DataResult.Success -> ListResult.Ok(filterSearch(r.data.items, search), r.fromCache, r.cachedAt)
                    is DataResult.Error -> ListResult.Err(r.message)
                }
                else -> when (val r = repo.leads(bucket, search)) {
                    is DataResult.Success -> ListResult.Ok(r.data.items, r.fromCache, r.cachedAt)
                    is DataResult.Error -> ListResult.Err(r.message)
                }
            }
            when (result) {
                is ListResult.Ok -> _ui.update { it.copy(loading = false, items = result.items, offline = result.offline, cachedAt = result.cachedAt) }
                is ListResult.Err -> _ui.update { it.copy(loading = false, error = result.message) }
            }
        }
    }

    private fun filterSearch(items: List<Lead>, q: String?): List<Lead> {
        if (q.isNullOrBlank()) return items
        val ql = q.lowercase()
        return items.filter {
            (it.company ?: "").lowercase().contains(ql) ||
                (it.website ?: "").lowercase().contains(ql) ||
                (it.email ?: "").lowercase().contains(ql) ||
                it.leadId.lowercase().contains(ql)
        }
    }

    private sealed interface ListResult {
        data class Ok(val items: List<Lead>, val offline: Boolean = false, val cachedAt: Long? = null) : ListResult
        data class Err(val message: String) : ListResult
    }
}
