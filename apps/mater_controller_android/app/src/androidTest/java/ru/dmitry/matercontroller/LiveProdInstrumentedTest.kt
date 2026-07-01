package ru.dmitry.matercontroller

import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import ru.dmitry.matercontroller.core.network.MaterApi
import ru.dmitry.matercontroller.core.network.PairingStartBody
import ru.dmitry.matercontroller.core.network.PairingCompleteBody
import java.util.concurrent.TimeUnit

/**
 * LiveProdInstrumentedTest — runs IN THE REAL ANDROID RUNTIME on the emulator/device and exercises
 * the ACTUAL MaterApi (Retrofit + OkHttp + kotlinx.serialization) against PRODUCTION. This is the
 * on-device proof that the Android networking + DTO stack works end-to-end: it is not a JVM mock.
 *
 * It performs READ assertions and a TEST_ONLY write→server-reread cycle (autopilot mode), all no-send.
 * Requires instrumentation args -e prodBase <url> and -e workerToken <token>; if absent the test is
 * skipped (assumeTrue) rather than failing, so CI without prod access stays green.
 *
 * Pairing uses the production /auth/pairing endpoints, so the owner-token write path is the same one
 * the app uses after the owner scans a code.
 */
class LiveProdInstrumentedTest {
    private val args = InstrumentationRegistry.getArguments()
    private val base = args.getString("prodBase") ?: System.getenv("MATER_PROD_BASE") ?: ""
    private val workerToken = args.getString("workerToken") ?: System.getenv("MATER_WORKER_TOKEN") ?: ""
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun apiWith(token: String?): MaterApi {
        val client = OkHttpClient.Builder()
            .addInterceptor(Interceptor { chain ->
                val b = chain.request().newBuilder()
                if (!token.isNullOrBlank()) b.header("Authorization", "Bearer $token")
                chain.proceed(b.build())
            })
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()
        return Retrofit.Builder()
            .baseUrl(if (base.endsWith("/")) base else "$base/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(MaterApi::class.java)
    }

    @Test
    fun liveReadAndTestOnlyWriteOnDevice() = runBlocking {
        assumeTrue("prodBase + workerToken instrumentation args required", base.isNotBlank() && workerToken.isNotBlank())
        val svc = apiWith(workerToken)

        // READ: real production through the actual MaterApi + DTOs
        val rel = svc.reliability()
        assertTrue("reliability 200", rel.isSuccessful && rel.body()?.ok == true)
        assertTrue("reliability real verdict", rel.body()!!.data!!.overall_health in listOf("HEALTHY", "DEGRADED", "DOWN", "UNKNOWN"))
        val cost = svc.costs()
        assertTrue("costs 200", cost.isSuccessful && cost.body()?.ok == true)
        assertTrue("costs total units >= 0", cost.body()!!.data!!.total_calculated_units >= 0)
        val push = svc.pushStatus()
        assertTrue("push 200", push.isSuccessful && push.body()?.ok == true)
        assertEquals("push honest CREDENTIAL_REQUIRED", "CREDENTIAL_REQUIRED", push.body()!!.data!!.delivery_state)
        val backup = svc.backupStatus()
        assertTrue("backup inventory present", (backup.body()?.data?.items?.size ?: 0) >= 1)

        // WRITE (TEST_ONLY): pair an owner device, set autopilot mode, reread to confirm
        val start = svc.pairingStart(PairingStartBody(deviceName = "rc3-instrumented"))
        assertTrue("pairing start 200", start.isSuccessful && start.body()?.data?.code != null)
        val code = start.body()!!.data!!.code
        val comp = svc.pairingComplete(PairingCompleteBody(code = code, deviceName = "rc3-instrumented"))
        val ownerToken = comp.body()?.data?.accessToken
        assertTrue("owner token issued", !ownerToken.isNullOrBlank())
        val ownerApi = apiWith(ownerToken)

        // set OBSERVE then reread
        val w1 = ownerApi.setAutopilotMode("rc3-instr-" + System.nanoTime(), ru.dmitry.matercontroller.core.network.AutopilotModeBody("OBSERVE"))
        assertTrue("autopilot OBSERVE 2xx", w1.isSuccessful && w1.body()?.ok == true)
        val rr1 = svc.ownerAutopilot()
        assertEquals("server reread OBSERVE", "OBSERVE", rr1.body()?.data?.mode)

        // restore MANAGED (default) then reread — leaves prod in its normal state
        val w2 = ownerApi.setAutopilotMode("rc3-instr-" + System.nanoTime(), ru.dmitry.matercontroller.core.network.AutopilotModeBody("MANAGED"))
        assertTrue("autopilot MANAGED 2xx", w2.isSuccessful && w2.body()?.ok == true)
        val rr2 = svc.ownerAutopilot()
        assertEquals("server reread MANAGED", "MANAGED", rr2.body()?.data?.mode)
    }
}
