// add_nav_testtags.mjs — add stable, unique testTags to the uniform back-nav IconButtons and
// refresh buttons across owner screens. Conservative: only patches exact known-safe patterns, adds
// the testTag import if absent, and never touches a line that already has a testTag.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'apps/mater_controller_android/app/src/main/java/ru/dmitry/matercontroller/feature';
function listKt(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listKt(p));
        else if (e.name.endsWith('.kt')) out.push(p);
    }
    return out;
}
function route(file) {
    const m = file.replace(/\\/g, '/').match(/feature\/([^/]+)\//);
    return m ? m[1] : 'screen';
}
let patched = 0; const changedFiles = new Set();
for (const f of listKt(ROOT)) {
    let src = fs.readFileSync(f, 'utf8');
    const r = route(f);
    let changed = false;

    // 1) back-nav IconButton: IconButton(onClick = onBack) { Icon(...ArrowBack...) }
    src = src.replace(/IconButton\(onClick = onBack\)(\s*\{\s*Icon\()/g, (m, tail) => {
        changed = true; patched++;
        return `IconButton(onClick = onBack, modifier = Modifier.testTag("screen.${r}.control.back"))${tail}`;
    });

    // 2) refresh TextButton: TextButton(onClick = vm::refresh) { Text("Обновить") }
    src = src.replace(/TextButton\(onClick = vm::refresh\)(\s*\{\s*Text\("Обновить"\))/g, (m, tail) => {
        changed = true; patched++;
        return `TextButton(onClick = vm::refresh, modifier = Modifier.testTag("screen.${r}.control.refresh"))${tail}`;
    });

    if (changed) {
        // ensure imports
        if (!/import androidx\.compose\.ui\.platform\.testTag/.test(src)) {
            src = src.replace(/(import androidx\.compose\.ui\.Modifier\n)/, `$1import androidx.compose.ui.platform.testTag\n`);
            if (!/import androidx\.compose\.ui\.platform\.testTag/.test(src)) {
                // fallback: add after package line's first import block
                src = src.replace(/(\nimport [^\n]+\n)/, `$1import androidx.compose.ui.platform.testTag\n`);
            }
        }
        if (!/import androidx\.compose\.ui\.Modifier/.test(src)) {
            src = src.replace(/(import androidx\.compose\.ui\.platform\.testTag\n)/, `import androidx.compose.ui.Modifier\n$1`);
        }
        fs.writeFileSync(f, src);
        changedFiles.add(f.replace(/\\/g, '/').replace(/.*\/feature\//, 'feature/'));
    }
}
console.log(`patched ${patched} controls across ${changedFiles.size} files`);
[...changedFiles].sort().forEach((f) => console.log('  ' + f));
