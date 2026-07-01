package ru.dmitry.matercontroller.core.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import ru.dmitry.matercontroller.MainActivity
import ru.dmitry.matercontroller.R
import ru.dmitry.matercontroller.core.model.OwnerEvent

/**
 * Owner operational notifications (0.8.0-rc3). Posts P0/P1 owner-center events as Android system
 * notifications via the WorkManager fallback (works without Firebase). Deduplicates by event_id so
 * a periodic re-poll never double-posts. NEVER renders client/outbound content — owner ops only.
 *
 * Two channels: P0 (critical, high importance, bypasses quiet hours) and P1 (default importance,
 * obeys configured rules client-side).
 */
object OwnerNotifier {
    const val CHANNEL_P0 = "owner_p0_critical"
    const val CHANNEL_P1 = "owner_p1_important"
    private const val PREFS = "owner_notify_dedup"
    private const val KEY_SEEN = "seen_event_ids"
    private const val MAX_SEEN = 200

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_P0, "Критичные (P0)", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Критические инциденты и события, требующие немедленного внимания"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_P1, "Важные (P1)", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Важные события: положительные ответы, запросы цены, SLA решений"
            },
        )
    }

    private fun seen(ctx: Context): MutableSet<String> {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return p.getStringSet(KEY_SEEN, emptySet())!!.toMutableSet()
    }

    private fun persist(ctx: Context, ids: Set<String>) {
        val trimmed = if (ids.size > MAX_SEEN) ids.toList().takeLast(MAX_SEEN).toSet() else ids
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putStringSet(KEY_SEEN, trimmed) }
    }

    /** Clear dedup state for an event once the owner has acted on it (mark-read flow). */
    fun forget(ctx: Context, eventId: String) {
        val s = seen(ctx); if (s.remove(eventId)) persist(ctx, s)
    }

    /**
     * Post any not-yet-seen P0/P1 events. Returns the count actually posted (new events only).
     * P0 always posts; P1 posts unless quietHours is true (P0 ignores quiet hours).
     */
    fun postNewEvents(ctx: Context, events: List<OwnerEvent>, quietHours: Boolean = false): Int {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return 0
        ensureChannels(ctx)
        val s = seen(ctx)
        var posted = 0
        for (e in events) {
            val sev = (e.severity ?: "").uppercase()
            if (sev != "P0" && sev != "P1") continue
            if (s.contains(e.event_id)) continue
            if (sev == "P1" && quietHours) { continue } // P1 obeys quiet hours; do not mark seen so it can post later
            val channel = if (sev == "P0") CHANNEL_P0 else CHANNEL_P1
            val intent = Intent(ctx, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("deep_link", e.deep_link ?: "")
                putExtra("event_id", e.event_id)
            }
            val pi = PendingIntent.getActivity(ctx, e.event_id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val notif = NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_owner)
                .setContentTitle(e.title_ru ?: "Master Controller")
                .setContentText(e.summary_ru ?: "")
                .setStyle(NotificationCompat.BigTextStyle().bigText(e.summary_ru ?: e.title_ru ?: ""))
                .setPriority(if (sev == "P0") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
                .setCategoryCompat(sev)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build()
            try {
                NotificationManagerCompat.from(ctx).notify(e.event_id.hashCode(), notif)
                s.add(e.event_id)
                posted += 1
            } catch (_: SecurityException) { /* POST_NOTIFICATIONS revoked at runtime */ }
        }
        if (posted > 0) persist(ctx, s)
        return posted
    }

    private fun NotificationCompat.Builder.setCategoryCompat(sev: String): NotificationCompat.Builder =
        setCategory(if (sev == "P0") NotificationCompat.CATEGORY_ERROR else NotificationCompat.CATEGORY_STATUS)
}
