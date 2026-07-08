#!/usr/bin/env python3
"""
D&G Collection RetailOS — Desktop App Builder
Builds DG Collection.app on the Desktop using the project SVG icon.
"""

import os, sys, subprocess, shutil, stat, struct, zlib
from pathlib import Path

APP_NAME   = "DGC POS"
APP_DIR    = Path(__file__).parent
DESKTOP    = Path.home() / "Desktop"
APP_BUNDLE = DESKTOP / f"{APP_NAME}.app"
PNG_SRC    = APP_DIR / "frontend" / "public" / "icons" / "icon-source.png"
SVG_SRC    = APP_DIR / "frontend" / "public" / "icons" / "icon.svg"
TMP_DIR    = Path("/tmp/dgc_iconbuild")

# ── SVG → PNG via qlmanage ────────────────────────────────────────────────────

def png_to_png(size, out_path):
    """Resize user-provided PNG icon to target size."""
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    if not PNG_SRC.exists():
        return False
    subprocess.run(["sips", "-z", str(size), str(size), str(PNG_SRC), "--out", str(out_path)],
                   capture_output=True)
    return out_path.exists()


def svg_to_png(size, out_path):
    """Render SVG to PNG at given size using macOS qlmanage."""
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp_svg = TMP_DIR / f"icon_{size}.svg"
    shutil.copy(SVG_SRC, tmp_svg)
    result = subprocess.run(
        ["qlmanage", "-t", "-s", str(size), "-o", str(TMP_DIR), str(tmp_svg)],
        capture_output=True
    )
    # qlmanage outputs to <file>.png
    rendered = TMP_DIR / f"icon_{size}.svg.png"
    if rendered.exists():
        shutil.copy(rendered, out_path)
        rendered.unlink()
        return True

    # Fallback: use sips to resize a larger render
    fallback = TMP_DIR / "icon_512.svg.png"
    if fallback.exists():
        subprocess.run(["sips", "-z", str(size), str(size), str(fallback), "--out", str(out_path)],
                       capture_output=True)
        return True
    return False


def build_iconset(res_dir):
    iconset = res_dir / "AppIcon.iconset"
    iconset.mkdir(parents=True, exist_ok=True)

    sizes = [
        ("icon_16x16",       16,  False),
        ("icon_16x16@2x",    32,  False),
        ("icon_32x32",       32,  False),
        ("icon_32x32@2x",    64,  False),
        ("icon_128x128",    128,  False),
        ("icon_128x128@2x", 256,  False),
        ("icon_256x256",    256,  False),
        ("icon_256x256@2x", 512,  False),
        ("icon_512x512",    512,  False),
        ("icon_512x512@2x",1024,  False),
    ]

    # Render each unique size
    print("  🎨  Rendering sizes:", end="", flush=True)
    rendered_sizes = {}
    for name, px, _ in sizes:
        if px not in rendered_sizes:
            print(f" {px}px", end="", flush=True)
            tmp = TMP_DIR / f"render_{px}.png"
            if PNG_SRC.exists():
                png_to_png(px, tmp)
            else:
                svg_to_png(px, tmp)
            rendered_sizes[px] = tmp
        dst = iconset / f"{name}.png"
        if px in rendered_sizes and rendered_sizes[px].exists():
            shutil.copy(rendered_sizes[px], dst)
        else:
            # resize from largest available
            largest = max(rendered_sizes.items(), key=lambda x: x[0])
            subprocess.run(["sips", "-z", str(px), str(px), str(largest[1]), "--out", str(dst)],
                           capture_output=True)
    print()

    # iconutil → .icns
    icns = res_dir / "AppIcon.icns"
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns)], check=True)
    shutil.rmtree(iconset)
    shutil.rmtree(TMP_DIR, ignore_errors=True)
    print("  ✅  AppIcon.icns created")
    return icns


# ── App bundle pieces ─────────────────────────────────────────────────────────

