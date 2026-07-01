package ru.dmitry.matercontroller.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import ru.dmitry.matercontroller.core.data.SecureTokenStore
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the currently configured API base URL at runtime (set after pairing/connect,
 * and restored from persisted settings on cold start). There is intentionally NO
 * localhost/LAN default: an unconfigured holder is empty, so the app routes to the
 * connection screen instead of silently calling 127.0.0.1 (the cold-start bug).
 */
@Singleton
class BaseUrlHolder @Inject constructor() {
    private val ref = AtomicReference("")
    var url: String
        get() = ref.get()
        set(v) {
            ref.set(normalizeOrigin(v))
        }
    /** True once a non-empty base URL has been configured/restored. */
    val isConfigured: Boolean get() = ref.get().isNotBlank()
    /** Retrofit base must include the version path. Accepts host or host/api/v1 input. */
    val apiBase: String get() {
        val origin = ref.get().trimEnd('/')
        return if (origin.isEmpty()) "" else "$origin/api/v1/"
    }

    companion object {
        /**
         * Normalize user/persisted input to a bare origin (scheme://host[:port]) with a
         * trailing slash. Tolerates a pasted ".../api/v1" suffix and surrounding spaces so
         * both https://host and https://host/api/v1 work identically.
         */
        fun normalizeOrigin(input: String): String {
            var u = input.trim()
            if (u.isEmpty()) return ""
            // strip a trailing /api/v1 (with optional trailing slash) if pasted in
            u = u.replace(Regex("/+api/v1/?$", RegexOption.IGNORE_CASE), "")
            u = u.trimEnd('/')
            if (u.isEmpty()) return ""
            return "$u/"
        }
    }
}

/**
 * Adds the Bearer token and transparently refreshes it once on 401.
 * Pairing/refresh/health endpoints are exempt from attaching a (possibly stale) token.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokens: SecureTokenStore,
    private val refresher: TokenRefresher,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val path = original.url.encodedPath
        val isAuthFree = path.endsWith("/health") ||
            path.contains("/auth/pairing/") ||
            path.endsWith("/auth/refresh")

        val access = tokens.accessToken
        val req = if (!isAuthFree && !access.isNullOrBlank())
            original.newBuilder().header("Authorization", "Bearer $access").build()
        else original

        var resp = chain.proceed(req)
        if (resp.code == 401 && !isAuthFree && !tokens.refreshToken.isNullOrBlank()) {
            resp.close()
            val newAccess = runBlocking { refresher.refresh() }
            if (!newAccess.isNullOrBlank()) {
                val retry = original.newBuilder().header("Authorization", "Bearer $newAccess").build()
                resp = chain.proceed(retry)
            } else {
                resp = chain.proceed(req) // surface the 401 to the caller
            }
        }
        return resp
    }
}
