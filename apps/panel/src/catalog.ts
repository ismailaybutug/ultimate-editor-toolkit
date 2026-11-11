/**
 * Tool catalog shown as cards. status:
 *  - 'beta'  : implemented, automated tests pass, waiting for / in real Adobe testing
 *  - 'soon'  : planned (FEATURE_INVENTORY id), not implemented; card is shown disabled, never faked
 *  - 'dev'   : developer diagnostics
 */
export type App = 'PPRO' | 'AEFT';
export type Status = 'beta' | 'soon' | 'dev';
export type Preview = 'wave' | 'meter' | 'captions' | 'pop' | 'ramp' | 'title' | 'transition' | 'grid' | 'spark' | 'dev';
export interface CatalogItem {
  id: string; app: App; cat: string; title: string; desc: string; status: Status;
  view?: string; preview: Preview; keys?: string; feature?: string;
}

export const CATEGORIES: Record<App, { id: string; label: string; color: string }[]> = {
  PPRO: [
    { id: 'edit', label: 'Kurgu', color: '#ff7a45' },
    { id: 'audio', label: 'Ses', color: '#3ecf8e' },
    { id: 'subs', label: 'Altyazı', color: '#ffd166' },
    { id: 'gfx', label: 'Grafik', color: '#a78bfa' },
    { id: 'look', label: 'Görünüm', color: '#4cc9f0' },
    { id: 'tools', label: 'Araçlar', color: '#9aa4b2' },
  ],
  AEFT: [
    { id: 'anim', label: 'Animasyon', color: '#a78bfa' },
    { id: 'speed', label: 'Hız', color: '#ff7a45' },
    { id: 'gfx', label: 'Grafik', color: '#4cc9f0' },
    { id: 'ai', label: 'AI Motion', color: '#f472b6' },
    { id: 'tools', label: 'Araçlar', color: '#9aa4b2' },
  ],
};

const P = (cat: string, id: string, title: string, desc: string, status: Status, preview: Preview, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, app: 'PPRO', cat, title, desc, status, preview, ...extra });
const A = (cat: string, id: string, title: string, desc: string, status: Status, preview: Preview, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ id, app: 'AEFT', cat, title, desc, status, preview, ...extra });

