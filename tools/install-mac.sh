#!/bin/bash
# Installs the Ultimate Editor Toolkit dev panel for Premiere Pro and After Effects on macOS.
# Usage: bash install-mac.sh   (run from the folder that contains com.uet.toolkit)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/com.uet.toolkit"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.uet.toolkit"
if [ ! -d "$SRC" ]; then echo "com.uet.toolkit klasörü bulunamadı ($SRC)"; exit 1; fi

# Unsigned development panels need debug mode (one setting per CEP version).
for v in 11 12 13; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo "Kuruldu: $DEST"

if command -v ffmpeg >/dev/null 2>&1 || [ -x /opt/homebrew/bin/ffmpeg ] || [ -x /usr/local/bin/ffmpeg ] || [ -x "$HOME/.local/bin/ffmpeg" ]; then
  echo "ffmpeg bulundu."
else
  echo "UYARI: ffmpeg yok. Ses analizi için gerekli. Kurmak için: brew install ffmpeg whisper-cpp"
fi
echo "Claude Desktop için MCP sunucusu: $DEST/mcp.mjs (ayrıntı: PHASE2_MAC_TEST_TR.md bölüm C)"
echo "Premiere Pro / After Effects'i yeniden başlat, sonra: Window > Extensions > Ultimate Editor Toolkit"
