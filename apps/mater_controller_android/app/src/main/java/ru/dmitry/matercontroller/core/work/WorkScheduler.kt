package ru.dmitry.matercontroller.core.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Schedules the read-only background workers (0.8.0-rc3):
 *  - RefreshWorker: keeps cached counts fresh.
 *  - NotificationSyncWorker: the FCM-independent push fallback that posts P0/P1 owner events.
 * Both require network and use exponential backoff. Idempotent: KEEP policy means re-scheduling
 * on every app start never creates duplicates.
 */
object WorkScheduler {
    private const val REFRESH = "owner_refresh_periodic"
    private const val NOTIFY = "owner_notification_sync_periodic"

    fun scheduleAll(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        val refresh = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES)
            .setConstraints(net)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        wm.enqueueUniquePeriodicWork(REFRESH, ExistingPeriodicWorkPolicy.KEEP, refresh)

        // 15 min is the WorkManager minimum periodic interval; the push fallback runs as often as allowed.
        val notify = PeriodicWorkRequestBuilder<NotificationSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(net)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        wm.enqueueUniquePeriodicWork(NOTIFY, ExistingPeriodicWorkPolicy.KEEP, notify)
    }
}
