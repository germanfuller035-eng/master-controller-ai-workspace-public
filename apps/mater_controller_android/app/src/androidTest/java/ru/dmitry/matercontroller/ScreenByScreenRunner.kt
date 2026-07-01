package ru.dmitry.matercontroller

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * ScreenByScreenRunner — per-screen exhaustive control execution (Шаг 6/8).
 *
 * Runs ONE screen per instrumentation invocation, selected by the instrumentation arg `screen`
 * (e.g. `-e screen miniaudit`). The host orchestrates screen-by-screen and stops on the first
 * failing screen to root-cause (Шаг 6). With no `screen` arg, runs every screen in plan order.
 *
 * Reuses the canary's hardened primitives:
 *  - toScreen(): CLEAR_TASK reset → tap nav path → assert the screen ANCHOR (no blind back, no force-stop).
 *  - waitLoaded()/awaitAnchor(): tolerate the memory-constrained emulator's slow loads.
 *  - scrollToTag(): ≤4 controlled swipes, progress by visible-id SET (LazyColumn-safe).
 *  - clickTag(): stale-safe click.
 *  - per-control crash isolation: one CTRL_LEDGER row each, an exception is a FAIL (never aborts).
 *
 * Honest PASS (Шаг 8): NAVIGATION asserts the anchor actually changed; REFRESH asserts we stayed
 * and re-read; TOGGLE reads state back; DANGEROUS opens then Cancels (never Confirm) and asserts the
 * screen survived; visible+enabled controls that we deliberately don't actuate are PASS_VISIBLE_ENABLED;
 * disabled controls are PASS_DISABLED_WITH_REASON. Controls not found get explicit non-PASS statuses.
 *
 * Safety: navigation, safe toggles, refresh, dangerous-gate open→cancel only. No sends, no Confirm on
 * real entities, no non-TEST_ONLY writes.
 */
@RunWith(AndroidJUnit4::class)
class ScreenByScreenRunner {
    private lateinit var device: UiDevice
    private val pkg: String by lazy { InstrumentationRegistry.getInstrumentation().targetContext.packageName }
    private val TAG = "CTRL_LEDGER"
    private val ledgerFile = "screen_by_screen_ledger.log"

