#!/bin/bash
# Builds Keystone.app (universal: Apple silicon + Intel) and a zip of it into apple/build.
# Needs Xcode or the Xcode Command Line Tools (xcode-select --install) on macOS 14 or later.
#
#   ./build.sh          version 0.1.0
#   ./build.sh 0.2.0    explicit version (CI passes the tag's version)
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${1:-0.1.0}"
APP="build/Keystone.app"
ZIP="build/Keystone-v$VERSION-macos.zip"
OBJ="build/obj"

# The generated theme, seed and assets must match /shared before anything is built.
if command -v node >/dev/null; then node ../scripts/sync-shared.mjs --check; fi

swift build -c release --arch arm64 --arch x86_64
BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)"

rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OBJ"
cp "$BIN/Keystone" "$APP/Contents/MacOS/Keystone"
# Inside Contents/Resources, not beside Contents, so the bundle can be signed;
# AppResources looks here first.
cp -R "$BIN/Keystone_KeystoneApp.bundle" "$APP/Contents/Resources/"

cp Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $VERSION" \
  "$APP/Contents/Info.plist"

ICONSET="$OBJ/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size ../shared/logo.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) ../shared/logo.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# Ad-hoc signature. Without an Apple Developer ID, other Macs ask the user to confirm the first launch
# (right-click › Open), the same as Alpha Branding Studio.
codesign --force --deep --sign - "$APP"
ditto -c -k --norsrc --noextattr --keepParent "$APP" "$ZIP"
echo "Built $APP (v$VERSION) and $ZIP"
