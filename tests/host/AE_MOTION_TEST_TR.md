# After Effects hareket araçları — gerçek uygulama testi (H)

Panelde After Effects'i aç. Her adımda ne gördüğünü yaz (çalıştı / hata mesajı / ekran görüntüsü).
Her araç tek **Cmd+Z** ile tamamen geri alınmalı; bunu da kontrol et.

Hazırlık: Yeni kompozisyon (1920x1080, 10 sn). İçine 3 metin katmanı yaz ("Merhaba dünya", "İkinci satır", "Üç").
Bir de dikdörtgen shape katmanı ekle.

## A. Metin Animasyonu (Animasyon → Metin Animasyonu)
1. Bir metin katmanı seç, "Harf harf yüksel" → Uygula. Oynat: harfler soldan sağa aşağıdan gelip belirmeli.
2. Aynı katmana "Daktilo" uygula. Harfler tek tek, sert biçimde (yumuşak geçiş olmadan) çıkmalı.
3. "Silinerek çık" ve "Harf harf in (çıkış)": katmanın sonunda kaybolmalı.
4. Timeline'da katmanı aç: Text → Animators altında "UET ..." adlı bir animatör ve Range Selector anahtar kareleri görünmeli.
5. 3 metin katmanını birden seç, kademe 0.2 → her katman 0.2 sn sonra başlamalı. Shape katmanı seçiliyse "Atlanan" yazmalı.
6. "UET metin animasyonlarını kaldır" → animatörler silinmeli.

## B. Sarsıntı
1. Shape katmanını seç, "Darbe" → Sarsıntı ekle. Oynatma kafasının olduğu yerde sarsılıp yaklaşık 0.6 sn'de durmalı.
2. Effect Controls: "UET Shake Amount / Frequency / Rotation" slider'ları olmalı; değeri değiştirince sarsıntı değişmeli.
3. "El kamerası" uygula → eski ayarların yerine geçmeli (slider'lar çoğalmamalı). "Sarsıntıyı kaldır" → her şey temizlenmeli.

## C. Sayaç
1. Hiçbir şey seçmeden 0 → 1000, Türkçe biçim → Sayaç oluştur. Ortada "0"dan "1.000"e sayan yazı çıkmalı.
2. Ön ek "₺", 2 ondalık dene: "₺1.234,50" gibi görünmeli.

## D. 3D Karusel
1. 4 katman seç (görsel veya shape), "Halka" + "Tek tek öne getir" → Karusel kur.
2. Kontrol et: öndeki katman normal boyutta ve **ön yüzü bize dönük** olmalı, diğerleri halkada arkaya doğru dizilmeli.
   (Önemli: Kartlar ters/yanlış yöne bakıyorsa yaz; dönüş yönü bu testle doğrulanacak.)
3. Oynat: her katman sırayla öne gelip beklemeli.

## E. Hizala ve Anchor
1. Döndürülmüş ve ölçeklenmiş bir katmanda anchor oklarına bas: katman **yerinden oynamamalı**, anchor köşeye gitmeli.
2. 3 katman seç: "Sol" (kompozisyona göre) → hepsi sol kenara yaslanmalı. "Seçime göre" + "Alt" dene.
3. 3+ katman: "Yatay eşit dağıt". 3 katman: "Art arda diz" (ara 0) → zaman çizelgesinde uç uca dizilmeli.

Son olarak: After Effects sürümünü (Yardım → Hakkında) yaz.
