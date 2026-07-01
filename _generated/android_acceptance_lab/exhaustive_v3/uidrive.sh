#!/usr/bin/env bash
# uidrive.sh — manual UI driver for screen-by-screen acceptance (read-only nav + dump).
# Usage:
#   uidrive.sh dump <name>           -> dump UI hierarchy to <name>.xml and print texts+resource-ids
#   uidrive.sh taprid <resource-id>  -> tap center of node with exact resource-id (testTag)
#   uidrive.sh taptext <text>        -> tap center of node whose text contains <text>
#   uidrive.sh scroll <dir>          -> swipe up(=down content)/down
# Never sends, never confirms. Pure navigation + observation.
export MSYS_NO_PATHCONV=1
ADB="/c/Users/dima-/AppData/Local/Android/Sdk/platform-tools/adb.exe"
OUT="D:/AI_WORKSPACE/.claude/worktrees/android-exhaustive-control-acceptance-v2/_generated/android_acceptance_lab/exhaustive_v3"
cmd="$1"; arg="$2"

dump_xml() {
  "$ADB" shell uiautomator dump /sdcard/_ui.xml >/dev/null 2>&1
  "$ADB" pull /sdcard/_ui.xml "$OUT/$1.xml" >/dev/null 2>&1
}

case "$cmd" in
  dump)
    dump_xml "$arg"
    node "$OUT/uiparse.js" "$OUT/$arg.xml"
    ;;
  taprid)
    dump_xml _tmp
    read -r cx cy < <(node "$OUT/uiparse.js" "$OUT/_tmp.xml" center-rid "$arg")
    if [ -z "$cx" ]; then echo "NOT_FOUND rid=$arg"; exit 3; fi
    "$ADB" shell input tap "$cx" "$cy"; echo "tapped rid=$arg @ $cx,$cy"; sleep 1.5
    ;;
  taptext)
    dump_xml _tmp
    read -r cx cy < <(node "$OUT/uiparse.js" "$OUT/_tmp.xml" center-text "$arg")
    if [ -z "$cx" ]; then echo "NOT_FOUND text=$arg"; exit 3; fi
    "$ADB" shell input tap "$cx" "$cy"; echo "tapped text=$arg @ $cx,$cy"; sleep 1.5
    ;;
  scroll)
    if [ "$arg" = "down" ]; then "$ADB" shell input swipe 540 1600 540 600 300; else "$ADB" shell input swipe 540 600 540 1600 300; fi
    sleep 0.8; echo "scrolled $arg"
    ;;
  *) echo "unknown cmd: $cmd"; exit 2;;
esac
