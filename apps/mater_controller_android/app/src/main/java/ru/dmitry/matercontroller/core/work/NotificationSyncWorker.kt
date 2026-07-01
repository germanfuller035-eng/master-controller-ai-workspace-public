package ru.dmitry.matercontroller.core.work

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import ru.dmitry.matercontroller.core.data.DataResult
import ru.dmitry.matercontroller.core.data.MaterRepository
import ru.dmitry.matercontroller.core.notify.OwnerNotifier
import java.util.Calendar

/**
 * NotificationSyncWorker (0.8.0-rc3) — the WorkManager PUSH FALLBACK that works WITHOUT Firebase.
 * Periodically pulls fresh owner-center events from the production API and posts unread P0/P1 events
 * as Android system notifications (deduplicated by event_id). P0 ignores quiet hours; P1 obeys them.
 *
 * READ-ONLY: it never sends, approves, or mutates commercial state. It only reads events and posts
 * local notifications. When unpaired it no-ops successfully.
 */
@HiltWorker
class NotificationSyncWorker @AssistedInject constructor(
    @Assisted private val context: Context,
    @Assisted params: WorkerParameters,
    private val repo: MaterRepository,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!repo.isPaired) return Result.success()
        return when (val r = repo.ownerEvents()) {
            is DataResult.Success -> {
                OwnerNotifier.postNewEvents(context, r.data.items, quietHours = inQuietHours())
                Result.success()
            }
            is DataResult.Error -> Result.retry() // transient; WorkManager backoff
        }
    }

    // Quiet hours 23:00–07:00 local for P1 (P0 always posts). Deterministic, no config dependency.
    private fun inQuietHours(): Boolean {
        val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return h >= 23 || h < 7
    }
}
