package ru.dmitry.matercontroller.core.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import ru.dmitry.matercontroller.core.designsystem.ThemeMode
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "mater_settings")

/** Non-secret preferences in DataStore: base URL, theme, refresh, notifications. */
@Singleton
class SettingsStore @Inject constructor(@ApplicationContext private val context: Context) {
    private val ds = context.dataStore

    val baseUrl: Flow<String> = ds.data.map { it[BASE_URL] ?: "" }
    val themeMode: Flow<ThemeMode> = ds.data.map { runCatching { ThemeMode.valueOf(it[THEME] ?: "DARK") }.getOrDefault(ThemeMode.DARK) }
    val bgRefresh: Flow<Boolean> = ds.data.map { it[BG_REFRESH] ?: true }
    val notifications: Flow<Boolean> = ds.data.map { it[NOTIFICATIONS] ?: true }

    suspend fun setBaseUrl(v: String) = ds.edit { it[BASE_URL] = v.trim() }
    suspend fun setTheme(v: ThemeMode) = ds.edit { it[THEME] = v.name }
    suspend fun setBgRefresh(v: Boolean) = ds.edit { it[BG_REFRESH] = v }
    suspend fun setNotifications(v: Boolean) = ds.edit { it[NOTIFICATIONS] = v }

    companion object {
        private val BASE_URL = stringPreferencesKey("base_url")
        private val THEME = stringPreferencesKey("theme_mode")
        private val BG_REFRESH = booleanPreferencesKey("bg_refresh")
        private val NOTIFICATIONS = booleanPreferencesKey("notifications")
    }
}
