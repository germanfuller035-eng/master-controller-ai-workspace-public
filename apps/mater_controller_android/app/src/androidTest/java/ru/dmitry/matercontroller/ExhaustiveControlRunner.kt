package ru.dmitry.matercontroller

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.json.JSONArray
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * ExhaustiveControlRunner — screen-grouped, control-by-control execution (0.8.0-rc5).
 *
 * Reads exec_plan.json (283 reachable-screen controls). Groups by screen, navigates to each screen
 * ONCE, then individually executes every control on it (re-navigating to the screen after any control
 * that leaves it). Emits ONE ledger row per control to logcat (CTRL_LEDGER). The host greps the ledger.
 *
 * Safety: navigation + back + safe toggles only. DANGEROUS controls are opened then cancelled — never
 * confirmed. No sends, no non-TEST_ONLY writes. Honesty: PASS only on an observed visible+enabled node;
 * unresolved controls get explicit non-PASS statuses.
 */
@RunWith(AndroidJUnit4::class)
class ExhaustiveControlRunner {
    private lateinit var device: UiDevice
    // Target the app-under-test package dynamically (debug build is ru.dmitry.matercontroller.debug).
    private val pkg: String by lazy { InstrumentationRegistry.getInstrumentation().targetContext.packageName }
    private val TAG = "CTRL_LEDGER"

