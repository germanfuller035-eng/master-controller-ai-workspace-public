package ru.dmitry.matercontroller.feature.replies

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
import ru.dmitry.matercontroller.core.model.ReplyCounts
import ru.dmitry.matercontroller.core.model.ReplyItem
import javax.inject.Inject

enum class ReplyFilter(val label: String, val category: String?, val status: String?) {
    OPEN("Новые", null, "new"),
    ALL("Все", null, null),
    INTERESTED("Интерес", "interested", null),
    NOT_INTERESTED("Отказ", "not_interested", null),
    BOUNCE("Недоставка", "bounce", null),
    UNMATCHED("Не определено", "unmatched", null),
}

data class RepliesUi(
    val loading: Boolean = true,
    val error: String? = null,
    val items: List<ReplyItem> = emptyList(),
    val counts: ReplyCounts? = null,
    val filter: ReplyFilter = ReplyFilter.OPEN,
    val apiOk: Boolean = false,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class RepliesViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(RepliesUi())
    val ui: StateFlow<RepliesUi> = _ui.asStateFlow()

    init { refresh() }

    fun setFilter(f: ReplyFilter) {
        if (f == _ui.value.filter) return
        _ui.update { it.copy(filter = f) }
        refresh()
    }

    fun refresh() {
        val f = _ui.value.filter
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val countsRes = repo.replyCounts()
            val counts = (countsRes as? DataResult.Success)?.data
            val res = if (f == ReplyFilter.OPEN) repo.openReplies() else repo.replies(f.category, f.status)
            when (res) {
                is DataResult.Success -> _ui.update {
                    it.copy(loading = false, items = res.data.items, counts = counts, apiOk = !res.fromCache, error = null, offline = res.fromCache, cachedAt = res.cachedAt)
                }
                is DataResult.Error -> _ui.update {
                    it.copy(loading = false, error = "Нет соединения и сохранённых данных.", apiOk = false)
                }
            }
        }
    }
}
