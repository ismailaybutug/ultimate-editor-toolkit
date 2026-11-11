# Faz 2 — Mac'te gerçek uygulama testi (İso için)

Süre: yaklaşık 15 dakika. Sonuçları (ekran görüntüsü veya paneldeki log satırları) bana gönder; TEST_REPORT.md'ye işleyeceğim.

## 0. Kurulum (bir kez)
1. `uet-panel-dev.zip` dosyasını indir ve aç (çift tıkla).
2. Terminal'i aç, açılan klasöre gir ve çalıştır: `bash install-mac.sh`
3. Script "ffmpeg yok" derse: `brew install ffmpeg` (Homebrew yoksa önce https://brew.sh).
4. Premiere Pro ve After Effects'i kapatıp yeniden aç.
5. Menüden: **Window → Extensions → Ultimate Editor Toolkit**. Panelin sağ üstünde "motor: hazır" yazmalı.

## A. After Effects (A1–A5)
| # | Adım | Beklenen |
|---|---|---|
| A1 | Test sekmesi → "After Effects bağlantısını test et" | Log: `After Effects <sürüm>` |
| A2 | Test sekmesi → "Test kompozisyonu + başlık oluştur" | "UET Test" kompozisyonu açılır, ortada beyaz başlık |
| A3 | Başlık seçiliyken Animasyon → "Fade up (in)" → Uygula | Opacity ve Position'da 2'şer anahtar kare; oynatınca yumuşak yukarı kayma |
| A4 | Cmd+Z bir kez | A3'teki tüm anahtar kareler tek seferde geri alınır |
| A5 | Bir video katmanı seç → Hız rampası (300%, %30, giriş + çıkış) → Rampa uygula | Time Remap açılır, anahtar kareler oluşur, klip ortada hızlanır; katman süresi kısalır |

Ek: "Pop (in)", "Pulse (emphasis)", "Fade down (out)" animasyonlarını birkaç katmanda dene (kademe 0.08).

## B. Premiere Pro (B1–B5)
| # | Adım | Beklenen |
|---|---|---|
| B1 | Test → "Premiere bağlantısını test et" | Log: `Premiere 26.x ..., sekans: <ad>` |
| B2 | Test → "QE özelliklerini yokla" | Log'da `razor` ve `setSpeed` true/false (ikisini de bana yaz) |
| B3 | Konuşma içeren bir klibi zaman çizelgesinde seç → Sessizlik → "1 · Sessizlikleri bul" | Log: gürültü tabanı, eşik, kesim sayısı, çıkarılacak süre |
| B4 | "2a · Marker olarak işaretle" | Sekansta sessiz yerlerde marker'lar. Yerleri doğru mu? |
| B5 | "2b · Kesilmiş yeni sekans oluştur" | "<sekans> - UET cut" adlı yeni sekans açılır; sessizlikler yok, ses ve görüntü senkron. **Orijinal sekans değişmemiş olmalı.** |
| B6 | Ses sekmesi → hedef -14 → Ölç | Log: LUFS, tepe değeri, önerilen kazanç |

## Bana gönder
- Her adım için: geçti / kaldı + log satırı veya ekran görüntüsü.
- Premiere ve After Effects sürümleri (Help → About).
- Özellikle B5: kesimler doğru yerde mi, ses kayması var mı?

## C. Claude Desktop bağlantısı (MCP) — isteğe bağlı
Gerekenler: Mac'te Node.js (`node -v` 20 veya üstü; yoksa `brew install node`) ve Claude Desktop.
1. Claude Desktop → Settings → Developer → Edit Config. Açılan `claude_desktop_config.json` dosyasına ekle:
```json
{
  "mcpServers": {
    "ultimate-editor-toolkit": {
      "command": "node",
      "args": ["/Users/KULLANICI_ADIN/Library/Application Support/Adobe/CEP/extensions/com.uet.toolkit/mcp.mjs"]
    }
  }
}
```
   (`KULLANICI_ADIN` yerine Mac kullanıcı adın; Terminal'de `whoami` yazınca görünür.) Node bulunamazsa `"command"` için `/opt/homebrew/bin/node` yaz.
2. Claude Desktop'ı yeniden başlat. Premiere'de paneli aç ve bir klip seç.
3. Claude Desktop'a yaz: "Ultimate Editor Toolkit ile seçili klipteki sessizlikleri analiz et."

| # | Beklenen |
|---|---|
| C1 | Claude `ppro_cutSilences` aracını çağırır ve kesim sayısını söyler |
| C2 | "Marker olarak ekle" dersen sekansa marker'lar gelir |
| C3 | After Effects'te bir katman seçip "pop-in animasyonu uygula" dersen animasyon uygulanır |

## D. Altyazı (yerel, ücretsiz)
Bir kerelik kurulum (Terminal):
```
brew install whisper-cpp
mkdir -p ~/.uet/models
curl -L -o ~/.uet/models/ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
```
(Model yaklaşık 550 MB.) Sonra Premiere'de konuşma içeren bir klip seç → panelde **Altyazı** sekmesi → Dil: Türkçe → **Altyazı oluştur**.

| # | Beklenen | Bana yaz |
|---|---|---|
| D1 | Log satırı: kaç satır, kaç saniyede bitti (ör. "40 sn / 300 sn ses") | Log satırının aynısı |
| D2 | Sekansta yeni bir altyazı izi, yazılar konuşmayla aynı anda | Zamanlama doğru mu, kayma var mı |
| D3 | Türkçe karakterler (ç, ğ, ı, ö, ş, ü) doğru | Hatalı kelime örnekleri |
| D4 | İz eklenemezse bile SRT dosyası ~/.uet/subtitles içinde | Hata mesajı |
