package ru.dmitry.matercontroller.core.network

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import ru.dmitry.matercontroller.core.data.SecureTokenStore
import java.net.Proxy
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Refreshes the access token using the refresh token. Uses a bare Retrofit (no
 * AuthInterceptor) to avoid a circular dependency with the interceptor.
 */
@Singleton
class TokenRefresher @Inject constructor(
    private val tokens: SecureTokenStore,
    private val baseUrlHolder: BaseUrlHolder,
    private val json: Json,
) {
    suspend fun refresh(): String? {
        val rt = tokens.refreshToken ?: return null
        return try {
            val api = bareApi()
            val resp = api.refresh(RefreshBody(rt))
            val body = resp.body()
            if (resp.isSuccessful && body?.ok == true && body.data != null) {
                tokens.accessToken = body.data.accessToken
                body.data.accessToken
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun bareApi(): MaterApi {
        val client = OkHttpClient.Builder()
            .proxy(Proxy.NO_PROXY)
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrlHolder.apiBase)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MaterApi::class.java)
    }
}