INFO_PLIST = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>          <string>launcher</string>
    <key>CFBundleIconFile</key>            <string>AppIcon</string>
    <key>CFBundleIdentifier</key>          <string>np.gurushah.dgcollection.retailos</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key>                <string>DGC POS</string>
    <key>CFBundleDisplayName</key>         <string>DGC POS</string>
    <key>CFBundleShortVersionString</key>  <string>1.0.0</string>
    <key>CFBundleVersion</key>             <string>1</string>
    <key>CFBundlePackageType</key>         <string>APPL</string>
    <key>CFBundleSignature</key>           <string>DGCR</string>
    <key>LSUIElement</key>                 <false/>
    <key>NSHighResolutionCapable</key>     <true/>
    <key>LSMinimumSystemVersion</key>      <string>11.0</string>
    <key>NSHumanReadableCopyright</key>    <string>© 2026 DGC POS · Smart POS Solutions</string>
    <key>NSAppleEventsUsageDescription</key><string>DG Collection RetailOS needs to show notifications.</string>
</dict>
</plist>
"""

LAUNCHER_SCRIPT = '''\
#!/bin/bash
# ═══════════════════════════════════════════════════════
#  D&G Collection RetailOS — Desktop Launcher
#  Auto-generated by make-desktop-icon.py
# ═══════════════════════════════════════════════════════

APP_DIR="{app_dir}"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

# ── Stop any previous instances ──────────────────────
pkill -f "venv/bin/python3 app.py" 2>/dev/null
pkill -f "vite"                    2>/dev/null
sleep 1

# ── Startup notification ─────────────────────────────
osascript -e \'display notification "RetailOS is starting…" with title "D&G Collection" subtitle "Please wait a moment"\' 2>/dev/null

# ── Start Flask backend ──────────────────────────────
cd "$APP_DIR/backend"
nohup venv/bin/python3 app.py >> "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"

# ── Wait for backend ─────────────────────────────────
for i in $(seq 1 25); do
  if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ── Start Vite frontend ──────────────────────────────
cd "$APP_DIR/frontend"
nohup npm run dev >> "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"

# ── Wait for frontend ────────────────────────────────
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ── Open browser ─────────────────────────────────────
open "http://localhost:5173"

# ── Ready notification ───────────────────────────────
osascript -e \'display notification "System is ready — opening in browser" with title "D&G Collection" subtitle "✅ RetailOS running"\' 2>/dev/null
'''


def build_app():
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║   DGC POS — Desktop App Icon Builder                 ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    # Remove old bundle if exists
    if APP_BUNDLE.exists():
        shutil.rmtree(APP_BUNDLE)
        print("  ♻️   Removed previous bundle")

    # Create directory structure
    contents  = APP_BUNDLE / "Contents"
    macos_dir = contents / "MacOS"
    res_dir   = contents / "Resources"
    macos_dir.mkdir(parents=True)
    res_dir.mkdir(parents=True)
    print("  📁  Bundle structure created")

    # Build icon
    if PNG_SRC.exists() or SVG_SRC.exists():
        src = "user PNG icon" if PNG_SRC.exists() else "project SVG icon"
        print(f"  🖼️   Using {src}…")
        build_iconset(res_dir)
    else:
        print("  ⚠️   Icon source not found — skipping icon")

    # Write Info.plist
    (contents / "Info.plist").write_text(INFO_PLIST)
    print("  📄  Info.plist written")

    # Write PkgInfo
    (contents / "PkgInfo").write_bytes(b"APPLCGCR")

    # Write launcher
    launcher = macos_dir / "launcher"
    launcher.write_text(LAUNCHER_SCRIPT.format(app_dir=str(APP_DIR)))
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print("  🚀  Launcher script written")

    # Clear quarantine
    subprocess.run(["xattr", "-cr", str(APP_BUNDLE)], capture_output=True)

    # Refresh Finder / Dock
    subprocess.run(["touch", str(APP_BUNDLE)], capture_output=True)
    subprocess.run(["killall", "Dock"], capture_output=True)

    print()
    print(f"  ✅  Created:  {APP_BUNDLE}")
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║  🎉  DGC POS.app is on your Desktop!                 ║")
    print("║                                                      ║")
    print("║  • Double-click to launch RetailOS                  ║")
    print("║  • Drag to Dock for quick access                    ║")
    print("║  • Or drag to Applications folder to install        ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()


if __name__ == "__main__":
    build_app()
