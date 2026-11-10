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