export const CATALOG: CatalogItem[] = [
  // ---------- Premiere ----------
  P('edit', 'silence', 'Sessizlik Kesici', 'Boşlukları bul, marker koy ya da temiz yeni sekans kur', 'beta', 'wave', { view: 'v-silence', keys: 'sessiz boşluk kes jump cut', feature: 'F-AU-01' }),
  P('edit', 'roughcut', 'Kaba Kurgu', 'Eee/ııı ve tekrar çekimleri temizle', 'soon', 'wave', { feature: 'F-AI-04', keys: 'filler tekrar' }),
  P('edit', 'scenes', 'Sahne Bulucu', 'Çekim değişimlerinde marker koy veya parçalara böl', 'beta', 'grid', { view: 'v-scenes', keys: 'sahne scene shot kesim', feature: 'F-PROD-04' }),
  P('edit', 'beatedit', 'Ritme Kurgu', 'Klipleri müziğin vuruşlarına diz', 'soon', 'meter', { feature: 'F-PROD-09', keys: 'beat müzik' }),
  P('edit', 'reframe', 'Dikey Format', '9:16, 1:1, 4:5 için yeni sekans, orijinal kalır', 'beta', 'grid', { view: 'v-reframe', feature: 'F-FMT-03', keys: 'reels shorts tiktok dikey reframe format' }),
  P('edit', 'podcast', 'Podcast Kurgusu', 'Konuşan kişiye otomatik geçiş', 'soon', 'grid', { feature: 'F-FMT-01' }),
  P('audio', 'loudness', 'Ses Seviyesi', 'LUFS ölç, platform hedefine göre kazanç', 'beta', 'meter', { view: 'v-loudness', keys: 'lufs loudness ses yüksekliği', feature: 'F-AU-04' }),
  P('audio', 'ducking', 'Müzik Kısma', 'Konuşma varken müziği otomatik kıs', 'beta', 'meter', { view: 'v-duck', feature: 'F-AU-03', keys: 'ducking müzik kıs konuşma' }),
  P('audio', 'beats', 'Vuruş Marker', 'BPM bul, müziğin ritmine marker koy', 'beta', 'wave', { view: 'v-beats', keys: 'beat bpm ritim müzik vuruş', feature: 'F-AU-05' }),
  P('audio', 'sfx', 'SFX Kütüphanesi', 'Whoosh, impact, riser', 'soon', 'wave', { feature: 'F-AU-07', keys: 'efekt sesi' }),
  P('audio', 'audiofx', 'Ses Efektleri', 'Telefon, radyo, su altı, megafon', 'soon', 'wave', { feature: 'F-AU-06' }),
  P('subs', 'subtitles', 'Altyazı', 'Yerel ve ücretsiz yazıya dökme, SRT, altyazı izi', 'beta', 'captions', { view: 'v-subs', keys: 'altyazı caption srt whisper transkript', feature: 'F-SUB-01' }),
  P('subs', 'karaoke', 'Karaoke Altyazı', 'Kelime kelime renk vurgusu', 'soon', 'captions', { feature: 'F-SUB-03' }),
  P('subs', 'stacked', 'Premium Altyazı', 'Katmanlı stiller, anahtar kelime vurgusu', 'soon', 'captions', { feature: 'F-SUB-02' }),
  P('gfx', 'titles', 'Başlıklar', 'Hazır başlık şablonları', 'soon', 'title', { feature: 'F-MG-01' }),
  P('gfx', 'transitions', 'Geçişler', 'Kamera, glitch, ışık, film', 'soon', 'transition', { feature: 'F-TR-01' }),
  P('gfx', 'callouts', 'Callout', 'Ok, işaret ve sayaçlar', 'soon', 'pop', { feature: 'F-MG-06' }),
  P('gfx', 'backgrounds', 'Arka Planlar', 'Hareketli arka planlar', 'soon', 'spark', { feature: 'F-MG-07' }),
  P('look', 'luts', 'LUT', 'Sinematik renk görünümleri', 'soon', 'spark', { feature: 'F-VFX-01' }),
  P('look', 'glow', 'Glow', 'Eklentisiz parlama', 'soon', 'spark', { feature: 'F-VFX-02' }),
  P('look', 'shake', 'Sarsıntı ve Zoom', 'Kamera sarsıntısı, punch-in', 'soon', 'pop', { feature: 'F-MG-08' }),
  P('tools', 'frame', 'Kare Dışa Aktar', 'Oynatma kafasındaki kareyi PNG kaydet', 'beta', 'grid', { view: 'v-frame', keys: 'kare frame png ekran görüntüsü thumbnail', feature: 'F-PROD-06' }),
  P('tools', 'tidy', 'Proje Düzeni', 'Projeyi türüne göre klasörle, geri alınabilir', 'beta', 'grid', { view: 'v-tidy', keys: 'düzen klasör bin tidy organize', feature: 'F-PROD-02' }),
  P('tools', 'safe', 'Güvenli Alan', 'Platform arayüz kılavuzları', 'soon', 'grid', { feature: 'F-FMT-04' }),
  P('tools', 'pdev', 'Bağlantı Testi', 'Premiere bağlantısı ve QE yoklaması', 'dev', 'dev', { view: 'v-pdev', keys: 'test ping' }),
  // ---------- After Effects ----------
  A('anim', 'recipes', 'Katman Animasyonu', 'Giriş, vurgu, çıkış hareketleri, tek Cmd+Z', 'beta', 'pop', { view: 'v-recipes', keys: 'animasyon pop fade slide', feature: 'F-MG-03' }),
  A('anim', 'textanim', 'Metin Animasyonu', 'Canlı önizlemeli metin presetleri', 'soon', 'title', { feature: 'F-MG-04' }),
  A('anim', 'shake', 'Sarsıntı', 'Hazır veya kendi sarsıntın', 'soon', 'pop', { feature: 'F-MG-08' }),
  A('anim', 'carousel', '3D Karusel', 'Dönen 3D yerleşimler', 'soon', 'grid', { feature: 'F-MG-05' }),
  A('speed', 'ramp', 'Hız Rampası', 'Time Remap ile yumuşak hız geçişi', 'beta', 'ramp', { view: 'v-ramp', keys: 'speed ramp hız', feature: 'F-SP-02' }),
  A('gfx', 'titles', 'Başlıklar', 'Düzenlenebilir başlık kompozisyonları', 'soon', 'title', { feature: 'F-MG-01' }),
  A('gfx', 'callouts', 'Callout ve Oklar', 'İşaretçi, ok, sayaç', 'soon', 'pop', { feature: 'F-MG-06' }),
  A('gfx', 'maps', 'Harita Animasyonu', 'Şehirden şehre rota', 'soon', 'spark', { keys: 'harita map rota' }),
  A('ai', 'motion', 'AI Motion Generator', 'Cümleyle düzenlenebilir AE sahnesi kur', 'soon', 'spark', { keys: 'yapay zeka ai prompt' }),
  A('tools', 'adev', 'Bağlantı Testi', 'AE bağlantısı, test başlığı', 'dev', 'dev', { view: 'v-adev', keys: 'test ping' }),
];

export const STATUS_LABEL: Record<Status, string> = { beta: 'Test aşamasında', soon: 'Yakında', dev: 'Geliştirici' };
