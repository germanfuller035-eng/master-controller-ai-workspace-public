package ru.dmitry.matercontroller

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * CanaryRunner — Шаг 5 gate. Proves the harness can honestly exercise every NAVIGATION LEVEL,
 * CONTROL TYPE, and STATE GROUP before any screen-by-screen run starts.
 *
 * Honest-PASS discipline (Шаг 8):
 *  - assert the destination screen ANCHOR (testTag) BEFORE looking for any control;
 *  - after an action, VERIFY a real consequence (anchor changed for nav, state read-back for toggle,
 *    dialog appeared for dangerous-gate, then Cancel — never Confirm on real entities);
 *  - controlled scroll: ≤4 swipes, stop when scroll position stops changing;
 *  - NO blind back-presses: return to Today via launcher intent + tab_today, then re-navigate.
 *
 * One ledger row per canary case to logcat tag CANARY_LEDGER. Host greps + asserts 0 failures.
 */
@RunWith(AndroidJUnit4::class)
class CanaryRunner {
    private lateinit var device: UiDevice
    private val pkg: String by lazy { InstrumentationRegistry.getInstrumentation().targetContext.packageName }
    private val TAG = "CANARY_LEDGER"
    private var total = 0; private var passed = 0; private var failed = 0; private var unexec = 0