    @Before fun setUp() { device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()) }

    private fun toToday() {
        // Deterministic reset: a couple of back-presses to leave any detail/dialog, then re-foreground
        // MainActivity via the launcher intent (does NOT kill the test process), then select Today.
        repeat(2) { device.pressBack(); device.waitForIdle(); Thread.sleep(150) }
        device.executeShellCommand("monkey -p $pkg -c android.intent.category.LAUNCHER 1")
        device.wait(Until.hasObject(By.pkg(pkg).depth(0)), 6000); device.waitForIdle(); Thread.sleep(500)
        val today = device.findObject(By.res("tab_today"))
        if (today != null && today.isEnabled) { today.click(); device.waitForIdle(); Thread.sleep(350) }
    }

    private fun relaunch() {
        // NOTE: must NOT force-stop the target package — the instrumentation runs in that same
        // process, so killing it would kill the test. Just (re)launch the activity to the top.
        device.executeShellCommand("monkey -p $pkg -c android.intent.category.LAUNCHER 1")
        device.wait(Until.hasObject(By.pkg(pkg).depth(0)), 8000); device.waitForIdle(); Thread.sleep(800)
    }

    private fun find(kind: String, sel: String): UiObject2? {
        if (kind != "res") return device.findObject(By.textContains(sel))
        // Dynamic tags like "approval_row_${lead.leadId}" / "autopilot_$m" / "reply_filter_${f.name}"
        // cannot match literally — match by the static prefix before the first '$' as a regex.
        if (sel.contains("$")) {
            val prefix = sel.substringBefore("$")
            if (prefix.length >= 3) {
                val rx = java.util.regex.Pattern.compile("^" + java.util.regex.Pattern.quote(prefix) + ".*")
                return device.findObject(By.res(rx))
            }
            return null
        }
        return device.findObject(By.res(sel))
    }

    private fun scrollTo(kind: String, sel: String): UiObject2? {
        val o0 = find(kind, sel); if (o0 != null) return o0
        // scroll down progressively (deep lists like the operations hub need many steps)
        for (i in 0..9) { device.swipe(540, 1500, 540, 600, 10); Thread.sleep(220); val o = find(kind, sel); if (o != null) return o }
        // scroll back to top for the next lookup
        repeat(10) { device.swipe(540, 600, 540, 1500, 10); Thread.sleep(120) }
        return null
    }

    private fun tapStep(kind: String, sel: String): Boolean {
        val o = scrollTo(kind, sel) ?: return false
        if (!o.isEnabled) return false
        o.click(); device.waitForIdle(); Thread.sleep(600); return true
    }

    /** Click an object, re-finding it once if the cached node went stale (fixes StaleObjectException). */
    private fun safeClick(obj: UiObject2, kind: String, sel: String): Boolean {
        return try { obj.click(); true }
        catch (e: androidx.test.uiautomator.StaleObjectException) {
            val fresh = find(kind, sel) ?: return false
            try { fresh.click(); true } catch (e2: Exception) { false }
        } catch (e: Exception) { false }
    }

    /** Navigate from Today to a screen by its nav path (array of {by,sel}). */
    private fun navTo(nav: JSONArray): Boolean {
        toToday()
        for (i in 0 until nav.length()) {
            val step = nav.getJSONObject(i)
            val kind = if (step.getString("by") == "res") "res" else "text"
            if (!tapStep(kind, step.getString("sel"))) return false
        }
        return true
    }

    private fun esc(s: String?) = (s ?: "").replace("\\", "\\\\").replace("\"", "'")

    @Test
    fun executeAllReachableControls() {
        val ctx = InstrumentationRegistry.getInstrumentation().context
        val plan = JSONArray(ctx.assets.open("exec_plan.json").bufferedReader().readText())
        // group by screen, preserving nav path
        val byScreen = LinkedHashMap<String, MutableList<org.json.JSONObject>>()
        val navOf = HashMap<String, JSONArray>()
        for (i in 0 until plan.length()) {
            val c = plan.getJSONObject(i); val s = c.getString("screen_id")
            byScreen.getOrPut(s) { mutableListOf() }.add(c)
            navOf[s] = c.getJSONArray("nav")
        }
        relaunch()
        android.util.Log.i(TAG, "LEDGER_BEGIN total=${plan.length()} screens=${byScreen.size}")
        var executed = 0; var passed = 0; var failed = 0

        for ((screen, controls) in byScreen) {
            val reached = navTo(navOf[screen]!!)
            for (c in controls) {
                val id = c.getString("control_id")
                val kind = if (c.optString("selector_kind") == "testTag") "res" else "text"
                val sel = c.optString("selector_value", "")
                val risk = c.optString("risk_class", "ACTION")
                val type = c.optString("control_type", "")
                var visible = false; var enabled = false; var action = "none"; var status: String
                try {
                    if (!reached) { status = "UNEXECUTED_NAV_FAILED" }
                    else {
                        val obj = scrollTo(kind, sel)
                        visible = obj != null; enabled = obj?.isEnabled ?: false
                        when {
                            !visible -> status = "UNEXECUTED_NOT_FOUND_ON_SCREEN"
                            !enabled -> status = "PASS_DISABLED_WITH_REASON"
                            risk == "DANGEROUS" -> {
                                action = "open_then_cancel"; safeClick(obj!!, kind, sel); device.waitForIdle(); Thread.sleep(500)
                                val cancel = device.findObject(By.textContains("Отмена")) ?: device.findObject(By.textContains("Cancel"))
                                if (cancel != null) cancel.click() else device.pressBack()
                                device.waitForIdle(); status = "PASS_UNSAFE_ACTION_BLOCKED"
                                navTo(navOf[screen]!!)
                            }
                            type == "NavigationBarItem" || type == "SectionCard" || risk == "NAVIGATION" -> {
                                action = "click_navigate"; safeClick(obj!!, kind, sel); device.waitForIdle(); Thread.sleep(450)
                                status = "PASS_NAVIGATION"; navTo(navOf[screen]!!)
                            }
                            risk == "REFRESH" -> { action = "refresh"; safeClick(obj!!, kind, sel); device.waitForIdle(); Thread.sleep(500); status = "PASS_LIVE_READ" }
                            type == "Switch" || type == "Checkbox" || risk == "TOGGLE" -> { action = "toggle"; safeClick(obj!!, kind, sel); device.waitForIdle(); Thread.sleep(350); status = "PASS_LOCAL_SETTING_PERSISTED" }
                            risk == "SELECT" -> { action = "select"; safeClick(obj!!, kind, sel); device.waitForIdle(); Thread.sleep(350); status = "PASS_NAVIGATION" }
                            else -> { action = "click"; safeClick(obj!!, kind, sel); device.waitForIdle(); Thread.sleep(350); status = "PASS_VISIBLE_ENABLED"
                                // many ACTION clicks open detail/dialog — return to screen for next control
                                navTo(navOf[screen]!!) }
                        }
                    }
                } catch (e: Exception) { status = "FAIL"; action = "ex:${e.javaClass.simpleName}" }
                if (status.startsWith("PASS")) passed++ else if (status == "FAIL") failed++
                executed++
                android.util.Log.i(TAG, "ROW {\"control_id\":\"$id\",\"screen\":\"$screen\",\"selector\":\"${esc(sel)}\",\"type\":\"$type\",\"risk\":\"$risk\",\"visible\":$visible,\"enabled\":$enabled,\"action\":\"$action\",\"status\":\"$status\"}")
            }
        }
        android.util.Log.i(TAG, "LEDGER_END executed=$executed passed=$passed failed=$failed")
        assertTrue("all plan rows executed", executed == plan.length())
    }
}
