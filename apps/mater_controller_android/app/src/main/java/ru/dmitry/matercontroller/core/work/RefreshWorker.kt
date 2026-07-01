package ru.dmitry.matercontroller.core.work

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository

/**
 * Periodic, READ-ONLY refresh: pulls status/overview so counts stay fresh.
 * It never sends email, never approves, never changes commercial state.
 */
@HiltWorker
class RefreshWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val repo: MaterRepository,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (!repo.isPaired) return Result.success()
        val r = repo.status()
        return if (r is DataResult.Success) Result.success() else Result.retry()
    }
}