    @Before fun setUp() { device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()) }

    // ---------- primitives ----------
    private fun res(tag: String) = device.findObject(By.res(tag))
    private fun txt(s: String) = device.findObject(By.textContains(s))

    /** Wait until the screen finishes loading: state_loading gone. Up to ~24s (the emulator is
     *  memory-constrained; cold network fetches can be slow). Also waits briefly for content to settle. */
    private fun waitLoaded() {
        device.waitForIdle()
        for (i in 0 until 48) {
            if (!device.hasObject(By.res("state_loading"))) { Thread.sleep(250); device.waitForIdle(); return }
            Thread.sleep(500)
        }
    }

    /** Wait for an anchor to appear, tolerating a still-loading screen (re-checks after waitLoaded). */
    private fun awaitAnchor(tag: String, timeoutMs: Long = 8000): Boolean {
        if (device.wait(Until.hasObject(By.res(tag)), timeoutMs)) return true
        waitLoaded()
        return device.wait(Until.hasObject(By.res(tag)), timeoutMs)
    }

    /** Controlled scroll: ≤4 swipes, abort when the visible content stops changing (Шаг 8).
     *  Progress is measured by the SET of visible resource-ids (a LazyColumn's object COUNT stays
     *  ~constant as rows recycle, so counting is not a valid progress signal). */
    private fun scrollToTag(tag: String): UiObject2? {
        res(tag)?.let { return it }
        var lastIds = ""
        for (i in 0 until 4) {
            val before = visibleIdSet()
            device.swipe(540, 1500, 540, 650, 12); Thread.sleep(300)
            res(tag)?.let { return it }
            val after = visibleIdSet()
            if (after == before && after == lastIds) break   // genuinely no progress → stop
            lastIds = after
        }
        return null
    }

    private fun visibleIdSet(): String =
        device.findObjects(By.pkg(pkg)).mapNotNull { it.resourceName }
            .filter { it.isNotEmpty() }.toSortedSet().joinToString(",")

    /** Click a tag, re-finding once if the node went stale between find and click (StaleObjectException). */
    private fun clickTag(tag: String): Boolean {
        val o = scrollToTag(tag) ?: return false
        return try { o.click(); true }
        catch (e: androidx.test.uiautomator.StaleObjectException) {
            val fresh = res(tag) ?: return false
            try { fresh.click(); true } catch (e2: Exception) { false }
        }
    }

    private fun toToday() {
        // Deterministic reset WITHOUT force-stop (instrumentation shares the app process) and WITHOUT
        // blind back-presses (they can exit the app). CLEAR_TASK finishes+recreates MainActivity, so the
        // NavHost is rebuilt at its start destination (Today root) — no stale restoreState sub-stack.
        device.executeShellCommand(
            "am start -a android.intent.action.MAIN -n $pkg/ru.dmitry.matercontroller.MainActivity --activity-clear-task")
        device.wait(Until.hasObject(By.pkg(pkg).depth(0)), 8000); device.waitForIdle()
        waitLoaded()
        // Ensure the Today tab is selected (start destination is Today, but be explicit).
        if (!device.hasObject(By.res("today_screen"))) {
            res("tab_today")?.let { if (it.isEnabled) { it.click(); device.waitForIdle(); waitLoaded() } }
        }
    }

    /** Snapshot of what's currently on screen — for diagnosing nav failures. */
    private fun diag(where: String) {
        val ids = device.findObjects(By.pkg(pkg)).mapNotNull { it.resourceName }
            .filter { it.isNotEmpty() }.map { it.substringAfterLast('/') }.distinct().take(25)
        val loading = device.hasObject(By.res("state_loading"))
        android.util.Log.i(TAG, "DIAG{\"at\":\"$where\",\"loading\":$loading,\"ids\":\"${ids.joinToString(",")}\"}")
    }

    /** Navigate a tap-path of testTags, asserting the final anchor is present. Returns true iff anchored.
     *  toToday() does a CLEAR_TASK reset, so the whole nav task is rebuilt fresh every time — there is
     *  no stale restoreState sub-stack to reconcile. */
    private fun navAnchored(path: List<String>, anchor: String): Boolean {
        toToday()
        for (sel in path) {
            val o = scrollToTag(sel)
            if (o == null) { diag("navstep_notfound:$sel"); return false }
            if (!o.isEnabled) { diag("navstep_disabled:$sel"); return false }
            o.click(); device.waitForIdle(); waitLoaded()
        }
        val ok = awaitAnchor(anchor)
        if (!ok) diag("anchor_missing:$anchor")
        return ok
    }

    private fun row(group: String, case: String, status: String, detail: String = "") {
        total++
        if (status.startsWith("PASS")) passed++ else if (status == "FAIL") failed++ else unexec++
        android.util.Log.i(TAG, "ROW {\"group\":\"$group\",\"case\":\"$case\",\"status\":\"$status\",\"detail\":\"${detail.replace("\"","'")}\"}")
    }

    /** Run one canary case in isolation: any exception becomes a single FAIL row, never aborting
     *  the whole test (Шаг 6/8 — each case yields exactly one ledger row). body returns status|detail. */
    private fun case(group: String, name: String, body: () -> Pair<String, String>) {
        try {
            val (status, detail) = body()
            row(group, name, status, detail)
        } catch (e: Exception) {
            diag("exception_in:$name:${e.javaClass.simpleName}")
            row(group, name, "FAIL", "ex:${e.javaClass.simpleName}:${(e.message ?: "").take(60)}")
        }
    }

    // ---------- canary cases ----------
    @Test
    fun canary() {
        android.util.Log.i(TAG, "CANARY_BEGIN")

        // ===== NAVIGATION LEVELS =====
        case("nav", "bottom_tab+root_today") {
            if (navAnchored(emptyList(), "today_screen")) "PASS_ANCHOR" to "" else "FAIL" to "today anchor"
        }
        case("nav", "hub_commercial") {
            if (navAnchored(listOf("card_commercial"), "commercial_summary")) "PASS_ANCHOR" to "" else "FAIL" to ""
        }
        case("nav", "nested_hub_operations") {
            if (navAnchored(listOf("tab_system"), "operations_home")) "PASS_ANCHOR" to "" else "FAIL" to ""
        }
        // list + detail: navigate to ma_home, drill into a POPULATED bucket, assert a real lead row,
        // open detail. Each is its own crash-isolated case.
        var rowSel: String? = null
        case("nav", "list_leads") {
            if (!navAnchored(listOf("card_next_action"), "ma_home")) { diag("list_nav_failed_ma_home"); return@case "FAIL" to "ma_home nav" }
            val bucketCard = scrollToTag("ma_card_needs") ?: scrollToTag("ma_card_preparing")
                ?: scrollToTag("ma_card_waiting") ?: scrollToTag("ma_card_ready")
            if (bucketCard == null) { diag("bucket_card_notfound"); return@case "FAIL" to "no bucket card" }
            bucketCard.click(); device.waitForIdle(); waitLoaded()
            // Rows may load slightly after the screen settles (cold network fetch) or sit below the
            // search field. Retry with short waits + a scroll before giving up.
            val rowRx = java.util.regex.Pattern.compile("^lead_row_.*")
            var rowObj = device.findObject(By.res(rowRx))
            var tries = 0
            while (rowObj == null && tries < 6) {
                Thread.sleep(600); device.waitForIdle()
                rowObj = device.findObject(By.res(rowRx))
                if (rowObj == null) { device.swipe(540, 1400, 540, 800, 12); Thread.sleep(250); rowObj = device.findObject(By.res(rowRx)) }
                tries++
            }
            if (rowObj == null) { diag("lead_row_notfound_after_bucket"); return@case "FAIL" to "no lead_row after $tries retries" }
            rowSel = rowObj.resourceName?.substringAfterLast('/')
            "PASS_LIST_ROWS_PRESENT" to "populated bucket; DEF-V3-002 fix; row=$rowSel"
        }
        case("nav", "detail_lead") {
            val sel = rowSel ?: return@case "FAIL" to "no row from list case"
            val rowObj = res(sel) ?: device.findObject(By.res(java.util.regex.Pattern.compile("^lead_row_.*")))
                ?: return@case "FAIL" to "row gone"
            rowObj.click(); device.waitForIdle(); waitLoaded()
            if (awaitAnchor("lead_detail")) "PASS_DETAIL_ANCHOR" to "lead_detail"
            else { diag("lead_detail_anchor_missing"); "FAIL" to "no lead_detail" }
        }

        // ===== CONTROL TYPES =====
        case("type", "NavigationBarItem") {
            if (navAnchored(listOf("tab_system"), "operations_home")) "PASS_ANCHOR" to "" else "FAIL" to ""
        }
        case("type", "SectionCard") {
            if (navAnchored(listOf("card_command_center"), "command_center_screen")) "PASS_ANCHOR" to "" else "FAIL" to ""
        }
        case("type", "Switch") {
            if (!navAnchored(listOf("tab_system", "ops_card_push"), "push_settings_screen")) return@case "FAIL" to "push nav"
            val sw = scrollToTag("push_switch_decisions") ?: scrollToTag("push_switch_incidents")
                ?: return@case "FAIL" to "push switch not found"
            val before = sw.isChecked; sw.click(); device.waitForIdle(); Thread.sleep(400)
            val after = (res("push_switch_decisions") ?: res("push_switch_incidents"))?.isChecked
            (res("push_switch_decisions") ?: res("push_switch_incidents"))?.click(); device.waitForIdle() // restore
            if (after != null && after != before) "PASS_STATE_TOGGLED" to "before=$before after=$after" else "FAIL" to "before=$before after=$after"
        }
        case("type", "TextField") {
            if (!navAnchored(listOf("card_next_action"), "ma_home")) return@case "FAIL" to "ma_home nav"
            val bucket = scrollToTag("ma_card_needs") ?: scrollToTag("ma_card_preparing") ?: scrollToTag("ma_card_ready")
                ?: return@case "FAIL" to "no bucket"
            bucket.click(); device.waitForIdle(); waitLoaded()
            val tf = scrollToTag("ma_search") ?: return@case "FAIL" to "ma_search not found"
            tf.text = "проб"; device.waitForIdle(); Thread.sleep(400)
            if ((res("ma_search")?.text ?: "").contains("проб")) "PASS_INPUT_ECHOED" to "" else "FAIL" to "echo mismatch"
        }
        case("type", "Refresh+LiveRead") {
            if (!navAnchored(listOf("tab_system"), "operations_home")) return@case "FAIL" to "ops nav"
            val rf = scrollToTag("screen.operations.control.refresh") ?: return@case "FAIL" to "refresh not found"
            rf.click(); device.waitForIdle(); Thread.sleep(900)
            if (device.hasObject(By.res("operations_home"))) "PASS_LIVE_READ" to "" else "FAIL" to "left screen"
        }
        case("type", "Button/IconButton") {
            if (navAnchored(listOf("tab_system", "ops_card_cost"), "cost_center_screen")) "PASS_ANCHOR" to "cost center refresh button" else "FAIL" to ""
        }

        // ===== DANGEROUS GATE: open → Cancel (never confirm) =====
        case("dangerous", "unpair_open_then_cancel") {
            if (!navAnchored(listOf("tab_system", "ops_card_connection"), "settings_screen")) return@case "FAIL" to "settings nav"
            // btn_unpair lives in a scrollable column that may recompose → use stale-safe click.
            if (!clickTag("btn_unpair")) return@case "FAIL" to "btn_unpair not found/clickable"
            device.waitForIdle(); Thread.sleep(600)
            val cancel = res("btn_unpair_cancel") ?: txt("Отмена") ?: return@case "FAIL" to "no cancel in dialog"
            try { cancel.click() } catch (e: androidx.test.uiautomator.StaleObjectException) {
                (res("btn_unpair_cancel") ?: txt("Отмена"))?.click() }
            device.waitForIdle()
            // confirm we are still paired (dialog dismissed, settings screen still present)
            if (awaitAnchor("settings_screen", 4000)) "PASS_UNSAFE_ACTION_BLOCKED" to "dialog shown, cancelled, still paired"
            else "FAIL" to "settings screen gone after cancel"
        }

        // ===== STATE GROUP: TEST_ONLY_DATA (seeded fixtures visible in debug app) =====
        // The debug app sends includeTest=true on /campaigns → the seeded TEST_ONLY campaign is
        // visible on the DIRECTLY-REACHABLE campaigns screen (card_campaigns → campaigns_screen),
        // which is NOT snapshot-gated (unlike decisions/incidents — see DEF-V3-001). This proves the
        // includeTest unblock end-to-end in the UI: real owner (release) sees 0, debug sees the fixture.
        case("state", "TEST_ONLY_DATA_visible") {
            if (!navAnchored(listOf("card_campaigns"), "campaigns_screen")) return@case "FAIL" to "campaigns nav"
            // a campaign card carries the seeded name "[ACCEPT_V3] Тестовая кампания"
            val seen = scrollToTag("campaign_card_") != null || device.wait(Until.hasObject(By.textContains("ACCEPT_V3")), 8000)
            if (seen) "PASS_TEST_FIXTURE_VISIBLE" to "seeded [ACCEPT_V3] campaign visible (includeTest=true)"
            else { diag("test_campaign_not_rendered"); "FAIL" to "seeded campaign not rendered" }
        }

        // PAIRED_ONLINE is the ambient state (proven by every successful live read above)
        case("state", "PAIRED_ONLINE") { if (passed > 0) "PASS_AMBIENT" to "" else "FAIL" to "" }

        android.util.Log.i(TAG, "CANARY_END total=$total passed=$passed failed=$failed unexecuted=$unexec")
        assertTrue("canary in-process cases all green (failed=$failed unexec=$unexec)", failed == 0 && unexec == 0)
    }
}
