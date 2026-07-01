// scan_static_controls.mjs — programmatic static inventory of interactive Compose controls.
// Scans the release-runtime main source (excludes test/androidTest/build/@Preview) and emits one
// record per interactive control occurrence with file:line, type, nearest testTag, and screen route.
// Deterministic; no network. Output: STATIC_CONTROL_INVENTORY.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller';
const OUT = process.argv[3] || '_generated/android_acceptance_lab/exhaustive/STATIC_CONTROL_INVENTORY.json';

// Interactive control signatures. Order matters: more specific first.
const CONTROL_PATTERNS = [
    { type: 'NavigationBarItem', re: /\bNavigationBarItem\s*\(/ },
    { type: 'IconButton', re: /\bIconButton\s*\(/ },
    { type: 'FloatingActionButton', re: /\bFloatingActionButton\s*\(/ },
    { type: 'OutlinedButton', re: /\bOutlinedButton\s*\(/ },
    { type: 'ElevatedButton', re: /\bElevatedButton\s*\(/ },
    { type: 'FilledTonalButton', re: /\bFilledTonalButton\s*\(/ },
    { type: 'TextButton', re: /\bTextButton\s*\(/ },
    { type: 'Button', re: /\bButton\s*\(/ },
    { type: 'FilterChip', re: /\bFilterChip\s*\(/ },
    { type: 'AssistChip', re: /\bAssistChip\s*\(/ },
    { type: 'DropdownMenuItem', re: /\bDropdownMenuItem\s*\(/ },
    { type: 'Switch', re: /\bSwitch\s*\(/ },
    { type: 'Checkbox', re: /\bCheckbox\s*\(/ },
    { type: 'RadioButton', re: /\bRadioButton\s*\(/ },
    { type: 'Slider', re: /\bSlider\s*\(/ },
    { type: 'OutlinedTextField', re: /\bOutlinedTextField\s*\(/ },
    { type: 'TextField', re: /\bTextField\s*\(/ },
    { type: 'SearchBar', re: /\bSearchBar\s*\(/ },
    { type: 'SectionCard', re: /\bSectionCard\s*\(/ },
    { type: 'Tab', re: /\bTab\s*\(/ },
];
// Secondary clickable signals (Modifier-based) — captured only if a row also has onClick/clickable.
const CLICK_SIGNAL = /\bonClick\s*=|\.clickable\b|combinedClickable|toggleable|selectable|onCheckedChange|onValueChange|onLongClick/;

function listKt(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!/[\\/](build|test|androidTest)[\\/]?$/.test(p)) out.push(...listKt(p)); }
        else if (e.name.endsWith('.kt') && !e.name.endsWith('.template')) out.push(p);
    }
    return out;
}

// nearest testTag on the same or next ~3 lines. Also recognizes SectionCard's `tag = "..."` param.
function findTag(lines, idx) {
    for (let i = idx; i < Math.min(idx + 18, lines.length); i++) {
        const m = lines[i].match(/testTag\(\s*"([^"]+)"/);
        if (m) return m[1];
        const t = lines[i].match(/\btag\s*=\s*"([^"]+)"/);
        if (t) return t[1];
        const d = lines[i].match(/testTag\(\s*"([^"]*\$\{?[^"]*)"/);
        if (d) return d[1];
        // stop if we hit the next top-level control to avoid borrowing its tag
        if (i > idx && /^\s{0,20}(Button|TextButton|IconButton|OutlinedButton|SectionCard|Switch|Checkbox|FilterChip|Tab|Card)\s*\(/.test(lines[i])) break;
    }
    for (let i = Math.max(0, idx - 2); i < idx; i++) {
        const m = lines[i].match(/testTag\(\s*"([^"]+)"/);
        if (m) return m[1];
    }
    return null;
}

function screenRoute(file) {
    // feature/<area>/<File>.kt  → route hint = area
    const m = file.replace(/\\/g, '/').match(/feature\/([^/]+)\//);
    return m ? m[1] : path.basename(path.dirname(file));
}

const files = listKt(ROOT);
const records = [];
let seq = 0;
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    const rel = f.replace(/\\/g, '/').replace(/.*\/ru\/dmitry\/matercontroller\//, '');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/@Preview/.test(line)) continue;
        // Exclude non-control lines: imports, sealed-class/data-object type defs, function signatures.
        if (/^\s*import\s/.test(line)) continue;
        if (/\b(sealed class|data object|data class|class|object|enum)\b/.test(line)) continue;
        if (/^\s*(private |internal |public )?fun\s/.test(line)) continue;
        let matched = null;
        for (const cp of CONTROL_PATTERNS) { if (cp.re.test(line)) { matched = cp.type; break; } }
        // Modifier.clickable-style controls without a Composable signature
        if (!matched && CLICK_SIGNAL.test(line) && !/fun\s|private fun|interface |val on[A-Z]/.test(line)) {
            // skip lambda param declarations like "onClick: () -> Unit"
            if (!/:\s*\(\)\s*->/.test(line)) matched = 'Clickable';
        }
        if (!matched) continue;
        seq += 1;
        const tag = findTag(lines, i);
        const textM = line.match(/Text\("([^"]+)"\)|label\s*=\s*\{\s*Text\("([^"]+)"\)/);
        records.push({
            control_id: `CTRL-${String(seq).padStart(4, '0')}`,
            control_type: matched,
            source_file: rel,
            source_line: i + 1,
            screen_route: screenRoute(f),
            test_tag: tag,
            has_explicit_tag: !!tag,
            line_excerpt: line.trim().slice(0, 160),
            visible_text: textM ? (textM[1] || textM[2]) : null,
        });
    }
}

const byType = {};
for (const r of records) byType[r.control_type] = (byType[r.control_type] || 0) + 1;
const byScreen = {};
for (const r of records) byScreen[r.screen_route] = (byScreen[r.screen_route] || 0) + 1;
const missingTag = records.filter((r) => !r.has_explicit_tag).length;

const result = {
    scan_version: 'static_v2',
    scanned_files: files.length,
    total_controls: records.length,
    controls_with_tag: records.length - missingTag,
    controls_missing_tag: missingTag,
    by_type: byType,
    by_screen: byScreen,
    controls: records,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`scanned ${files.length} files`);
console.log(`total interactive controls: ${records.length}`);
console.log(`with testTag: ${records.length - missingTag} | missing: ${missingTag}`);
console.log('by_type:', JSON.stringify(byType));
