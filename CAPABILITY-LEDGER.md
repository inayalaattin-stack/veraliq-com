# VERALIQ — CAPABILITY-LEDGER.md

Faz 6 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md). Her özellik için gerçek
durum, kanıt ve izin verilen pazarlama cümlesi. `ACTIVE` = kodda çalışan, test
edilmiş; `PARTIAL` = bir kısmı çalışıyor, önemli bir sınırı var; `PILOT` = dar
kapsamlı, sınırlı; `ROADMAP` = kodda yok, planlanan; `NOT_AVAILABLE` = kodda yok
ve yakın planda değil.

## Çekirdek sesli AI asistan (Elif Kaya)

| Özellik | Durum | Kanıt | Sınır |
|---|---|---|---|
| Görsel avatar render | ACTIVE | `agent-core/avatar-providers/spatius-avatar-provider.js`, Faz 2 ile korunuyor | Üçüncü taraf (Spatius) sağlayıcı, kota sınırlı |
| Agent sesi (TTS) | PARTIAL | `google-translate-tts-provider.js` | Dokümante edilmemiş, ticari lisanssız endpoint — geçici katman |
| Ziyaretçi sesi (STT) | PARTIAL | `webspeech-stt-provider.js` | Tarayıcı/OS'e bağımlı, VERALIQ kontrolünde değil |
| Zero Trust deterministik yanıt | ACTIVE | `faq-sales-brain-provider.js`, `admin-assistant-brain-provider.js`, `company-assistant-brain-provider.js` | Hiçbir zaman SQL/rastgele intent üretmiyor |
| **İzin verilen cümle:** "Sesli, görüntülü AI satış asistanı" | | | "İnsan gibi" veya "kusursuz Türkçe" denemez (TTS robotik) |

## Dil desteği

| Özellik | Durum | Kanıt |
|---|---|---|
| Site UI (index/pricing) 8 dil | ACTIVE | `i18n.js` — 8 dil bloğu, key-parity script'i bu fazda eklendi |
| Portal UI 3 dil (TR/EN/RU) | ACTIVE | `portal-i18n.js` |
| **FAQ sesli asistan** | PARTIAL | Yalnızca TR/EN — `faq-sales-brain-provider.js` diğer 6 dilde İngilizce'ye düşüyor |
| **İzin verilen cümle:** "Site 8 dilde, asistan şu an TR/EN'de yanıtlıyor" | | "Asistan 8 dile uyum sağlıyor" DENEMEZ |

## Lead/CRM ve iletişim kanalları

| Özellik | Durum | Kanıt |
|---|---|---|
| Demo talebi kaydı (VERALIQ'in kendi lead'i) | ACTIVE | `demo-requests.js`, Faz 4 |
| Tenant emlak lead/müşteri yönetimi (kendi D1) | ACTIVE | `worker-portal/portal-api-worker.js` — leads/customers tabloları |
| Harici CRM (Salesforce/HubSpot vb.) senkronu | NOT_AVAILABLE | Kodda hiçbir harici CRM API çağrısı yok | "Otomatik CRM senkronu" DENEMEZ — doğru ifade: "VERALIQ'in kendi lead/müşteri kayıt sistemi" |
| Resmi WhatsApp Business entegrasyonu | NOT_AVAILABLE | Kodda WhatsApp API/webhook yok | |
| Randevu oluşturma / otomatik follow-up | NOT_AVAILABLE | Kodda takvim/hatırlatma sistemi yok; portal.html'deki Takvim ekranı KALDIRILDI (bu turda) | |
| Proje belgesi yükleme/indirme (PDF/Word/Excel/PowerPoint/görsel) | KOD HAZIR, R2 AKTİVASYONU ERTELENDİ (2026-09-10) | `worker-portal/documents.js`, portal.html "Belgeler" ekranı | Ticari karar: site henüz pazarlanmadı/gelir üretmiyor, R2 aboneliği (ödeme yöntemi kaydı gerektiriyor — ücretsiz kotanın altında kalınsa bile) şimdilik açılmadı. `wrangler.toml`'daki R2 binding'i bilerek yorum satırı — `env.DOCUMENTS_BUCKET` yokken her istek `server_not_configured` (500) ile fail-closed reddediliyor, sessizce "başarılı" DÖNMÜYOR. Aktive edildiğinde: binding'in yorumunu kaldır + `wrangler r2 bucket create veraliq-documents` + `wrangler deploy`. |
| AI'ın yüklenen belge içeriğini okuması/anlaması (ingestion) | NOT_AVAILABLE | Belgeler R2'de saklanıyor ama hiçbir agent/LLM bunları OKUMUYOR — yalnızca insan indirip kendisi okuyor | "AI dokümanlarınızı anlıyor" DENEMEZ |
| Birim/envanter (kat/daire/m²/stok/fiyat) girişi | ACTIVE, MANUEL | portal.html "Projeler" ekranındaki "Birim Ekle" formu, `POST /api/projects/:id/units` | Şirket yetkilisi tek tek/toplu elle girer |
| Birim/envanter verisinin şirketin kendi CRM'inden OTOMATİK çekilmesi | ROADMAP | Kodda hiçbir harici CRM'e bağlanan bir senkron mekanizması yok | Ürün sahibinin planı: ileride kat/daire/m²/stok/fiyat şirketin kendi CRM'inden otomatik çekilecek — bu turda YAZILMADI, yalnızca konum/ada/parsel gibi diğer alanlarla birlikte hâlâ MANUEL |
| TBDY/mevzuat/emtia izleme modülü | NOT_AVAILABLE | Kodda böyle bir modül yok | |

