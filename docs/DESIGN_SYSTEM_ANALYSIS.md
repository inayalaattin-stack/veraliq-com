# VERALIQ Design System — Mevcut Durum Analiz Raporu

**Amaç:** Yüklediğiniz "VERALIQ — Web / Şirket Portalı / Mobil Uygulama Tasarım Sistemi Promptu" dokümanına göre, kod değişikliğine başlamadan önce mevcut proje mimarisi, teknoloji yığını ve tasarım sistemi tespit edilmiştir. Bu rapor onaylanmadan hiçbir görsel/kod değişikliği yapılmamıştır.

---

## 1. Mevcut Teknoloji Stack

- **Framework yok.** Proje React/Vue/Next.js gibi bir framework kullanmıyor — saf statik HTML + vanilla JavaScript (ES modules dahil). `package.json`, build aracı veya bundler yok.
- **CSS yaklaşımı:** Tailwind veya başka bir CSS framework kullanılmıyor. Tüm stiller `index.html` içinde tek bir `<style>` bloğunda (~500 satır), inline yazılmış — ayrı bir `.css` dosyası yok.
- **Barındırma:** Cloudflare Pages (statik site, `main` branch'ten otomatik deploy) + tek bir Cloudflare Worker (`worker/session-worker.js`) — bu worker sadece Anam.ai API anahtarını sunucu tarafında tutmak için var, sitenin geri kalanıyla ilgisi yok.
- **Diller/fontlar:** Google Fonts üzerinden `Space Grotesk` (başlıklar), `Inter` (gövde metni), `IBM Plex Mono` (etiket/mono metinler) yükleniyor.
- **i18n:** `i18n.js` (787 satır, ~135KB) — 8 dilli (TR/EN/AR/RU/DE/FA/FR/ES) tam çeviri sistemi, RTL desteği dahil. Bu, korunması gereken en büyük mevcut fonksiyonlardan biri.
- **Digital Human Engine:** `agent-core/` altında yeni eklenen, provider-agnostic AI avatar/ses mimarisi (ayrı bir çalışmanın konusu — bu raporun kapsamı dışında, ama avatar widget'ının CSS'i aşağıda ele alınıyor).

## 2. Mevcut Sayfalar

Repo'da toplam 4 HTML sayfası var:

| Dosya | İçerik |
|---|---|
| `index.html` | Ana site — tek sayfa, çok bölümlü (aşağıda bölüm haritası var) |
| `kvkk.html` | KVKK aydınlatma metni |
| `privacy.html` | Gizlilik politikası |
| `terms.html` | Kullanım şartları |

**`index.html` bölüm haritası (mevcut içerik mimarisi — korunacak):**

1. `header`/`nav` — logo, nav linkleri, 8 dilli dil seçici, mobil hamburger menü
2. `#heroVisual` — hero (başlık + görsel showcase)
3. `#capabilities` — "chip" seçici + detay metni (özellik anlatımı)
4. `#problem` — problem tanımı
5. `#flow` — süreç akışı
6. `#workforce` — "AI Workforce" bölümü (mevcut haliyle var, ama tasarım promptundaki spesifik agent-kart formatında değil)
7. `#compare` — karşılaştırma bölümü
8. `#modules` — modüller
9. `#portal-preview` — **DİKKAT:** bu gerçek bir portal değil, "yol haritamızın bir sonraki fazında" diyen bir görsel teaser (bkz. madde 3)
10. `#results` — ROI/sonuç bölümü
11. `#channels` — kanal bilgisi
12. `#trust` — güven unsurları
13. `#faq` — SSS
14. `#contact` — demo formu (CTA)
15. Sayfa sonunda: `#agentWindow` / `#agentBubble` / `#agentReopenBtn` — AI avatar widget'ının HTML iskeleti (köşe/yarım/tam ekran modları destekli, ayrı bir sabit-konumlu eleman)

## 3. Mevcut Portal Ekranları

**Gerçek bir şirket portalı/yönetim paneli bu repoda mevcut değil.** Tek referans, `#portal-preview` bölümündeki statik bir görsel + metin: "Bu görsel, portalın hedeflenen tasarım dilini gösterir — canlı, çok kiracılı portal inşası yol haritamızın bir sonraki fazında." Yani sidebar/topbar/dashboard, Leads/Customers/Properties/Sales/Appointments/Tasks/Reports/Integrations/Settings ekranları — bunların hiçbiri kodda yok, hepsi sıfırdan inşa edilecek.

Bu, tasarım promptundaki "mevcut kodu koru, baştan yazma" talimatı ile doğrudan çelişmiyor çünkü **korunacak bir portal kodu yok** — bu bir "koruma" değil, "sıfırdan inşa" işi olacak. Raporun ilerleyen kısmında bunu ayrı bir risk maddesi olarak işaretliyorum.

## 4. Mevcut Mobil Ekranlar

**Mobil uygulama (iOS/Android) da bu repoda mevcut değil.** Var olan tek şey, `index.html`'in kendi responsive (mobil tarayıcı) davranışı — bir native/hybrid mobil uygulama codebase'i yok. Promptun 15-18. maddelerindeki (Greeting/Today's Performance/AI Workforce/Leads/.../AI Command Center/mobil avatar) ekranların hepsi de sıfırdan tasarım+geliştirme gerektirecek — bu repo kapsamında değil.

## 5. Mevcut Renk Sistemi

Şu an yürürlükte olan tema **"Sapphire & Champagne Luxe"** — **açık (light) tema**, koyu değil:

```
--ink:        #FAF8F5   (açık krem — sayfa arka planı)
--ink-2:      #F2ECE2
--panel:      #FFFFFF   (kart/panel arka planı)
--text:       #2E2E2E   (koyu gri — ana metin)
--text-dim:   #5C554B
--accent:     #C79C5A   (champagne/altın — zaten var, yeni palete yakın)
--accent-text:#96702F
--navy:       #102542   (lacivert — ikincil renk)
--green:      #1F9D63
--red:        #D93A40
--radius:     4px        (genel border-radius — zaten "abartılı yuvarlak" değil)
```

**Önemli tespit:** AI avatar widget'ı (`.agent-window` ve altındaki elemanlar) sitenin geri kalanından bağımsız, **kendi başına zaten koyu bir tema** kullanıyor (`background:#050810`, beyaz/gri metin) — yani "koyu + champagne + mint" hedefine en yakın köşe zaten bu widget. Site geneli ise tamamen açık tema.

**Dark mode:** Şu an **hiç yok** — ne toggle var ne de `prefers-color-scheme` desteği. Yeni tasarım sisteminin "ana kimlik dark mode olsun" hedefi, sitenin light-only mevcut halinden **tam bir tema tersine çevirmesi** anlamına geliyor (kozmetik bir renk değişikliği değil).

## 6. Typography

- Başlıklar: `Space Grotesk` (600 ağırlık, sıkı letter-spacing) — yapısal olarak zaten promptun istediği "yüksek ağırlık, sıkı line-height" mantığına uygun.
- Gövde: `Inter` — promptun önerdiği fontlardan biri zaten kullanımda, **font değişikliği gerekmiyor.**
- Etiket/mono: `IBM Plex Mono` — nav CTA, chip'ler, agent loading metni gibi yerlerde.

## 7. Responsive Yapı

Mevcut breakpoint'ler promptun istediğiyle örtüşüyor: `960px` (nav/hero grid kırılımı), `760px` (logo-sub gizleme, agent-window half mode), `640px` (wrap padding). Promptun istediği 1440/1024/768 üçlüsüne yakın ama birebir aynı değil — token'lar netleştirilirken hizalanabilir.

## 8. İkon Sistemi

**Ayrı bir ikon sistemi (SVG seti, Font Awesome, Material Icons vb.) yok.** Site şu an tamamen tipografi + renkli nokta (`.logo-mark`, `.agent-dot`) + Unicode karakterlerle (▣ ⛶ – ✕ gibi agent widget kontrol butonlarında) çalışıyor. Bu aslında promptun "çocukça ikonlardan kaçın" hedefiyle uyumlu bir başlangıç noktası, ama "AI Activity Feed", "Sales/Leads/Appointments" gibi yeni portal/mobil ekranları için bir ikon seti (muhtemelen ince çizgili/outline SVG set) baştan seçilmesi gerekecek.

## 9. Animasyonlar

Şu an sadece 2 gerçek CSS animasyonu var: `agent-spin` (loading spinner) ve `agent-bounce` (ses seviyesi göstergesi, 3 çubuk). Ayrıca birkaç `transition` (hover, dil menüsü açılışı, agent-window sürükleme). Promptun istediği "150-250ms, subtle" felsefesiyle zaten örtüşüyor — agresif/gereksiz animasyon yok, eklenecek yeni animasyonlar (status pulse, skeleton loading, number count) bu ölçekte kalmalı.

## 10. Diğer Teknik Notlar

- **Görsel optimizasyonu:** 3 adet JPG kullanılıyor (`hero-showcase-a/b.jpg`, `hero-showcase-platforms.jpg`), hiçbiri WebP/AVIF değil — promptun 27. maddesi (performans) burada doğrudan uygulanabilir bir iyileştirme alanı.
- **SEO:** `index.html`'de mevcut title/meta yapısı korunmalı; bu rapor kapsamında incelenmedi, uygulama aşamasında ayrıca kontrol edilecek.
- **`agent-core/`:** Anam.ai bağımlılığını kaldırma çalışmasının (ayrı oturum) ürünü — bu tasarım sistemi çalışmasıyla çakışmıyor, avatar widget'ının CSS/HTML kabuğu (`#agentWindow` vb.) sitenin geri kalanıyla aynı `index.html` içinde yaşıyor.

---

## 11. Değiştirilmesi Gereken Componentler (Ana Site Kapsamında)

1. `:root` renk token'ları — light "Sapphire & Champagne Luxe" paletinden dark "Obsidian + Champagne + AI Mint" paletine geçiş (tüm `--ink`, `--panel`, `--text` vb. değişkenler ve bunlara bağlı ~500 satırlık CSS'in büyük kısmı, çünkü light-temaya göre yazılmış gölge/border/hover değerleri koyu zeminde çalışmayacak).
2. Hero bölümü — arka plan (radial gradient), başlık vurgusu (mint/champagne kontrollü kullanım), CTA renkleri.
3. `.chip` / `.chip.active` — şu an pill-shaped (`border-radius:999px`); promptun "her şeyi pill-shaped yapma" ilkesiyle yeniden değerlendirilmeli (tag/chip için pill kalabilir, ama buton sisteminden ayrı tutulmalı).
4. `#workforce` bölümü — şu an genel bir "özellik listesi" formatında; promptun istediği "SALES AGENT / ● ACTIVE / 24 LEADS / 8 FOLLOW-UPS" tarzı operasyonel kart formatına dönüştürülmesi gerekiyor.
5. `#portal-preview` — görsel + metin, yeni palete uyacak şekilde güncellenmeli (gerçek portal inşa edilene kadar bu bir "teaser" olarak kalacak, ama en azından yeni tema ile tutarlı olmalı).
6. Property/gayrimenkul kartı bileşeni — şu an ayrı bir "kart" bileşeni olarak yok (site bir listing sitesi değil, kurumsal/demo odaklı); promptun 8. maddesindeki kart tipi muhtemelen gelecekteki portal/CRM entegrasyonu için, ana sitede şimdilik uygulanabilir alan sınırlı.
7. Buton sistemi — mevcut `--radius:4px` promptun önerdiği 8-10px'e çekilebilir; primary/secondary/AI/danger ayrımı şu an net değil, netleştirilmeli.
8. Agent widget'ın rengi — zaten koyu, yeni palete (Obsidian/Graphite + AI Mint glow) hizalanacak ama en az değişiklik gerektirecek parça bu.

## 12. Riskli Alanlar

1. **Light → Dark tam tema tersine çevirme, tek geçişte 500 satırlık inline CSS üzerinde yapılacak** — regresyon riski en yüksek nokta. Her bölümün (özellikle görsellerin üstündeki gölge/overlay değerleri, form input kontrastları, `chip-detail` gibi düşük-kontrast metinler) tek tek kontrol edilmesi gerekir.
2. **8 dilli i18n sistemi ile CSS değişikliği çakışmamalı** — `i18n.js` metin/RTL mantığına dokunulmayacak, sadece görsel katman değişecek; RTL (Arapça/Farsça) düzenlerinde yeni renk/gölge değerlerinin kontrastı ayrıca test edilmeli.
3. **`#portal-preview` ve gelecekteki gerçek portal beklentisi karışabilir** — kullanıcıya "bu bir tasarım vizyonu" mesajı zaten veriliyor, yeni temada da bu netlik korunmalı ki ziyaretçi var olmayan bir ürünü var sanmasın.
4. **Gerçek "Şirket Portalı" ve "Mobil Uygulama" için sıfırdan kod yok** — bu ikisi promptta "mevcut kodu koru" diye çerçevelenmiş ama aslında yeni geliştirme. Kapsam/efor beklentisi bu ayrımla yönetilmeli (ana site: revizyon; portal+mobil: yeni inşa).
5. **Performans** — dark tema + yeni glow/gradient efektleri + halihazırda GPU'suz sistemde çalışan avatar widget'ı bir arada; gölge/blur efektleri abartılırsa düşük güçlü cihazlarda (özellikle mobil) performans etkilenebilir.
6. **Erişilebilirlik/kontrast** — AI Mint (#7EE0B2) özellikle küçük metinlerde koyu zemin üzerinde bile göz yorucu olabilir; promptun kendisi de bunu 26. maddede riskli olarak işaretliyor, uygulamada her mint metin kullanımı kontrast oranıyla test edilmeli.

## 13. Önerilen Uygulama Sırası

Promptun kendi 31. maddesindeki 10 aşamayı, mevcut kod tabanının gerçek kapsamına göre şöyle önceliklendiriyorum:

1. **Design token'ları oluştur** — `:root` içinde yeni Obsidian/Champagne/AI Mint değişkenlerini, ESKİ değişkenlerin yanına (henüz silmeden) ekleyip tek noktadan yönetilir hale getirmek. (Düşük risk, geri alınabilir checkpoint.)
2. **Ana site — bölüm bölüm geçiş** (hero → capabilities/chip → workforce → portal-preview → geri kalan bölümler), her bölümden sonra görsel kontrol. i18n/RTL'e dokunmadan sadece CSS.
3. **Buton/kart/badge sistemi** — 3 seviyeli kart (Primary/Secondary/Insight), buton varyantları (Primary/Secondary/AI/Danger), 8-10px radius.
4. **Avatar widget hizalama** — zaten koyu olduğu için en az değişiklik; mint ambient glow + "● CANLI AI SATIŞ ASİSTANI" badge eklenmesi.
5. **Responsive + accessibility test** — 1440/1024/768 kırılımlarında ve kontrast oranlarında doğrulama.
6. **Performans/SEO kontrolü** — görselleri WebP/AVIF'e çevirme, mevcut SEO meta'larının bozulmadığını doğrulama.
7. *(Ayrı, çok daha büyük bir sonraki faz — bu oturumun kapsamı dışında, ayrıca onay gerektirir:)* Şirket Portalı ve Mobil Uygulama'nın sıfırdan tasarım+geliştirmesi.

---

**Sonuç:** Ana site (index.html + 3 legal sayfa) üzerinde bu tasarım sistemini uygulamak **gerçekçi ve kontrollü bir revizyon işi** — framework yok, build adımı yok, tek bir CSS bloğu var, bu da hem riski hem de değişiklik alanını net sınırlıyor. Şirket portalı ve mobil uygulama ise **var olmayan ürünler için sıfırdan tasarım/geliştirme** işi ve ayrı bir kapsam kararı gerektiriyor.

Onayınızı bekliyorum: hangi aşamalardan başlayalım (örn. sadece ana site mi, yoksa portal/mobil için de ayrı bir plan mı hazırlayayım)?