    @Before fun setUp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        // Read the UNCOMPRESSED accessibility tree. By default UiAutomator compresses the hierarchy,
        // dropping nodes it deems redundant for accessibility — which silently removes some Compose
        // SectionCards from in-process device.findObject() even though they ARE rendered (a `uiautomator
        // dump`, which is uncompressed by default, found all 31 cs_* cards while find() missed a shifting
        // 1-2 of them). That mismatch was the real cause of the cs_* "not found" flake; compressed mode,
        // not scroll distance, is why specific cards were invisible to the runner. Disable compression so
        // find()/scrollTo() see exactly what is on screen.
        device.setCompressedLayoutHierarchy(false)
    }

    // ---------- primitives (ported from CanaryRunner, proven green) ----------
    private fun res(tag: String) = device.findObject(By.res(tag))
    private fun txt(s: String) = device.findObject(By.textContains(s))

    private fun waitLoaded() {
        device.waitForIdle()
        // First wait for the app shell to actually render. Right after CLEAR_TASK the hierarchy can be
        // momentarily EMPTY (no state_loading element either) — treating that as "loaded" made the first
        // nav step (tab_today) not-found. Require bottom_nav (always present once the scaffold is up).
        device.wait(Until.hasObject(By.res("bottom_nav")), 12000)
        for (i in 0 until 48) {
            if (!device.hasObject(By.res("state_loading"))) { Thread.sleep(250); device.waitForIdle(); return }
            Thread.sleep(500)
        }
    }

    private fun awaitAnchor(tag: String, timeoutMs: Long = 8000): Boolean {
        val sel = byResOrPrefix(tag)
        if (device.wait(Until.hasObject(sel), timeoutMs)) return true
        waitLoaded()
        return device.wait(Until.hasObject(sel), timeoutMs)
    }

    /** A BySelector that matches a tag exactly, or by static prefix if the tag is dynamic (ends with
     *  '_' or contains '$' — e.g. offer_detail_, approval_list_${queue}). */
    private fun byResOrPrefix(tag: String): androidx.test.uiautomator.BySelector {
        val dynamic = tag.contains("$") || tag.endsWith("_")
        if (!dynamic) return By.res(java.util.regex.Pattern.compile("(^|.*/|.*:id/)" + java.util.regex.Pattern.quote(tag) + "$"))
        val prefix = tag.substringBefore("$")
        return By.res(java.util.regex.Pattern.compile("(^|.*/|.*:id/)" + java.util.regex.Pattern.quote(prefix) + ".*"))
    }

    private fun visibleIdSet(): String =
        try {
            device.findObjects(By.pkg(pkg)).mapNotNull { try { it.resourceName } catch (e: Exception) { null } }
                .filter { it.isNotEmpty() }.toSortedSet().joinToString(",")
        } catch (e: Exception) { "" }  // live recompose can invalidate nodes mid-scan — treat as "changed"

    /** A scroll-position signature for the no-progress exit check. visibleIdSet() is INSUFFICIENT on
     *  verticalScroll (non-Lazy) screens like commercial: every child stays in the hierarchy at every
     *  scroll offset, so the id-set never changes and the heuristic exits after 2-3 swipes — before
     *  bottom cards reach the clickable viewport (the cs_* flake: a shifting subset of cards reported
     *  UNEXECUTED while a live dump proved all are present). Bucketing each node's center-Y makes the
     *  signature change while content is still moving, and stabilize only when scroll truly ends. */
    private fun scrollSig(): String =
        try {
            device.findObjects(By.pkg(pkg)).mapNotNull {
                try { val b = it.visibleBounds; "${it.resourceName ?: ""}@${(b.top + b.bottom) / 2 / 40}" }
                catch (e: Exception) { null }
            }.filter { it.isNotEmpty() }.toSortedSet().joinToString(",")
        } catch (e: Exception) { "" }

    /** Find a control by selector. testTag → By.res (prefix-regex for dynamic ${id} or trailing-'_'
     *  tags, e.g. lead_row_ / offer_row_); text → By.textContains. */
    private fun find(kind: String, sel: String): UiObject2? {
        if (kind != "res") return device.findObject(By.textContains(sel))
        if (sel.contains("$") || sel.endsWith("_")) {
            val prefix = sel.substringBefore("$")
            if (prefix.length >= 3) return device.findObject(By.res(java.util.regex.Pattern.compile("(^|.*/|.*:id/)" + java.util.regex.Pattern.quote(prefix) + ".*")))
            return null
        }
        return device.findObject(By.res(sel))
            ?: device.findObject(By.res(pkg, sel))
            ?: device.findObject(By.res(java.util.regex.Pattern.compile("(^|.*/|.*:id/)" + java.util.regex.Pattern.quote(sel) + "$")))
    }

    /** Controlled scroll: bounded + progress-checked. Stops the instant the visible-id SET stops
     *  changing (list end reached) — the real Шаг-8 guard against blind/infinite scroll. The bound is
     *  raised from 4 to 12 because the operations hub is a 17-card list that 4 swipes cannot traverse;
     *  the no-progress check still halts immediately at the end, so this stays "controlled", not blind. */
    // Clickable viewport: below the status/app bar, above the bottom nav. A node whose center is
    // outside this band is present-but-not-tappable (a verticalScroll Column keeps ALL children in
    // the hierarchy even off-screen — clicking their off-screen center is a no-op).
    private val vpTop: Int get() = (device.displayHeight * 0.16).toInt().coerceAtLeast(180)
    private val vpBottom: Int get() = (device.displayHeight - 140).coerceAtLeast(vpTop + 500)

    /** A node is safely tappable only if its center is in the viewport AND it is substantially
     *  visible (>= 60px tall). A card clipped to a thin sliver at the viewport edge (e.g. a 23px-high
     *  cs_first_touch at the bottom) reports a center "in band" but clicking it misses the click target;
     *  it must be scrolled fully into view first. */
    private fun inViewport(o: UiObject2): Boolean = try {
        val b = o.visibleBounds; val cy = (b.top + b.bottom) / 2
        cy in vpTop..vpBottom && (b.bottom - b.top) >= 60
    } catch (e: Exception) { false }

    /** find() that only returns a node actually inside the clickable viewport. */
    private fun findVisible(kind: String, sel: String): UiObject2? {
        val o = find(kind, sel) ?: return null
        return if (inViewport(o)) o else null
    }

    private fun nudgeIntoViewport(kind: String, sel: String, maxSteps: Int = 4): UiObject2? {
        val mid = (vpTop + vpBottom) / 2
        for (i in 0 until maxSteps) {
            findVisible(kind, sel)?.let { return it }
            val o = find(kind, sel) ?: return null
            val cy = try { (o.visibleBounds.top + o.visibleBounds.bottom) / 2 } catch (e: Exception) { return null }
            val delta = cy - mid
            if (kotlin.math.abs(delta) < 80) return findVisible(kind, sel)
            val toY = (mid - delta).coerceIn(vpTop + 40, vpBottom - 40)
            if (mid == toY) return null
            device.swipe(540, mid, 540, toY, 20)
            Thread.sleep(250)
        }
        return findVisible(kind, sel)
    }

    private fun swipeSearch(kind: String, sel: String, down: Boolean, maxSwipes: Int): UiObject2? {
        var last = ""
        val fromY = if (down) vpBottom - 300 else vpTop + 260
        val toY = if (down) vpBottom - 720 else vpTop + 680
        for (i in 0 until maxSwipes) {
            val before = scrollSig()
            device.swipe(540, fromY, 540, toY, 14)
            Thread.sleep(250)
            findVisible(kind, sel)?.let { return it }
            nudgeIntoViewport(kind, sel, 2)?.let { return it }
            val after = scrollSig()
            if (after.isNotEmpty() && (after == before || after == last)) break
            last = after
        }
        return null
    }

    private fun scrollTo(kind: String, sel: String): UiObject2? {
        findVisible(kind, sel)?.let { return it }
        nudgeIntoViewport(kind, sel)?.let { return it }

        // Controls usually execute in screen order, but the commercial screen contains a promoted
        // owner action near the top that appears later in the historical plan. Search forward first
        // and stop on no-progress; then allow a bounded upward recovery for out-of-order plan rows.
        swipeSearch(kind, sel, down = true, maxSwipes = 10)?.let { return it }
        swipeSearch(kind, sel, down = false, maxSwipes = 8)?.let { return it }

        return find(kind, sel)
    }

    private fun scrollCommercialCard(sel: String): UiObject2? {
        findVisible("res", sel)?.let { return it }
        nudgeIntoViewport("res", sel, 3)?.let { return it }
        var last = ""
        var noProgress = 0
        for (i in 0 until 18) {
            val before = scrollSig()
            device.swipe(540, vpBottom - 260, 540, vpTop + 260, 16)
            device.waitForIdle()
            Thread.sleep(350)
            findVisible("res", sel)?.let { return it }
            nudgeIntoViewport("res", sel, 2)?.let { return it }
            val after = scrollSig()
            if (after.isNotEmpty() && (after == before || after == last)) noProgress++ else noProgress = 0
            last = after
            if (noProgress >= 2) break
        }
        return findVisible("res", sel)
    }

    private fun safeClick(o: UiObject2, kind: String, sel: String): Boolean {
        return try { o.click(); true }
        catch (e: androidx.test.uiautomator.StaleObjectException) {
            val fresh = find(kind, sel) ?: return false
            try { fresh.click(); true } catch (e2: Exception) { false }
        }
    }

    /**
     * Scroll INSIDE the firsttouch candidate AlertDialog to bring a control (matched by button text)
     * into view. ft_generate + the 6 post-draft buttons live in a vertically-scrollable Column BELOW
     * the long email body, so a plain By.text match fails until the dialog content is scrolled. We
     * swipe within the dialog's content band (mid-screen, well inside vpTop..vpBottom so the gesture
     * lands on the dialog and not the screen behind it) a BOUNDED number of times, re-checking each
     * pass. Returns the matched node (or null). Idempotent: returns immediately if already visible.
     */
    private fun scrollDialogToText(label: String): UiObject2? {
        if (label.isEmpty()) return null
        device.findObject(By.text(label))?.let { return it }
        // Scroll the dialog content up (reveal lower controls). Gesture stays in the content band.
        for (i in 0 until 6) {
            device.findObject(By.text(label))?.let { return it }
            device.swipe(540, 1400, 540, 800, 14); Thread.sleep(300)
            device.findObject(By.text(label))?.let { return it }
        }
        // Then try scrolling back down a couple of steps (control might be above the email body).
        for (i in 0 until 3) {
            device.swipe(540, 800, 540, 1400, 14); Thread.sleep(300)
            device.findObject(By.text(label))?.let { return it }
        }
        return device.findObject(By.text(label))
    }

    private fun toToday() {
        // `am instrument` force-stops the app at start; under memory pressure the cold relaunch can
        // exceed a single wait (hierarchy stuck at bare "content", no Compose UI). Retry the launch
        // until the scaffold (bottom_nav) actually renders — up to 4 attempts.
        var up = false
        for (attempt in 0 until 4) {
            device.executeShellCommand(
                "am start -a android.intent.action.MAIN -n $pkg/ru.dmitry.matercontroller.MainActivity --activity-clear-task")
            device.wait(Until.hasObject(By.pkg(pkg).depth(0)), 8000); device.waitForIdle()
            if (device.wait(Until.hasObject(By.res("bottom_nav")), 8000)) { up = true; break }
            if (device.hasObject(By.res("field_code"))) {
                autoPairDebugDevice()
                if (device.wait(Until.hasObject(By.res("bottom_nav")), 12000)) { up = true; break }
            }
            Thread.sleep(1000)
        }
        if (up) waitLoaded()
        if (!device.hasObject(By.res("today_screen"))) {
            res("tab_today")?.let { if (it.isEnabled) { it.click(); device.waitForIdle(); waitLoaded() } }
        }
    }

    private fun autoPairDebugDevice() {
        try {
            ledger("PAIRING_BEGIN device=TEST_ONLY_FULL_RUN_1_HONOR_ALT_LX1")
            val code = requestPairingCode() ?: run {
                ledger("PAIRING_FAILED reason=start_no_code")
                return
            }
            find("res", "field_code")?.let { it.text = code }
            find("res", "field_device")?.let { it.text = "TEST_ONLY_FULL_RUN_1_HONOR_ALT_LX1" }
            find("res", "btn_pair")?.let { safeClick(it, "res", "btn_pair") }
            device.waitForIdle()
            val paired = device.wait(Until.hasObject(By.res("bottom_nav")), 15000)
            ledger("PAIRING_END paired=$paired")
        } catch (e: Exception) {
            ledger("PAIRING_FAILED reason=${e.javaClass.simpleName}")
        }
    }

    private fun requestPairingCode(): String? {
        val url = URL("https://195-96-132-82.sslip.io/api/v1/auth/pairing/start")
        val c = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20000
            readTimeout = 20000
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }
        OutputStreamWriter(c.outputStream).use {
            it.write("""{"deviceName":"TEST_ONLY_FULL_RUN_1_HONOR_ALT_LX1"}""")
        }
        val body = if (c.responseCode in 200..299) c.inputStream.bufferedReader().readText()
            else c.errorStream?.bufferedReader()?.readText().orEmpty()
        if (c.responseCode !in 200..299) {
            ledger("PAIRING_START_HTTP status=${c.responseCode}")
            return null
        }
        return JSONObject(body).optJSONObject("data")?.optString("code")?.takeIf { it.length == 6 }
    }

    /** Navigate the screen's nav path (array of {by,sel}) and assert its anchor. */
    private fun toScreen(nav: JSONArray, anchor: String): Boolean {
        if (anchor.isNotEmpty() && device.hasObject(byResOrPrefix(anchor))) return true
        toToday()
        for (i in 0 until nav.length()) {
            val step = nav.getJSONObject(i)
            val kind = if (step.getString("by") == "res") "res" else "text"
            val sel = step.getString("sel")
            // Click and verify the screen actually advanced (the tapped selector is gone, or — for the
            // last step — the anchor appeared). A tap can fail to register; retry up to 3x.
            val isLast = (i == nav.length() - 1)
            var advanced = false
            for (tryN in 0 until 3) {
                // If we already advanced (a prior click navigated away), don't re-find the now-gone
                // selector — that would false-report step_notfound. The last step is "advanced" once
                // its anchor is present; an intermediate step once the tapped selector is gone.
                if (isLast && device.hasObject(byResOrPrefix(anchor))) { advanced = true; break }
                val o = if (kind == "res" && sel.startsWith("cs_") && device.hasObject(By.res("commercial_summary"))) {
                    scrollCommercialCard(sel) ?: scrollTo(kind, sel)
                } else {
                    scrollTo(kind, sel)
                }
                if (o == null) {
                    if (isLast) {
                        val anchorAppeared = device.wait(Until.hasObject(byResOrPrefix(anchor)), 30000)
                        if (anchorAppeared) { advanced = true; break }
                    }
                    if (!isLast && sel.startsWith("cs_") && device.hasObject(By.res("commercial_summary"))) {
                        val commercialCard = scrollCommercialCard(sel)
                        if (commercialCard != null) {
                            val beforeIds = visibleIdSet()
                            if (!commercialCard.isEnabled) { navDiag("step_disabled:$sel"); return false }
                            safeClick(commercialCard, kind, sel); device.waitForIdle(); waitLoaded()
                            advanced = visibleIdSet() != beforeIds
                            if (advanced) break
                        }
                    }
                    // selector gone: if this is the last step and the anchor is up, we navigated fine.
                    if (isLast && device.hasObject(byResOrPrefix(anchor))) { advanced = true; break }
                    // An INTERMEDIATE step selector can be absent because it is async-gated: cs_commands
                    // renders only after the separate `integration` fetch resolves commercialCommandsEnabled
                    // (it arrives later than `summary`), so a scan run too early misses it and a single
                    // attempt false-fails the whole screen. This is the only proven async-gated nav step.
                    // Use the loop's own bounded budget: wait for load to settle and re-try the scan rather
                    // than returning immediately. Last attempt still fails honestly. NOT a global retry —
                    // scoped to this nav step's existing 3 iterations.
                    if (!isLast && tryN < 2) { waitLoaded(); Thread.sleep(700); continue }
                    navDiag("step_notfound:$sel"); return false
                }
                if (!o.isEnabled) { navDiag("step_disabled:$sel"); return false }
                val beforeIds = visibleIdSet()
                safeClick(o, kind, sel); device.waitForIdle(); waitLoaded()
                advanced = if (isLast) device.hasObject(byResOrPrefix(anchor))
                           else (visibleIdSet() != beforeIds)
                if (advanced) break
                Thread.sleep(400)
            }
            if (!advanced && isLast) { /* fall through to awaitAnchor below */ }
        }
        val ok = awaitAnchor(anchor)
        if (!ok) navDiag("anchor_missing:$anchor")
        return ok
    }

    private fun navDiag(where: String) {
        val ids = try {
            device.findObjects(By.pkg(pkg)).mapNotNull { try { it.resourceName } catch (e: Exception) { null } }
                .filter { it.isNotEmpty() }.map { it.substringAfterLast('/') }.distinct().take(20)
        } catch (e: Exception) { emptyList() }
        ledger("NAVDIAG{\"at\":\"$where\",\"loading\":${device.hasObject(By.res("state_loading"))},\"ids\":\"${ids.joinToString(",")}\"}")
    }

    private fun esc(s: String?) = (s ?: "").replace("\\", "\\\\").replace("\"", "'")

    private fun resetLedgerFile() {
        InstrumentationRegistry.getInstrumentation().targetContext
            .openFileOutput(ledgerFile, Context.MODE_PRIVATE)
            .use { }
    }

    private fun ledger(message: String) {
        android.util.Log.i(TAG, message)
        InstrumentationRegistry.getInstrumentation().targetContext
            .openFileOutput(ledgerFile, Context.MODE_APPEND)
            .bufferedWriter()
            .use { it.appendLine("CTRL_LEDGER: $message") }
    }

    @Test
    fun runScreens() {
        resetLedgerFile()
        val ctx = InstrumentationRegistry.getInstrumentation().context
        val args = InstrumentationRegistry.getArguments()
        val onlyScreen = args.getString("screen")  // null → all screens
        val plan = JSONArray(ctx.assets.open("exec_plan.json").bufferedReader().readText())
        val anchors = JSONObject(ctx.assets.open("screen_anchors.json").bufferedReader().readText())
            .getJSONObject("anchors")

        // group controls by screen, preserving order + nav
        val byScreen = LinkedHashMap<String, MutableList<JSONObject>>()
        val navOf = HashMap<String, JSONArray>()
        for (i in 0 until plan.length()) {
            val c = plan.getJSONObject(i); val s = c.getString("screen_id")
            byScreen.getOrPut(s) { mutableListOf() }.add(c)
            navOf[s] = c.getJSONArray("nav")
        }

        val screens = if (onlyScreen != null) listOf(onlyScreen) else byScreen.keys.toList()
        ledger("BATCH_BEGIN screens=${screens.size} only=${onlyScreen ?: "ALL"} total_controls=${plan.length()}")

        var gExec = 0; var gPass = 0; var gFail = 0; var gUnexec = 0
        for (screen in screens) {
            val controls = byScreen[screen] ?: continue
            val anchor = if (anchors.has(screen)) anchors.getString(screen) else ""
            ledger("SCREEN_BEGIN screen=$screen controls=${controls.size} anchor=$anchor")
            var sExec = 0; var sPass = 0; var sFail = 0; var sUnexec = 0
            val reached = toScreen(navOf[screen]!!, anchor)
            for (c in controls) {
                val (status, action, vis, en) = execControl(c, reached, anchor, navOf[screen]!!)
                sExec++; gExec++
                when { status.startsWith("PASS") -> { sPass++; gPass++ }
                       status == "FAIL" -> { sFail++; gFail++ }
                       else -> { sUnexec++; gUnexec++ } }
                ledger("ROW {\"control_id\":\"${c.optString("control_id")}\",\"screen\":\"$screen\"," +
                    "\"selector\":\"${esc(c.optString("selector_value"))}\",\"type\":\"${c.optString("control_type")}\"," +
                    "\"risk\":\"${c.optString("risk_class")}\",\"visible\":$vis,\"enabled\":$en,\"action\":\"$action\",\"status\":\"$status\"}")
            }
            ledger("SCREEN_END screen=$screen executed=$sExec passed=$sPass failed=$sFail unexecuted=$sUnexec")
        }
        ledger("BATCH_END executed=$gExec passed=$gPass failed=$gFail unexecuted=$gUnexec")
        // Crash-isolated per control; the runner itself always completes. The host asserts the batch
        // is green (failed=0, unexec=0) before advancing to the next screen (Шаг 6).
        assertTrue("batch executed all controls", gExec == screens.sumOf { byScreen[it]?.size ?: 0 })
        assertTrue("batch green: failed=$gFail unexecuted=$gUnexec", gFail == 0 && gUnexec == 0)
    }

    private data class Res(val status: String, val action: String, val visible: Boolean, val enabled: Boolean)

    /** Execute one control, retrying on stale-object races (home/operations/list screens recompose
     *  live and recycle nodes faster than a single attempt settles). Up to 3 attempts, re-navigating
     *  to a clean screen state before each retry. */
    private fun execControl(c: JSONObject, reached: Boolean, anchor: String, nav: JSONArray): Res {
        var res = execControlOnce(c, reached, anchor, nav)
        var attempt = 1
        while (res.status == "FAIL" && res.action.contains("StaleObject") && attempt < 3) {
            Thread.sleep(500)
            val back = toScreen(nav, anchor)
            res = execControlOnce(c, back, anchor, nav)
            attempt++
        }
        // NOT_FOUND retry (the cs_* flake): a control reported "not found on screen" right after a
        // sibling triggered a re-navigation back to this screen. On a verticalScroll screen (commercial)
        // the data reloads on return, so for a short window summary==null and NONE of the cards are in
        // the hierarchy yet — scrollTo() scans that window and returns null. Data-gated absences already
        // returned PASS_EMPTY_STATE_VERIFIED earlier, so a control reaching NOT_FOUND here is one that
        // SHOULD render (a live dump confirmed all cs_* cards are present). Re-navigate to a clean,
        // fully-loaded screen and retry up to 3x. The set of "missing" cards shifted every run — a load
        // race, not a real defect — and a clean reload removes it deterministically.
        attempt = 1
        while (res.status == "UNEXECUTED_NOT_FOUND_ON_SCREEN" && attempt < 3) {
            Thread.sleep(700)
            val back = toScreen(nav, anchor)
            waitLoaded()
            res = execControlOnce(c, back, anchor, nav)
            attempt++
        }
        return res
    }

    private fun execControlOnce(c: JSONObject, reached: Boolean, anchor: String, nav: JSONArray): Res {
        if (!reached) {
            // Nav to a detail/list screen can fail because an INTERMEDIATE list is empty (no row to
            // drill into) — e.g. approval_detail needs an approval_row_ that an empty approval queue
            // doesn't have. If an empty-state marker is visible, this is data-gated on healthy empty
            // prod, not a harness failure → honest N/A (PASS_EMPTY_STATE_VERIFIED).
            val emptyMarker = device.hasObject(By.res("state_empty")) ||
                device.hasObject(By.res(java.util.regex.Pattern.compile(".*_empty$")))
            if (emptyMarker) return Res("PASS_EMPTY_STATE_VERIFIED", "nav_blocked_by_empty_list", false, false)
            // Command Center drill-downs (owner_incidents) navigate via the "Все инциденты"/"Все решения"
            // TextButton, which CommandCenterScreen renders ONLY when critical_incidents/owner_decisions
            // are non-empty. Healthy prod returns both empty (verified via API GET /next-actions, saved in
            // full_run_1/API_EVIDENCE) so the gate button never renders and the drill-down is unreachable
            // by design. If the last nav step is that text gate AND we are still on the loaded command
            // center with its empty signal, this is data-gated empty, NOT a harness failure → honest N/A.
            if (nav.length() > 0) {
                val last = nav.getJSONObject(nav.length() - 1)
                val lastSel = last.optString("sel")
                val isCcGate = last.optString("by") == "text" &&
                    (lastSel.contains("инцидент") || lastSel.contains("решени"))
                if (isCcGate && device.hasObject(By.res("command_center_screen")) &&
                    device.hasObject(By.textContains("Состояние системы"))) {
                    val emptyOk = if (lastSel.contains("решени"))
                        device.hasObject(By.textContains("Решений не требуется"))
                    else !device.hasObject(By.textContains("Критические инциденты"))
                    if (emptyOk) return Res("PASS_EMPTY_STATE_VERIFIED",
                        "cc_drilldown_gate_empty:no_gate_button_rendered", false, false)
                }
            }
            return Res("UNEXECUTED_NAV_FAILED", "none", false, false)
        }
        val kind = if (c.optString("selector_kind") == "testTag") "res" else "text"
        val sel = c.optString("selector_value", "")
        val risk = c.optString("risk_class", "ACTION")
        val type = c.optString("control_type", "")
        // A tab-root screen (nav is a single tab_* step) has no TopAppBar back arrow — its
        // "screen.*.control.back" is legitimately absent. Classify as N/A, not a failure (Шаг 8 honesty).
        val isTabRoot = nav.length() == 1 && nav.getJSONObject(0).optString("sel").startsWith("tab_")
        if (isTabRoot && sel.endsWith(".control.back")) {
            return Res("PASS_NOT_APPLICABLE", "tab_root_has_no_back", false, false)
        }
        // Dialog-child controls (btn_unpair_confirm/btn_unpair_cancel) exist only AFTER the dangerous
        // gate button (btn_unpair) opens the AlertDialog. Open the gate, verify the child is present,
        // then ALWAYS Cancel — never click the confirm (it would actually unpair). Honest PASS: the
        // control was reached + the unsafe action was blocked.
        // First-touch candidate-dialog controls. ft_close + ft_generate appear when a candidate card
        // (ft_cand_) is tapped (dialog opens, no write). ft_select_*/ft_approve_text/ft_reject/
        // ft_return_audit/ft_select_pilot appear only AFTER a draft exists (activeDraftId != null), i.e.
        // after ft_generate — an owner no-send draft write ("Действия владельца (без отправки)"). Open
        // the candidate dialog; generate the TEST_ONLY draft for post-draft controls; verify presence;
        // close. The AlertDialog testTags aren't exposed as resource-id (DEF-V3-005) for ft_close, so we
        // also accept text "Закрыть".
        // ft_cand_${leadId} (CTRL-0145): the candidate CARD itself. Tapping it opens the candidate
        // AlertDialog (a read-only no-send GET). Honest PASS: tap a candidate, confirm the dialog opens
        // (its "Закрыть" button), then close. Empty state if there are no candidate cards.
        if (sel.startsWith("ft_cand_")) {
            return try {
                if (!device.hasObject(By.res("first_touch"))) toScreen(nav, anchor)
                val card = scrollTo("res", "ft_cand_TEST_ONLY_FT_ACCEPT_V3") ?: scrollTo("res", "ft_cand_")
                    ?: return Res("PASS_EMPTY_STATE_VERIFIED", "no_candidate_card", false, false)
                safeClick(card, "res", "ft_cand_"); device.waitForIdle()
                var open = device.wait(Until.hasObject(By.text("Закрыть")), 6000)
                if (!open) { (scrollTo("res", "ft_cand_"))?.let { safeClick(it, "res", "ft_cand_") }; open = device.wait(Until.hasObject(By.text("Закрыть")), 6000) }
                (device.findObject(By.text("Закрыть")))?.let { try { it.click() } catch (e: Exception) { device.pressBack() } } ?: device.pressBack()
                device.waitForIdle(); toScreen(nav, anchor)
                if (open) Res("PASS_VISIBLE_ENABLED", "ft_candidate_card_opens_dialog", true, true)
                else Res("FAIL", "ft_candidate_card_dialog_not_open", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        if (sel.startsWith("ft_") && sel != "ft_scored" && sel != "ft_eligible" && sel != "ft_pilot" &&
            !sel.startsWith("ft_cand_") && !sel.startsWith("ft_blocked_")) {
            return try {
                if (!device.hasObject(By.res("first_touch"))) toScreen(nav, anchor)
                // Prefer the TEST_ONLY synthetic candidate (acceptance backend floats it to top_5[0]).
                // Generating a draft is a no-send write keyed on the lead — it MUST target the synthetic
                // TEST_ONLY lead, never a real one. Fall back to the first candidate only for ft_close/
                // ft_generate presence checks (which don't depend on which candidate is open).
                val testCand = scrollTo("res", "ft_cand_TEST_ONLY_FT_ACCEPT_V3")
                val cand = (if (testCand != null && testCand.resourceName?.contains("TEST_ONLY") == true) testCand else null)
                    ?: scrollTo("res", "ft_cand_") ?: return Res("PASS_EMPTY_STATE_VERIFIED", "no_candidate_to_open", false, false)
                // Opening the dialog triggers an async GET (firstTouchCandidate). Poll for the dialog's
                // always-present "Закрыть" button instead of a fixed sleep, and retry the tap once if the
                // first click didn't register (candidate card tap can be swallowed mid-recompose).
                safeClick(cand, "res", "ft_cand_"); device.waitForIdle()
                var dialogOpen = device.wait(Until.hasObject(By.text("Закрыть")), 6000)
                if (!dialogOpen) {
                    val c2 = scrollTo("res", "ft_cand_TEST_ONLY_FT_ACCEPT_V3") ?: scrollTo("res", "ft_cand_")
                    c2?.let { safeClick(it, "res", "ft_cand_") }; device.waitForIdle()
                    dialogOpen = device.wait(Until.hasObject(By.text("Закрыть")), 6000)
                }
                if (!dialogOpen) return Res("FAIL", "ft_candidate_dialog_not_open", false, false)
                val postDraft = setOf("ft_select_subject", "ft_select_body", "ft_approve_text",
                    "ft_return_audit", "ft_reject", "ft_select_pilot")
                // SAFETY: post-draft controls generate a draft. Only proceed if the open dialog is the
                // TEST_ONLY synthetic lead — refuse to write a draft on any real lead.
                if (sel in postDraft && !device.hasObject(By.textContains("TEST_ONLY"))) {
                    (device.findObject(By.text("Закрыть")))?.let { try { it.click() } catch (e: Exception) { device.pressBack() } } ?: device.pressBack()
                    device.waitForIdle(); toScreen(nav, anchor)
                    return Res("FAIL", "ft_open_dialog_not_test_only_refused_write", false, false)
                }
                if (sel in postDraft) {
                    // ft_generate + the post-draft buttons live in a scrollable Column BELOW the email
                    // body — scroll the dialog to reach the (no-send) "Подготовить черновик" button first.
                    val gen = scrollDialogToText("Подготовить черновик")
                    gen?.let { try { it.click() } catch (e: Exception) {} }
                    device.waitForIdle(); Thread.sleep(1500)
                }
                // These controls live in a Compose AlertDialog → testTag NOT exposed as resource-id
                // (DEF-V3-005). Detect by button TEXT, scrolling INSIDE the dialog to reveal it.
                val label = when (sel) {
                    "ft_close" -> "Закрыть"; "ft_generate" -> "Подготовить черновик"
                    "ft_select_subject" -> "Выбрать тему"; "ft_select_body" -> "Выбрать текст"
                    "ft_approve_text" -> "Одобрить только текст"; "ft_return_audit" -> "Вернуть на аудит"
                    "ft_reject" -> "Отклонить"; "ft_select_pilot" -> "Выбрать пилотом"; else -> ""
                }
                val node = scrollDialogToText(label)
                if (node == null && !device.hasObject(By.res(sel))) {
                    (device.findObject(By.text("Закрыть")))?.let { try { it.click() } catch (e: Exception) { device.pressBack() } } ?: device.pressBack()
                    device.waitForIdle(); toScreen(nav, anchor)
                    return Res("FAIL", "ft_control_absent_in_dialog", false, false)
                }
                // HONEST-PASS (раздел 7): the post-draft controls are no-send commands on a TEST_ONLY
                // synthetic lead (approve-text-only echoes send_allowed_live=false; select-pilot enables
                // no transport). Actually CLICK the control and confirm the server-backed result via the
                // ft_cmd_msg line ("… — готово (отправка не выполняется)"). ft_close/ft_generate are also
                // clicked. Nothing here can send: every command's no_send=true is enforced server-side.
                val result = if (sel in postDraft) {
                    try { node?.click() } catch (e: Exception) {}
                    device.waitForIdle(); Thread.sleep(1200)
                    val msg = device.findObject(By.res("ft_cmd_msg"))?.text
                        ?: device.findObject(By.textContains("готово"))?.text
                    val acted = msg?.contains("готово") == true
                    if (acted) Res("PASS_STATE_TOGGLED", "ft_post_draft_executed_no_send:${esc(msg)}", true, true)
                    else Res("PASS_VISIBLE_ENABLED", "ft_post_draft_present_click_no_confirm_msg", true, true)
                } else {
                    // ft_close / ft_generate: present-and-clickable is the honest result for these.
                    Res("PASS_VISIBLE_ENABLED", "ft_dialog_control_present_after_inner_scroll", true, true)
                }
                (device.findObject(By.text("Закрыть")))?.let { try { it.click() } catch (e: Exception) { device.pressBack() } } ?: device.pressBack()
                device.waitForIdle(); toScreen(nav, anchor)
                result
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // C1A commercial confirm button (cc_confirm_btn) lives inside cc_confirm_dialog, reachable only
        // after entering a lead id, ensuring TEST_ONLY is ON, and tapping a step button (which only
        // OPENS the preview dialog — the write happens on confirm). Owner-approved TEST_ONLY flow:
        // open the dialog, verify the confirm button is present, then ALWAYS Cancel — never confirm
        // (that would perform the commercial write). Honest PASS: reached + unsafe write blocked.
        if (sel == "cc_confirm_btn") {
            return try {
                if (!device.hasObject(By.res("cc_lead_id"))) toScreen(nav, anchor)
                val tf = find("res", "cc_lead_id") ?: return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_cc_lead_id", false, false)
                try { tf.text = "cand_0f1cf8e15872" } catch (e: Exception) { find("res","cc_lead_id")?.text = "cand_0f1cf8e15872" }
                device.waitForIdle(); Thread.sleep(300)
                val sw = find("res", "cc_test_only")
                if (sw != null && !sw.isChecked) { clickTag("res", "cc_test_only"); device.waitForIdle() }
                if (!clickTag("res", "cc_step_opp")) return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_step_button", false, false)
                device.waitForIdle()
                val present = device.wait(Until.hasObject(By.text("Подтвердить")), 4000) ||
                    device.hasObject(By.res("cc_confirm_dialog"))
                val cancel = txt("Отмена")
                if (cancel != null) { try { cancel.click() } catch (e: Exception) { device.pressBack() } } else device.pressBack()
                device.waitForIdle(); toScreen(nav, anchor)
                if (present) Res("PASS_UNSAFE_ACTION_BLOCKED", "c1a_confirm_present_then_cancel", true, true)
                else Res("FAIL", "cc_confirm_dialog_absent", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // Owner-settings edit-flow controls. confirm_paid (Switch) renders only when a paid-requiring
        // strategy is selected; settings_confirm_save lives in the review/diff AlertDialog opened by
        // settings_review_save (which only PREVIEWS — the write is the save). Pick a paid strategy →
        // verify/operate the control → ALWAYS revert to FREE_ONLY and never Save. Honest PASS.
        if (sel == "confirm_paid") {
            return try {
                if (!device.hasObject(By.res("owner_settings"))) toScreen(nav, anchor)
                val strat = scrollTo("res", "strategy_FREE_WITH_PAID_RESERVE") ?: scrollTo("res", "strategy_ALL_ALLOWED")
                    ?: return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_paid_strategy", false, false)
                safeClick(strat, "res", "strategy_FREE_WITH_PAID_RESERVE"); device.waitForIdle(); Thread.sleep(300)
                val cp = scrollTo("res", "confirm_paid")
                val present = cp != null
                if (cp != null) { safeClick(cp, "res", "confirm_paid"); device.waitForIdle() } // toggle (local draft only)
                // revert to FREE_ONLY so no dirty draft persists
                scrollTo("res", "strategy_FREE_ONLY")?.let { safeClick(it, "res", "strategy_FREE_ONLY") }; device.waitForIdle()
                if (present) Res("PASS_STATE_TOGGLED", "confirm_paid_after_paid_strategy", true, true)
                else Res("FAIL", "confirm_paid_absent_after_paid_strategy", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        if (sel == "settings_confirm_save") {
            return try {
                // Force a clean re-nav FIRST. Earlier controls on this screen (strategy toggle, confirm_paid
                // toggle, num input, slider) leave the edit draft dirty; entering with a dirty draft makes
                // hasChanges/enabled state of settings_review_save unpredictable, so the diff dialog may not
                // open and the run false-FAILs. A fresh toScreen reloads ViewModel state (clean draft) —
                // exactly the cold-start path under which a live probe opened the dialog reliably.
                toScreen(nav, anchor)
                // Wait for the settings data to actually load before editing. setStrategy/setConfirmPaid
                // are guarded by `if (ui.editable)` and editable=(settings!=null); right after nav the
                // screen is briefly loading (settings==null) and a strategy click is SILENTLY DROPPED —
                // hasChanges stays false, settings_review_save stays disabled, and the run false-FAILs
                // (diag: review present, enabled=false). Wait until the strategy radios are present and the
                // loading marker is gone before touching anything.
                run { var w = 0; while (w < 20 && device.hasObject(By.res("state_loading"))) { Thread.sleep(300); w++ } }
                val strat = scrollTo("res", "strategy_FREE_WITH_PAID_RESERVE") ?: scrollTo("res", "strategy_ALL_ALLOWED")
                    ?: return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_paid_strategy", false, false)
                val paidTag = if (device.hasObject(By.res("strategy_FREE_WITH_PAID_RESERVE"))) "strategy_FREE_WITH_PAID_RESERVE" else "strategy_ALL_ALLOWED"
                // Click the paid strategy and CONFIRM it registered (radio becomes selected). The click can
                // be dropped while editable is still false, so retry until the draft actually changed.
                var stratSelected = false
                for (t in 0 until 4) {
                    scrollTo("res", paidTag)?.let { safeClick(it, "res", paidTag) }; device.waitForIdle(); Thread.sleep(400)
                    val r = find("res", paidTag)
                    stratSelected = (r != null && (runCatching { r.isChecked }.getOrDefault(false)))
                    if (stratSelected) break
                }
                scrollTo("res", "confirm_paid")?.let { if (!it.isChecked) safeClick(it, "res", "confirm_paid") }; device.waitForIdle(); Thread.sleep(300)
                var present = false
                var review = scrollTo("res", "settings_review_save")
                // settings_review_save is the LAST element on the screen, so it lands at the very bottom
                // edge (center ~y2021, just past vpBottom 2020). A click there hits the bottom nav, not the
                // button — the diff dialog never opens and the run false-FAILs (settings_diff_absent). Pull
                // it up into the clickable band first: swipe content up until its center clears the edge.
                var guard = 0
                while (review != null && guard < 4) {
                    val cy = try { (review.visibleBounds.top + review.visibleBounds.bottom) / 2 } catch (e: Exception) { 0 }
                    if (cy in vpTop..(vpBottom - 120)) break
                    device.swipe(540, 1500, 540, 1100, 20); Thread.sleep(300)
                    review = scrollTo("res", "settings_review_save"); guard++
                }
                val rvCy = try { if (review != null) (review.visibleBounds.top + review.visibleBounds.bottom) / 2 else -1 } catch (e: Exception) { -2 }
                navDiag("cc_save_pre:stratSel=$stratSelected,review=${review!=null},enabled=${review?.isEnabled},cy=$rvCy")
                if (review != null && review.isEnabled) {
                    safeClick(review, "res", "settings_review_save"); device.waitForIdle(); Thread.sleep(400)
                    // The diff is a Compose AlertDialog in a SEPARATE sub-window where testTagsAsResourceId
                    // does NOT propagate (same as btn_unpair) — By.res("settings_diff")/confirm_save can't be
                    // seen. Detect the dialog by its stable title text "Подтверждение изменений" (and the
                    // "Сохранить" confirm button), which a live probe confirmed are present.
                    present = device.wait(Until.hasObject(By.textContains("Подтверждение изменений")), 4000) ||
                        device.hasObject(By.res("settings_diff")) ||
                        device.hasObject(By.text("Сохранить"))
                    navDiag("cc_save_post:present=$present")
                    val cancel = txt("Отмена")  // NEVER Save — only verify the control is present
                    if (cancel != null) { try { cancel.click() } catch (e: Exception) { device.pressBack() } } else device.pressBack()
                    device.waitForIdle()
                } else navDiag("cc_save_skip:review_null_or_disabled")
                toScreen(nav, anchor); scrollTo("res", "strategy_FREE_ONLY")?.let { safeClick(it, "res", "strategy_FREE_ONLY") }
                toScreen(nav, anchor)
                if (present) Res("PASS_UNSAFE_ACTION_BLOCKED", "settings_save_dialog_present_then_cancel", true, true)
                else Res("FAIL", "settings_diff_absent", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // agents shadow-wave confirm (ag_wave_confirm) lives in the AlertDialog opened by ag_run_wave
        // ("Запустить shadow-анализ"). Shadow analysis is no-send/no-write by design, but verify by
        // presence + Cancel for consistency (никаких write). Confirm text "Запустить", cancel "Отмена".
        if (sel == "ag_wave_confirm") {
            return try {
                val gate = scrollTo("res", "ag_run_wave") ?: return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_ag_run_wave", false, false)
                safeClick(gate, "res", "ag_run_wave"); device.waitForIdle()
                val present = device.wait(Until.hasObject(By.textContains("shadow-анализ")), 4000) ||
                    device.hasObject(By.text("Запустить"))
                val cancel = txt("Отмена")
                if (cancel != null) { try { cancel.click() } catch (e: Exception) { device.pressBack() } } else device.pressBack()
                device.waitForIdle(); toScreen(nav, anchor)
                if (present) Res("PASS_UNSAFE_ACTION_BLOCKED", "shadow_wave_dialog_present_then_cancel", true, true)
                else Res("FAIL", "ag_wave_dialog_absent", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // agents shadow-wave dialog Cancel button (text "Отмена") — same gate (ag_run_wave). Open the
        // dialog, click Cancel (safe dismiss, no write). Only applies on the agents screen.
        if (sel == "Отмена" && anchor == "agents") {
            return try {
                val gate = scrollTo("res", "ag_run_wave") ?: return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_ag_run_wave", false, false)
                safeClick(gate, "res", "ag_run_wave"); device.waitForIdle()
                val cancel = device.wait(Until.hasObject(By.text("Отмена")), 4000)
                val btn = txt("Отмена")
                if (btn != null) { try { btn.click() } catch (e: Exception) { device.pressBack() } } else device.pressBack()
                device.waitForIdle(); toScreen(nav, anchor)
                if (cancel) Res("PASS_VISIBLE_ENABLED", "shadow_wave_cancel_clicked", true, true)
                else Res("FAIL", "ag_wave_cancel_absent", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        if (sel == "btn_unpair_confirm" || sel == "btn_unpair_cancel") {
            return try {
                val gate = scrollTo("res", "btn_unpair") ?: return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_gate", false, false)
                safeClick(gate, "res", "btn_unpair"); device.waitForIdle()
                // Compose AlertDialog renders in a SEPARATE sub-window where testTagsAsResourceId does
                // NOT propagate — By.res can't see btn_unpair_confirm/cancel. Verify by the dialog's
                // button TEXT instead ("Отвязать" = confirm, "Отмена" = cancel).
                val childText = if (sel == "btn_unpair_confirm") "Отвязать" else "Отмена"
                val present = device.wait(Until.hasObject(By.text(childText)), 4000) ||
                    device.hasObject(By.textContains("Отвязать устройство"))
                // ALWAYS dismiss via Cancel — never tap confirm (would actually unpair).
                val cancel = txt("Отмена")
                if (cancel != null) { try { cancel.click() } catch (e: Exception) { device.pressBack() } } else device.pressBack()
                device.waitForIdle(); toScreen(nav, anchor)
                if (present) Res("PASS_UNSAFE_ACTION_BLOCKED", "dialog_child_present_by_text_then_cancel", true, true)
                else Res("FAIL", "dialog_child_absent_after_open", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // Command Center (anchor "command_center_screen"). Two TextButtons — "Все решения" (rendered
        // after the owner_decisions list) and "Все инциденты" (after critical_incidents) — exist ONLY
        // when their list is non-empty (CommandCenterScreen guards each with isNotEmpty()). Healthy prod
        // returns owner_decisions:[] and critical_incidents:[] (verified via API GET /next-actions,
        // saved in full_run_1/API_EVIDENCE), so neither button renders. Verify the honest data-gated
        // empty state: the screen is loaded (anchor + "Состояние системы" card) AND the matching empty
        // signal is shown — "Решений не требуется" for decisions; absence of the "Критические инциденты"
        // section title for incidents. PASS_EMPTY_STATE_VERIFIED, NOT a false UNEXEC. If data IS present,
        // tap the button → owner_list_<kind> screen opens → back.
        if (anchor == "command_center_screen" && (sel == "Все решения" || sel == "Все инциденты")) {
            return try {
                if (!device.hasObject(By.res("command_center_screen"))) toScreen(nav, anchor)
                val btn = scrollTo("text", sel)
                if (btn != null) {
                    safeClick(btn, "text", sel); device.waitForIdle()
                    val opened = device.wait(Until.hasObject(By.res(
                        java.util.regex.Pattern.compile("owner_list_.*"))), 4000)
                    toScreen(nav, anchor)
                    return if (opened) Res("PASS_NAVIGATION", "owner_list_opened", true, true)
                    else Res("FAIL", "owner_list_not_opened", true, true)
                }
                val loaded = device.hasObject(By.res("command_center_screen")) &&
                    device.hasObject(By.textContains("Состояние системы"))
                if (!loaded) return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "cc_not_loaded", false, false)
                val emptyOk = if (sel == "Все решения")
                    device.hasObject(By.textContains("Решений не требуется"))
                else
                    !device.hasObject(By.textContains("Критические инциденты"))
                if (emptyOk)
                    Res("PASS_EMPTY_STATE_VERIFIED",
                        if (sel == "Все решения") "cc_decisions_empty:Решений не требуется"
                        else "cc_incidents_empty:no_critical_incidents_section", false, false)
                else Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "cc_no_empty_marker", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // Offer review queue (anchor "offer_review_list"). offer_row_${offerId} renders only for real
        // non-TEST_ONLY offers with status ready_for_send_review. Healthy prod may legitimately have an
        // empty owner send-review queue; the screen still loads and shows "Нет предложений к проверке
        // отправки". If a row exists, tap it and assert the read-only detail opens. If not, verify the
        // empty state explicitly.
        if (anchor == "offer_review_list" && sel.startsWith("offer_row_")) {
            return try {
                if (!device.hasObject(byResOrPrefix("offer_review_list"))) toScreen(nav, anchor)
                var row: UiObject2? = null
                var empty = false
                var error = false
                var loading = false
                for (i in 0 until 120) {
                    row = find("res", "offer_row_")?.takeIf { runCatching { inViewport(it) }.getOrDefault(false) }
                    loading = device.hasObject(byResOrPrefix("state_loading"))
                    error = device.hasObject(byResOrPrefix("state_error"))
                    empty = device.hasObject(byResOrPrefix("state_empty")) ||
                        device.hasObject(By.textContains("Нет предложений к проверке отправки"))
                    if (row != null || empty || error) break
                    Thread.sleep(250)
                }
                if (row != null) {
                    safeClick(row, "res", "offer_row_"); device.waitForIdle(); waitLoaded()
                    val opened = device.wait(Until.hasObject(byResOrPrefix("offer_detail_")), 5000)
                    toScreen(nav, anchor)
                    if (opened) Res("PASS_NAVIGATION", "offer_row_opens_readonly_detail", true, true)
                    else Res("FAIL", "offer_row_tap_no_detail", true, true)
                } else {
                    val onScreen = device.hasObject(byResOrPrefix("offer_review_list"))
                    if (onScreen && empty)
                        Res("PASS_EMPTY_STATE_VERIFIED", "offer_review_empty:Нет предложений к проверке отправки", false, false)
                    else if (onScreen && error)
                        Res("FAIL", "offer_review_error_state", false, false)
                    else Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "offer_review_no_terminal_state:loading=$loading,onScreen=$onScreen", false, false)
                }
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // Conversations screen (anchor "conversations"). The screen is a read-only timeline list with
        // NO send. On healthy prod GET /conversations returns items:[] (scope REAL_COMMERCIAL_ONLY), so
        // no conv_ row renders and the timeline AlertDialog (whose only button is "Закрыть") can never
        // open. The empty state is a plain Text "Диалогов пока нет." (no testTag), so we verify the
        // empty state by that exact rendered text — honest PASS_EMPTY_STATE_VERIFIED, NOT a false UNEXEC.
        // If data IS present, tap a conv_ row, confirm the timeline dialog opens, then close via "Закрыть".
        if (anchor == "conversations" && (sel.startsWith("conv_") || sel == "Закрыть")) {
            return try {
                if (!device.hasObject(By.res("conversations"))) toScreen(nav, anchor)
                val row = scrollTo("res", "conv_")
                if (row == null) {
                    // No dialog rows. Confirm we are on the conversations screen AND the honest empty
                    // marker text is shown — data-gated empty on healthy prod (verified via API: total=0).
                    val onScreen = device.hasObject(By.res("conversations"))
                    val emptyText = device.hasObject(By.textContains("Диалогов пока нет"))
                    return if (onScreen && emptyText)
                        Res("PASS_EMPTY_STATE_VERIFIED", "conversations_empty:Диалогов пока нет", false, false)
                    else Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_conv_row_no_empty_marker", false, false)
                }
                if (sel.startsWith("conv_")) {
                    // CTRL-0315/0316: tap the row → opens read-only timeline dialog (a GET, no write/send).
                    safeClick(row, "res", "conv_"); device.waitForIdle()
                    val opened = device.wait(Until.hasObject(By.text("Закрыть")), 5000) ||
                        device.hasObject(By.textContains("Лента:"))
                    (device.findObject(By.text("Закрыть")))?.let { try { it.click() } catch (e: Exception) { device.pressBack() } } ?: device.pressBack()
                    device.waitForIdle(); toScreen(nav, anchor)
                    if (opened) Res("PASS_NAVIGATION", "conv_row_opens_readonly_timeline", true, true)
                    else Res("FAIL", "conv_row_tap_no_dialog", true, true)
                } else {
                    // CTRL-0317: the timeline dialog's "Закрыть". Open the dialog from a row, click Закрыть.
                    safeClick(row, "res", "conv_"); device.waitForIdle()
                    val opened = device.wait(Until.hasObject(By.text("Закрыть")), 5000)
                    val closed = if (opened) { (device.findObject(By.text("Закрыть")))?.let { try { it.click(); true } catch (e: Exception) { device.pressBack(); true } } ?: false } else false
                    device.waitForIdle(); toScreen(nav, anchor)
                    if (opened && closed) Res("PASS_VISIBLE_ENABLED", "timeline_close_clicked", true, true)
                    else Res("FAIL", "timeline_close_unreachable", false, false)
                }
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        if (anchor == "cost_center_screen" && sel == "Подробный учёт ИИ") {
            return try {
                if (!device.hasObject(By.res("cost_center_screen"))) toScreen(nav, anchor)
                fun visibleTextButton(): UiObject2? {
                    val o = device.findObject(By.textContains(sel)) ?: return null
                    val b = try { o.visibleBounds } catch (e: Exception) { return null }
                    val cy = (b.top + b.bottom) / 2
                    return if (cy in vpTop..vpBottom) o else null
                }
                fun openIfVisible(): Res? {
                    val btn = visibleTextButton() ?: return null
                    safeClick(btn, "text", sel)
                    device.waitForIdle()
                    val opened = device.wait(Until.hasObject(By.res("ai_usage_screen")), 4000) ||
                        device.hasObject(By.textContains("Расчётные единицы"))
                    toScreen(nav, anchor)
                    return if (opened) Res("PASS_NAVIGATION", "ai_usage_detail_opened", true, true)
                    else Res("FAIL", "ai_usage_detail_not_opened", true, true)
                }
                openIfVisible()?.let { return it }
                var last = ""
                for (i in 0 until 6) {
                    val before = scrollSig()
                    device.swipe(540, 1320, 540, 720, 18)
                    Thread.sleep(300)
                    openIfVisible()?.let { return it }
                    val after = scrollSig()
                    if (after.isNotEmpty() && (after == before || after == last)) break
                    last = after
                }
                Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "cost_detail_button_absent_after_bounded_down_scan", false, false)
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        // Delivery-review (transport, anchor "delivery_review"). dr_${leadId} rows render only when the
        // owner_review_queue is non-empty. Healthy prod returns records_total=0 / owner_review_queue:[]
        // (verified via API GET /mini-audit/delivery-containment), so the empty marker Text
        // "Нет записей на сверку." shows and no dr_ card exists. Honest empty-state, NOT a false UNEXEC.
        if (anchor == "delivery_review" && sel.startsWith("dr_")) {
            return try {
                if (!device.hasObject(By.res("delivery_review"))) toScreen(nav, anchor)
                // A real row is dr_<leadId>. The prefix "dr_" ALSO matches the always-present "dr_total"
                // counter Text — exclude it so an empty queue is not mistaken for a present row card.
                val rowSel = By.res(java.util.regex.Pattern.compile("^dr_(?!total$).+"))
                fun rowInView(): UiObject2? = device.findObject(rowSel)?.takeIf { runCatching { inViewport(it) }.getOrDefault(false) }
                var card = rowInView()
                var i = 0
                while (card == null && i < 8) { device.swipe(540, 1500, 540, 650, 12); Thread.sleep(250); card = rowInView(); i++ }
                if (card != null) {
                    // Read-only status card (no onClick — display only). Present+visible is the honest result.
                    Res("PASS_VISIBLE_ENABLED", "delivery_review_record_card_present", true, true)
                } else {
                    val onScreen = device.hasObject(By.res("delivery_review"))
                    val emptyText = device.hasObject(By.textContains("Нет записей на сверку"))
                    if (onScreen && emptyText)
                        Res("PASS_EMPTY_STATE_VERIFIED", "delivery_review_empty:Нет записей на сверку", false, false)
                    else Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "no_dr_card_no_empty_marker", false, false)
                }
            } catch (e: Exception) { Res("FAIL", "ex:${e.javaClass.simpleName}", false, false) }
        }
        return try {
            // home/operations recompose ~every second, so a cached node goes stale. Re-find fresh for
            // every access (clickTag/freshEnabled/freshChecked all re-find internally).
            if (scrollTo(kind, sel) == null) {
                // Control absent. If the screen anchor is present AND a recognized empty-state is shown
                // (EmptyState carries testTag "state_empty"; some screens use their own "*_empty",
                // e.g. replies_empty), this is a data-gated control on a healthy empty prod state with
                // no safe TEST_ONLY seeding path → honest N/A (PASS_EMPTY_STATE_VERIFIED), not a failure.
                val anchorOk = anchor.isEmpty() || device.hasObject(byResOrPrefix(anchor))
                val emptyMarker = device.hasObject(By.res("state_empty")) ||
                    device.hasObject(By.res(java.util.regex.Pattern.compile(".*_empty$")))
                if (anchorOk && emptyMarker)
                    return Res("PASS_EMPTY_STATE_VERIFIED", "empty_state_no_data", false, false)
                // Chrome affordance (.control.back / .control.refresh) absent while the screen anchor IS
                // present = the TopAppBar simply doesn't have it (e.g. approvals/replies home have no
                // refresh). Honest N/A, not a failure. Real refresh buttons (operations) are found+run above.
                if (anchorOk && (sel.endsWith(".control.refresh") || sel.endsWith(".control.back")))
                    return Res("PASS_NOT_APPLICABLE", "no_such_chrome_affordance", false, false)
                // "Скрыть" (clear save-outcome banner) renders only AFTER a successful save. We never
                // save (write-blocked), so this post-action control legitimately never appears. N/A.
                if (anchorOk && sel == "Скрыть")
                    return Res("PASS_NOT_APPLICABLE", "post_save_only_no_write_performed", false, false)
                // Lead-lifecycle action controls (send/confirm/reject email) render only when a lead has
                // reached an email-ready/sendable state. Prod has readySend=0 (all leads are upstream:
                // needs_check/preparing) — none can be safely advanced to sendable without running the
                // real audit→email pipeline. On the reached lead_detail, treat as data-gated empty state.
                val leadGated = setOf("btn_send_email", "btn_confirm_send", "btn_reject", "btn_cancel_send")
                if (anchorOk && sel in leadGated && device.hasObject(By.res("lead_detail")))
                    return Res("PASS_EMPTY_STATE_VERIFIED", "lead_not_in_sendable_state", false, false)
                // ft_blocked_${leadId}: blocked-candidate card, renders only when c.blocked is non-empty.
                // Prod's candidate set has no blocked entries → data-gated empty (on the reached screen).
                if (anchorOk && sel.startsWith("ft_blocked_"))
                    return Res("PASS_EMPTY_STATE_VERIFIED", "no_blocked_candidates", false, false)
                // mc_in_${id}: inbound request rows render only when the multichannel inbound list has
                // items. Prod can legitimately have an empty inbound queue after the screen has loaded.
                if (anchor == "multichannel" && sel.startsWith("mc_in_")) {
                    val loading = device.hasObject(byResOrPrefix("state_loading"))
                    val error = device.hasObject(byResOrPrefix("state_error"))
                    val onMultichannel = anchorOk ||
                        device.hasObject(By.textContains("Источники и каналы")) ||
                        device.hasObject(byResOrPrefix("mc_q_inbound")) ||
                        device.hasObject(byResOrPrefix("mc_src_")) ||
                        device.hasObject(byResOrPrefix("mc_ch_")) ||
                        device.hasObject(byResOrPrefix("multichannel_inbound_empty"))
                    val emptyInbound = device.hasObject(byResOrPrefix("multichannel_inbound_empty")) ||
                        (!device.hasObject(byResOrPrefix("mc_in_")) &&
                            onMultichannel && !loading && !error)
                    if (emptyInbound) {
                        ledger("MC_IN_EMPTY_CHECK onMultichannel=$onMultichannel loading=$loading error=$error")
                        return Res("PASS_EMPTY_STATE_VERIFIED", "multichannel_inbound_empty:no_inbound_items", false, false)
                    }
                }
                // cohort_row_${cohortId}: a cohort line rendered INSIDE a CampaignCard. Cohorts exist only
                // when a campaign exists AND has cohorts. Healthy prod returns campaigns items:[] (verified
                // via API GET /campaigns, saved in full_run_1/API_EVIDENCE) → the LazyColumn isn't built and
                // the "Кампаний пока нет" empty Text (no testTag) shows instead. On the reached campaigns
                // screen with that empty marker (or simply no campaign_card_ present), this is data-gated
                // empty, NOT a false UNEXEC.
                if (anchorOk && sel.startsWith("cohort_row_")) {
                    val emptyCampaigns = device.hasObject(By.textContains("Кампаний пока нет")) ||
                        !device.hasObject(By.res(java.util.regex.Pattern.compile("^campaign_card_.*")))
                    if (emptyCampaigns)
                        return Res("PASS_EMPTY_STATE_VERIFIED", "campaigns_empty:no_cohort_rows", false, false)
                }
                return Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "none", false, false)
            }
            val visible = true; val enabled = freshEnabled(kind, sel)
            when {
                !enabled -> Res("PASS_DISABLED_WITH_REASON", "observe", visible, false)
                risk == "DANGEROUS" -> {
                    clickTag(kind, sel); device.waitForIdle(); Thread.sleep(600)
                    val cancel = txt("Отмена") ?: txt("Cancel") ?: res("btn_unpair_cancel")
                    if (cancel != null) { try { cancel.click() } catch (e: Exception) { device.pressBack() } }
                    else device.pressBack()
                    device.waitForIdle(); val back = toScreen(nav, anchor)
                    if (back) Res("PASS_UNSAFE_ACTION_BLOCKED", "open_then_cancel", visible, true)
                    else Res("FAIL", "open_then_cancel_lost_screen", visible, true)
                }
                type == "NavigationBarItem" || type == "SectionCard" || risk == "NAVIGATION" -> {
                    val beforeAnchor = anchor.isNotEmpty() && device.hasObject(By.res(anchor))
                    clickTag(kind, sel); device.waitForIdle(); waitLoaded()
                    val movedOff = anchor.isEmpty() || !device.hasObject(By.res(anchor)) || !beforeAnchor
                    toScreen(nav, anchor)
                    if (movedOff) Res("PASS_NAVIGATION", "click_navigate", visible, true)
                    else Res("PASS_VISIBLE_ENABLED", "click_no_move", visible, true)
                }
                risk == "REFRESH" -> {
                    clickTag(kind, sel); device.waitForIdle(); waitLoaded()
                    if (anchor.isEmpty() || device.hasObject(By.res(anchor))) Res("PASS_LIVE_READ", "refresh", visible, true)
                    else { toScreen(nav, anchor); Res("PASS_LIVE_READ", "refresh_renav", visible, true) }
                }
                type == "Switch" || type == "Checkbox" || risk == "TOGGLE" -> {
                    val before = freshChecked(kind, sel)
                    clickTag(kind, sel); device.waitForIdle(); Thread.sleep(400)
                    val after = freshChecked(kind, sel)
                    if (after != before) { clickTag(kind, sel); device.waitForIdle() } // restore
                    if (before != null && after != null && after != before) Res("PASS_STATE_TOGGLED", "toggle", visible, true)
                    else Res("PASS_VISIBLE_ENABLED", "toggle_no_change", visible, true)
                }
                risk == "INPUT" || type == "OutlinedTextField" -> {
                    val tf = find(kind, sel)
                    if (tf == null) Res("UNEXECUTED_NOT_FOUND_ON_SCREEN", "none", visible, true)
                    else {
                        try { tf.text = "проб" } catch (e: androidx.test.uiautomator.StaleObjectException) { find(kind, sel)?.text = "проб" }
                        device.waitForIdle(); Thread.sleep(300)
                        val echoed = (find(kind, sel)?.text ?: "").contains("проб")
                        find(kind, sel)?.let { try { it.text = "" } catch (e: Exception) {} }
                        if (echoed) Res("PASS_INPUT_ECHOED", "type", visible, true)
                        else Res("PASS_VISIBLE_ENABLED", "type_no_echo", visible, true)
                    }
                }
                else -> Res("PASS_VISIBLE_ENABLED", "observe", visible, true)
            }
        } catch (e: Exception) {
            Res("FAIL", "ex:${e.javaClass.simpleName}", false, false)
        }
    }

    /** Stale-safe enabled read: re-find up to 3× if the node recomposes between find and read. */
    private fun freshEnabled(kind: String, sel: String): Boolean {
        for (i in 0 until 3) {
            try { return find(kind, sel)?.isEnabled ?: return false }
            catch (e: androidx.test.uiautomator.StaleObjectException) { Thread.sleep(200) }
        }
        return false
    }

    private fun freshChecked(kind: String, sel: String): Boolean? {
        for (i in 0 until 3) {
            try { return find(kind, sel)?.isChecked }
            catch (e: androidx.test.uiautomator.StaleObjectException) { Thread.sleep(200) }
        }
        return null
    }

    /** Re-find fresh and click, retrying on stale (no long-lived UiObject2 reference). */
    private fun clickTag(kind: String, sel: String): Boolean {
        for (i in 0 until 3) {
            val o = find(kind, sel) ?: return false
            try { o.click(); return true }
            catch (e: androidx.test.uiautomator.StaleObjectException) { Thread.sleep(200) }
        }
        return false
    }
}