## Platform/erişim

| Özellik | Durum | Kanıt |
|---|---|---|
| Admin paneli | ACTIVE | `admin.html` + `portal-api-worker.js` |
| Şirket portalı | ACTIVE | `portal.html` |
| Mobil erişim | PARTIAL | Responsive web (viewport meta + CSS), NATIVE UYGULAMA YOK | "Mobil Uygulama" DENEMEZ — doğru ifade: "Mobil tarayıcıdan erişilebilir web portalı" |
| "Sınırsız Proje Sunumu" | PARTIAL/kanıtsız | Kodda proje sayısı sınırlaması yok (teknik anlamda doğru) AMA lisans/altyapı kapasitesi (Spatius/Google TTS kota sınırları, Faz 2) hiç doğrulanmadı | "Sınırsız" yerine: "Proje sayısına göre teknik bir üst sınır yok; sağlayıcı kotaları (Faz 2) geçerlidir" |
| Veri saklama/silme süreci | NOT_AVAILABLE | `DATA-PROCESSING-MAP.md` §6 — otomatik TTL/silme akışı yok | "Hazır silme süreci" DENEMEZ |
| Demo formu → gerçek kayıt | ACTIVE (Faz 4'te değişti) | `demo-requests.js` | Önceden mailto: idi; artık gerçek, admin panelinde görünen bir kayıt — "ekibimiz talebinizi alır" ifadesi ARTIK DOĞRU |

## LLM sağlayıcıları

| Sağlayıcı | Durum | Kanıt |
|---|---|---|
| Deterministik FAQ/Admin/Company brain'leri | ACTIVE | Varsayılan, tüm production yüzeylerinde seçili |
| Anthropic Claude (`worker-llm`) | ROADMAP/kodda var ama seçili değil | `agent-core/llm-providers/anthropic-provider.js` — hiçbir `llmProvider` bunu seçmiyor |
| OpenAI | ROADMAP/kodda var ama seçili değil | `openai-provider.js` — seçili değil |

## Satış sunumu / pazarlama materyali (ayrı denetim gerektirir)

`assets/brand/sales-deck/veraliq-sales-deck.html` bu ledger'a göre AYRICA
gözden geçirilmeli — Faz 6'nın bu turdaki devamında (aşağıya bakın)
bulunan spesifik iddialar düzeltilecek.

## Bu fazda uygulanan düzeltmeler (özet)

Explore agent'ın tam envanterine göre (11 madde), şu düzeltmeler yapıldı:
- `index.html` + `i18n.js` (8 dil): PDF/PPT/Excel, Randevu, WhatsApp Takip,
  Raporlama chip'leri kaldırıldı (kod karşılığı yok); `hero.lede`/meta
  description'daki "randevu alır, takip eder" iddiası kaldırıldı;
  `hero.imgAlt`/`channels.p`/`channels.chip5`'teki "mobil uygulama" iddiası
  "mobil tarayıcı" olarak düzeltildi; `modules.svc5*`/`pricing.feature3`'teki
  "CRM otomatik senkron" iddiası "dahili lead yönetimi, harici CRM yol
  haritada" olarak düzeltildi; `pricing.feature2` "Sınırsız" → "teknik sınır
  yok"; `trust.item3Desc`'teki "hazır silme süreci" iddiası kaldırıldı;
  `faq.q7/a7` WhatsApp cevabı dürüstleştirildi; `cc.*` (TBDY/mevzuat/emtia
  modülü) "YOL HARİTASI · GELİŞTİRME AŞAMASINDA" olarak yeniden etiketlendi.
- `agent-core/llm-providers/faq-sales-brain-provider.js`: WhatsApp KB
  girdisi, dil desteği KB girdisi (ajan sadece TR/EN yanıtlıyor, diğerlerinde
  İngilizce'ye düşüyor — artık dürüstçe söylüyor), ve CRM/entegrasyon KB
  girdisi düzeltildi.
- `assets/brand/sales-deck/veraliq-sales-deck.html`: Slayt 1 "aktif her modül
  doğrulanmıştır" iddiası yumuşatıldı; Slayt 5 CRM senkron cümlesi
  düzeltildi; Slayt 7 "portal henüz canlı değil" → kaynakta çalıştığı
  doğrulandı (canlı production erişimi ayrıca doğrulanmadı, bu net şekilde
  belirtildi); Slayt 9 "hazır silme süreci" kaldırıldı; Slayt 12 "aynı gün
  çalışmaya başlar" taahhüdü kaldırıldı.
- Yeni: `scripts/verify-i18n-parity.mjs` — 8 dil (site) + 3 dil (portal) key
  parity testi, CI'a eklendi.

**Dokunulmayan (bilerek, kapsam dışı bırakılan):** `chip.negotiation`/
`chip.payment` (müzakere/ödeme planı iddiaları — FAQ bot'ta doğrudan karşılığı
yok ama `approval_requests` sistemi kısmi bir alt yapı sağlıyor, sınır net
değil, ayrı bir incelemeyi hak ediyor); footer'daki "ticari faaliyet yok"
metni (BUSINESS-DECISIONS-REQUIRED.md'ye taşındı, karar bekliyor).

## Admin/portal ekran temizliği (2026-09-10, kurucu talebiyle)

İşlevsiz/salt-bilgi ekranlar KALDIRILDI (önceden "gap notice" olarak
tutuluyordu, artık hiç yok):
- `admin.html`: "Yol Haritası" grubu (CRM/ERP/Entegrasyonlar) tamamen
  kaldırıldı — kurucu için hiçbir aksiyon alınabilir işlevi yoktu.
- `portal.html`: Takvim ve Entegrasyonlar ekranları kaldırıldı (aynı sebep).
  CRM ekranı KORUNDU (kaldırılmadı) — bu ekran gerçek lead durumu
  sayaçlarını gösteriyor (yalnızca "harici CRM'e senkron değil" notu var),
  bu yüzden diğerlerinden farklı olarak GERÇEK bir işlevi var; "Satış &
  Müşteri" grubuna taşındı (artık "Yol Haritası" değil).
- `portal.html`: "Belgeler" ekranı SIFIRDAN gerçek bir özelliğe dönüştürüldü
  (yukarıdaki tabloya bakın) — artık bir "gap notice" değil.

## Ticari pozisyon gerilimi (BUSINESS-DECISIONS-REQUIRED.md'ye taşındı)

Footer'daki "bu web sitesi şu an herhangi bir ticari faaliyette
bulunmamaktadır" ifadesi, aynı sayfadaki aktif "Demo Talep Et" CTA'sı ve
`pricing.html`'deki gerçek fiyat listesiyle GERİLİM içinde — bu turda
SESSİZCE kaldırılmadı, ürün sahibinin kararı gerekiyor (bkz.
`BUSINESS-DECISIONS-REQUIRED.md`).
