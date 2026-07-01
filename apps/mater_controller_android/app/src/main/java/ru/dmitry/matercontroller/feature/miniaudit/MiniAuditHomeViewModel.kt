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
import ru.dmitry.matercontroller.core.model.MiniAuditStatus
import ru.dmitry.matercontroller.core.model.NextActionData
import ru.dmitry.matercontroller.core.model.LeadCountReconciliation
import ru.dmitry.matercontroller.core.model.SendReconciliation
import javax.inject.Inject

data class MiniAuditHomeUi(
    val loading: Boolean = true,
    val error: String? = null,
    val status: MiniAuditStatus? = null,
    val nextAction: NextActionData? = null,
    val leadCount: LeadCountReconciliation? = null,
    val sendRecon: SendReconciliation? = null,
)

@HiltViewModel
class MiniAuditHomeViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(MiniAuditHomeUi())
    val ui: StateFlow<MiniAuditHomeUi> = _ui.asStateFlow()
    init { refresh() }
    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val st = repo.status()
            val na = repo.nextAction()
            val lc = repo.leadCountReconciliation()
            val sr = repo.sendReconciliation()
            when (st) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        loading = false, status = st.data,
                        nextAction = (na as? DataResult.Success)?.data,
                        leadCount = (lc as? DataResult.Success)?.data,
                        sendRecon = (sr as? DataResult.Success)?.data,
                    )
                }
                is DataResult.Error -> _ui.update { it.copy(loading = false, error = st.message) }
            }
        }
    }
}
