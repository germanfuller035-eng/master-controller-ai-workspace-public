package ru.dmitry.matercontroller.core.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Keystore-backed secure storage for device tokens. Tokens are never stored in
 * plain text; the master key lives in the Android Keystore.
 */
@Singleton
class SecureTokenStore @Inject constructor(@ApplicationContext context: Context) {

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "mater_secure_tokens",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        set(v) = prefs.edit().putString(KEY_ACCESS, v).apply()

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(v) = prefs.edit().putString(KEY_REFRESH, v).apply()

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE, null)
        set(v) = prefs.edit().putString(KEY_DEVICE, v).apply()

    /** Owner-friendly device name captured at pairing (e.g. "Samsung A56"). Not a credential. */
    var deviceName: String?
        get() = prefs.getString(KEY_DEVICE_NAME, null)
        set(v) = prefs.edit().putString(KEY_DEVICE_NAME, v).apply()

    val isPaired: Boolean get() = !accessToken.isNullOrBlank()

    fun saveTokens(access: String, refresh: String, deviceId: String) {
        prefs.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .putString(KEY_DEVICE, deviceId)
            .apply()
    }

    /** Persist tokens plus the owner-friendly device name in one transaction. */
    fun saveTokens(access: String, refresh: String, deviceId: String, deviceName: String?) {
        prefs.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .putString(KEY_DEVICE, deviceId)
            .also { if (!deviceName.isNullOrBlank()) it.putString(KEY_DEVICE_NAME, deviceName) }
            .apply()
    }

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_DEVICE = "device_id"
        private const val KEY_DEVICE_NAME = "device_name"
    }
}
