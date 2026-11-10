# Geçişler — gerçek uygulama testi (H)

Sonuçları TEST_REPORT.md'ye yazın. Bir adım hata verirse hata mesajını aynen kopyalayın: mesaj eksik efekti veya
parametreyi adıyla söyler.

## After Effects
1. 1920×1080, 30 fps bir kompozisyon aç. İki video katmanı koy: A 0:00–0:05, B 0:05–0:10 (B, A'nın üstünde veya altında).
2. Panel → After Effects → **Geçişler**. A ve B'yi birlikte seç.
3. **Kesimi kontrol et** → günlükte "Kesim 0:05.00 (seçili katmanlardan), 30 fps" yazmalı.
4. Sırayla her geçişi dene (Zoom İçeri, Zoom Dışarı, Whip Pan 4 yön, Dönüş, Glitch, Dalga, Işık Patlaması, Flaş, Bulanık):
   - **Kesime uygula** → iki katman eklenmeli: "UET <ad> (out)" kesimde biter, "UET <ad> (in)" kesimde başlar, ikisi de A ve B'nin üstünde.
   - Önizlemede geçiş görünmeli; geçişin dışında A ve B hiç değişmemiş görünmeli (siyah kenar yok).
   - Efekt anahtar kareleri düzenlenebilir olmalı (Graph Editor'da yumuşak eğriler; Glitch'te basamaklı/hold).
   - Aynı kesimde başka bir geçiş uygula → eski iki katman silinip yenisi gelmeli (üst üste binmemeli).
   - Tek **Cmd+Z** geçişi tamamen geri almalı.
5. **Kesimdeki geçişi kaldır** → UET katmanları silinmeli.
6. Güç %50 ve %200, süre 0.3 ve 1.0 sn ile bir geçişi tekrar dene; etki zayıflamalı/güçlenmeli.
7. 1080×1920 (dikey) bir kompozisyonda Whip Pan ve Zoom İçeri dene.

## Premiere Pro
1. 25 fps bir sekansta V1'e arka arkaya iki klip koy (A sonra B). Oynatma kafasını tam kesime getir.
2. Panel → Premiere → **Geçişler** → **Kesimi kontrol et** → "iz V1: A → B" yazmalı.
3. Zoom İçeri, Whip Pan, Glitch, Dalga, Işık Patlaması, Bulanık için ayrı ayrı (her denemeden sonra geri al ya da yeni kesim kullan):
   - **Kesime uygula** → A'nın sonuna ve B'nin başına efektler eklenmeli (Effect Controls'te Transform, Offset vb.).
   - **Önemli kontrol 1:** anahtar kareler A'nın son ~0.25 sn'sinde ve B'nin ilk ~0.25 sn'sinde mi? Yanlış yerdeyse
     (ör. klibin en başında) not edin: anahtar kare zaman tabanı ters demektir; MCP aracıyla `keyTime: "clip"` denenmeli.
   - **Önemli kontrol 2:** Whip Pan'da görüntü yatayda kayıyor mu, yoksa köşeye mi fırlıyor? (Offset noktası 0–1 mi piksel mi.)
   - Geçişin dışında klipler normal görünmeli.
4. Premiere İngilizce değilse: efekt bulunamadı hatasındaki listeyi aynen kopyalayın.
5. Geliştirici: Premiere MCP köprüsüyle `UET.transitions.probe()` çıktısı (efekt/parametre adları) kaydedilebilir.

Durum: **doğrulanmadı** (yalnızca otomatik testler ve sahte AE/Premiere ortamı).
