package ru.dmitry.matercontroller.core.network

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Provides a MaterApi bound to the current base URL. Retrofit's base URL is fixed at
 * build time, so we rebuild the client when the base URL changes (rare — only on
 * connect / profile switch).
 */
@Singleton
class ApiProvider @Inject constructor(
    private val baseUrlHolder: BaseUrlHolder,
    private val authInterceptor: AuthInterceptor,
    private val json: Json,
) {
    @Volatile private var cachedBase: String? = null
    @Volatile private var cached: MaterApi? = null

    fun api(): MaterApi {
        val base = baseUrlHolder.apiBase
        val existing = cached
        if (existing != null && cachedBase == base) return existing
        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        val api = Retrofit.Builder()
            .baseUrl(base)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MaterApi::class.java)
        cached = api
        cachedBase = base
        return api
    }
}
