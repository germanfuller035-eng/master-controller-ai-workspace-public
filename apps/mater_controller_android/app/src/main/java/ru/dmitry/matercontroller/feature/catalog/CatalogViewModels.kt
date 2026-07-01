package ru.dmitry.matercontroller.feature.catalog

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
import ru.dmitry.matercontroller.core.model.ProductCatalog
import ru.dmitry.matercontroller.core.model.ProductListItem
import javax.inject.Inject

/**
 * Product catalog list view model (Gate C1-A read-only). Read-through cache via the repository.
 * Filtering/search/sort happen on the cached list — no business truth on the client. Product data
 * comes only from the API/cache (never hardcoded).
 */
data class CatalogUi(
    val loading: Boolean = true,
    val error: String? = null,
    val catalog: ProductCatalog? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
    val statusFilter: String? = null,      // null = all, else ACTIVE/DRAFT/PLANNED
    val query: String = "",
) {
    val visibleItems: List<ProductListItem>
        get() {
            val all = catalog?.items.orEmpty()
            val byStatus = statusFilter?.let { f -> all.filter { it.status == f } } ?: all
            val q = query.trim().lowercase()
            val searched = if (q.isBlank()) byStatus else byStatus.filter {
                (it.name ?: "").lowercase().contains(q) ||
                    (it.short_description ?: "").lowercase().contains(q) ||
                    it.product_id.lowercase().contains(q)
            }
            // Stable sort: ACTIVE first, then DRAFT, then PLANNED, then by name.
            val order = mapOf("ACTIVE" to 0, "DRAFT" to 1, "PLANNED" to 2)
            return searched.sortedWith(compareBy({ order[it.status] ?: 9 }, { it.name ?: it.product_id }))
        }
}

@HiltViewModel
class CatalogListViewModel @Inject constructor(private val repo: MaterRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CatalogUi())
    val ui: StateFlow<CatalogUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.products()) {
                is DataResult.Success -> _ui.update {
                    it.copy(loading = false, catalog = r.data, offline = r.fromCache, cachedAt = r.cachedAt, error = null)
                }
                is DataResult.Error -> _ui.update {
                    it.copy(loading = false, error = ru.dmitry.matercontroller.core.ui.OwnerLocalization.renderErrorCodeRu(r.code))
                }
            }
        }
    }

    fun setStatusFilter(f: String?) = _ui.update { it.copy(statusFilter = if (it.statusFilter == f) null else f) }
    fun setQuery(q: String) = _ui.update { it.copy(query = q) }
}

data class ProductDetailUi(
    val loading: Boolean = true,
    val error: String? = null,
    val product: ru.dmitry.matercontroller.core.model.ProductDetail? = null,
    /** RC5: authoritative Russian presentation (GET /products/{code}/presentation). Preferred for display. */
    val presentation: ru.dmitry.matercontroller.core.model.ProductPresentationDto? = null,
    val offline: Boolean = false,
    val cachedAt: Long? = null,
)

@HiltViewModel
class ProductDetailViewModel @Inject constructor(
    private val repo: MaterRepository,
    savedStateHandle: androidx.lifecycle.SavedStateHandle,
) : ViewModel() {
    private val productId: String = savedStateHandle.get<String>("id").orEmpty()
    private val _ui = MutableStateFlow(ProductDetailUi())
    val ui: StateFlow<ProductDetailUi> = _ui.asStateFlow()

    init { refresh() }

    fun refresh() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            // RC5: presentation (Russian owner-facing) is the primary source for the detail screen.
            // The legacy /products/{id} detail is still loaded as a fallback for fields the
            // presentation doesn't carry (version/status). Neither is hardcoded.
            val pres = repo.productPresentation(productId)
            when (val r = repo.product(productId)) {
                is DataResult.Success -> _ui.update {
                    it.copy(
                        loading = false,
                        product = r.data,
                        presentation = (pres as? DataResult.Success)?.data ?: it.presentation,
                        offline = r.fromCache || (pres as? DataResult.Success)?.fromCache == true,
                        cachedAt = r.cachedAt ?: (pres as? DataResult.Success)?.cachedAt,
                    )
                }
                is DataResult.Error -> {
                    val presOk = (pres as? DataResult.Success)?.data
                    if (presOk != null) {
                        _ui.update { it.copy(loading = false, presentation = presOk, offline = pres.fromCache, cachedAt = pres.cachedAt, error = null) }
                    } else {
                        _ui.update { it.copy(loading = false, error = ru.dmitry.matercontroller.core.ui.OwnerLocalization.renderErrorCodeRu(r.code)) }
                    }
                }
            }
        }
    }
}
