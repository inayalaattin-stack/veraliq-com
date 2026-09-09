# VERALIQ — Fazlara Ayrılmış Uygulama Planı

Kaynak: `VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md` + kullanıcının fiyatlandırma
kararı (0,5% + KDV, kesinleşmiş). Sıra DEĞİŞMEDİ. Her faz kendi commit'i ve test
kanıtıyla ilerler; bir faz başarısızsa bir sonrakine geçilmez. Taban ve Faz 1 kanıtı
için bkz. `IMPLEMENTATION-BASELINE.md`. Dosya bazında liste için bkz.
`FILES-TO-CHANGE.md`.

## Faz 1 — Güvenli yayın sınırı (P0) — TAMAMLANDI ✅

`public-dist/` allowlist build+verify, CI'da `directory: .` → `directory: public-dist`,
`cloudflare/wrangler-action@v3`'e geçiş, sahte `npm audit` yerine gerçek kontroller,
kırık backup schedule'ı yerine açık "kurulum gerekli" başarısızlığı. Kanıt:
`IMPLEMENTATION-BASELINE.md` §5.

## Faz 2 — Spatius session/TTS koruması (P0)

- `worker-spatius`'a: IP-bazlı + kısa ömürlü visitor-session bazlı rate limiting.
- Turnstile + kısa ömürlü imzalı visitor token — token yalnızca ziyaretçi AI
  açıklamasını gördükten ve konuşmayı başlattıktan SONRA verilir.
- `/tts`: GET query yerine doğrulanmış POST JSON body (metin URL/proxy/erişim
  loglarına sızmasın).
- Metin uzunluğu / dil / content-type / body-size sınırları.
- Upstream timeout + hata haritalama + kota circuit-breaker.
- `Cache-Control: no-store`; upstream ham hata gövdesi/kimlik bilgisi asla
  istemciye sızmasın; güvenilmeyen origin'e izinli ACAO dönülmesin.
- Hiçbir otomatik test gerçek/ücretli/kota tüketen bir çağrı yapmayacak — canlı
  provider testleri ayrı, manuel, onaylı ve bütçe sınırlı olacak.
- Spatius "sınırsız"/"üretim için sürdürülebilir" olarak etiketlenmeyecek (lisans/
  ticari uyum doğrulanana kadar).

**Test hedefi:** worker-spatius için rate-limit/body/CORS/hata-maskeleme negatif
testleri (yeni bir test dosyası, `worker-portal/test/portal-worker.test.mjs`
örnekteki gibi bağımsız/gerçek-kimlik-bilgisiz çalışabilir şekilde).

## Faz 3 — Gerçek veri işleme haritası ve yasal metinler (P0)

- `DATA-PROCESSING-MAP.md`: Cloudflare Pages/Workers/D1, aktif Spatius avatar akışı,
  aktif resmi olmayan Google Translate TTS proxy'si (hangi metin gönderiliyor),
  Web Speech API'nin tarayıcı/OS-bağımlı işleme riski, PASİF Anthropic/OpenAI,
  PASİF self-hosted STT/TTS/avatar seçenekleri, eski Anam kodu vs. gerçek aktif
  durum, konuşma logları/IP-UA audit alanları/sessionStorage JWT/saklama-silme
  durumu — her veri kategorisi için amaç/hukuki-dayanak-adayı/alıcı-işleyen/
  ülke-transfer/saklama süresi/silme yöntemi/kullanıcı kontrolü.
- Ardından `privacy.html`/`kvkk.html`/`terms.html`/consent dialog/pazarlama metnini
  bu haritaya hizala: var olmayan Gemini iddiasını kaldır, Anthropic'i aktifmiş gibi
  yazma, aktif Google Translate TTS ve Spatius akışlarını gizleme.
- "Aydınlatma" (disclosure) ile "açık rıza" (explicit consent) ayrı tutulacak.
- Şirket tarafından sağlanması gereken alanlar (adres, veri sorumlusu, iletişim)
  UYDURULMAYACAK — `LEGAL-INPUT-REQUIRED.md`'de blocker olarak listelenecek.
- "KVKK/GDPR'a tam uyumluyuz" gibi doğrulanamaz mutlak ifadeler kullanılmayacak;
  gerçek bir silme/saklama akışı yoksa önce iddia kaldırılacak, gerçek akış ayrı
  bir faz olarak tasarlanacak.
- Son metinlerin profesyonel hukuki incelemeye ihtiyacı olduğu açıkça belirtilecek.

## Faz 4 — Gerçek demo talebi akışı (P1) — TAMAMLANDI ✅

- Demo talebi için ayrı veri modeli/endpoint (tenant emlak lead'lerinden ayrı).
- Public endpoint: sunucu tarafı doğrulama/normalize/rate-limit/Turnstile/honeypot/
  body-limit/consent-timestamp-ve-versiyon/minimum PII.
- Önce kalıcı kayıt, SONRA bildirim (outbox/retry deseni — bildirim hatası kaydı
  KAYBETMEYECEK). Kullanıcıya başarı yalnızca backend kaydı gerçekten başarılıysa
  gösterilecek.
- Yeni admin ekranı: "Demo Talepleri" (durum/sahip/not/kaynak/tarih, rol-gated,
  audit'li).
- Testler: CSV/formula-injection, XSS, tekrar-gönderim, idempotency.
- Gerçek e-posta sağlayıcı/secret yoksa sahte "başarılı" gösterilmeyecek — kayıt
  yine de admin panelinde görünür olacak.

## Faz 5 — Auth/session/API sertleştirme (P1) — KISMEN TAMAMLANDI ⚠️

Tamamlanan: login rate limiting, token_version/session-revocation, JWT
iss/aud+claim tipi doğrulama, JWT_SECRET boşsa fail-closed, 500 yanıtlarında
detail sızıntısı giderildi (correlation-id ile), health endpoint
minimalleştirildi + admin-only detaylı health eklendi, parola politikası
(min 10, harf+rakam). Ertelenen (bu turda yapılmadı, ayrı bir faz gerektirir):
takım daveti "admin geçici parola belirler" modelinin güvenli tek-kullanımlık
aktivasyon akışına dönüştürülmesi; export endpoint'i için pagination/streaming.

Mevcut tenant/status/race düzeltmeleri korunarak:
- Login rate limiting + backoff (hesap numaralandırmaya izin vermeden).
- Minimum uzunluk ötesi gerçek parola politikası + ilk girişte seed parolanın
  zorunlu değişimi.
- `token_version`/oturum iptal mekanizması (parola değişince eski JWT'ler geçersiz).
- JWT claim tip/izinli rol/`sub`/`exp`/mümkünse `iss`/`aud` doğrulaması.
- Secret eksik/boşsa fail-closed.
- Genel istek gövdesi boyutu + content-type kontrolleri.
- 500 yanıtlarda `detail` sızdırılmayacak (correlation ID ile sunucu tarafı log).
- Güvenilmeyen origin'e sahte `Access-Control-Allow-Origin: https://veraliq.com`
  dönülmeyecek.
- Health endpoint minimal bilgi dönecek; detaylı health admin auth gerektirecek.
- Audit logda PII aşırı loglanmayacak — saklama politikası tanımlanacak.
- Takım daveti: "admin geçici parola belirler" yerine güvenli tek-kullanımlık
  aktivasyon modeli.
- Büyük/hassas veri export endpoint'i için pagination/streaming, re-auth, audit,
  veri minimizasyonu değerlendirilecek.

**Test hedefi:** her değişiklik için negatif-yetkilendirme ve cross-tenant testleri.

## Faz 6 — Capability ledger ve pazarlama/gerçeklik paritesi (P1) — TAMAMLANDI ✅

- `CAPABILITY-LEDGER.md`: her özellik için durum (`ACTIVE`/`PILOT`/`PARTIAL`/
  `ROADMAP`/`NOT_AVAILABLE`), kanıt (dosya/API/test), müşteri-görünür yüzey,
  bilinen sınır/lisans/maliyet, izin verilen pazarlama cümlesi.
- Şu iddia/gerçeklik uyuşmazlıkları TÜM yüzeylerde düzeltilecek: PDF/PPT/Excel
  anlatımı, resmi WhatsApp Business entegrasyonu, randevu/otomatik follow-up,
  mobil uygulama, CRM "otomatik senkron", TBDY/mevzuat modülü, "Sınırsız Proje
  Sunumu", "hazır silme/saklama süreci", demo formunun "ekibimiz hemen alır"
  vaadi, satış sunumunun "portal henüz canlı değil" cümlesi (artık eskimiş —
  bağımsız doğrulanmış canlı-production erişimi olmadan "kaynakta çalışan portal"
  gibi temkinli bir ifadeye güncellenecek, doğrulanamaz "canlıda çalışıyor"
  DEĞİL), "aktif her modül doğrulandı"/"aynı gün çalışmaya başlar"/"tek satır
  entegrasyon" gibi kanıtsız iddialar.
- Site 8 dilli ama FAQ botu yalnızca TR/EN — bu gizlenmeyecek, "8 dile uyum
  sağlıyor" denmeyecek.
- Statik sözlük key-parity'si çeviri KALİTESİNİN kanıtı değildir — RTL/taşma/
  native-editor incelemesi ayrı raporlanacak.
- Örnek portal metrikleri "temsili görünüm" olarak açıkça etiketlenecek veya
  gerçek API verisine bağlanacak.
- Footer'daki "prototip/ticari faaliyet yok" metni aktif fiyatlandırma/satış
  CTA'ları yanında sessizce kaldırılmayacak — bu gerilim
  `BUSINESS-DECISIONS-REQUIRED.md`'de kayıtlı kalacak.
- Güncellenen tüm i18n anahtarları 8 dilde eksiksiz kalacak (site) ve TR/EN/RU'da
  eksiksiz kalacak (portal) — otomatik key-parity testi eklenecek.

## Faz 7 — Fiyat kararı ve merkezi fiyatlandırma — KARAR VERİLDİ, UYGULAMA BEKLİYOR

Kullanıcı kararı: Aylık 25.000 TL+KDV, Yıllık 250.000 TL+KDV, Başarı primi
%0,5+KDV/prim doğuran satış (matematiksel sabit: `0.005`). Bu fazda:

- Tek bir merkezi fiyatlandırma kaynağı (`pricing-config.js` veya benzeri) oluştur;
  `pricing.html`, `pricing.js`, `i18n.js` (8 dil), FAQ satış botu, satış sunumu
  HTML/PDF, maliyet hesaplayıcısı (varsa), meta açıklamaları/yapılandırılmış veri
  bu kaynağı referans alacak.
- "5.000.000 TL → 25.000 TL+KDV" örneğini kaldır.
- Mevcut geçmiş satış/sözleşme/finansal kayıtlara DOKUNMA.
- "Prim doğuran satış" ifadesini koru; hangi olayın primi tetiklediği tanımını
  UYDURMA — `BUSINESS-DECISIONS-REQUIRED.md`'ye ayrı bir karar maddesi olarak ekle.
- Parite testi: herhangi bir yüzeyde %1 veya `0.005` dışında bir oran kalırsa
  test BAŞARISIZ olsun.
- Yerel sayı biçimleri (`%0,5`, `0.5%`, vb.) korunacak; yalnızca matematiksel
  değer merkezîleşecek.
- Eski "fiyat proje sayısına ve kullanım hacmine göre değişir, sabit fiyat yok"
  FAQ cevapları yeni sabit fiyat modeliyle tutarlı hale getirilecek.
- "Sınırsız Proje Sunumu" otomatik korunmayacak — capability ledger sonucuna göre
  dürüst yeniden yazılacak (Faz 6 ile birlikte ele alınabilir).

## Faz 8 — Admin ve portal bilgi mimarisi (P1)

- Admin nav: Genel Bakış, Demo Talepleri, Şirketler ve Onboarding, Kullanıcılar ve
  Erişim, Hizmet/Provider Sağlığı, Paket ve Yetkilendirme (gerçek bir billing
  motoru değilse açıkça belirt), Audit ve Güvenlik, Sistem Ayarları. Boş finans/
  entegrasyon ekranları aktifmiş gibi değil, roadmap etiketiyle ayrılacak.
  Emlak satış hacmi ile VERALIQ'in kendi geliri asla karıştırılmayacak.
- Portal nav: Bugün/Bekleyen İşler, Lead'ler, Müşteriler, Projeler ve Stok,
  Sunum/Hold/Rezervasyon, Onay Talepleri, Satışlar, Takım ve Roller, Raporlar/
  Export, Ayarlar — bekleyen onaylar/süresi dolan hold'lar/yanıtsız lead'ler/
  kritik stok değişiklikleri vitrin metriklerinden ÖNCE gösterilecek.
- API'de karşılığı olmayan randevu/WhatsApp/faturalama özellikleri menüde aktif
  gösterilmeyecek.
- Mobil: "Mobil Uygulama" pazarlaması durdurulacak — bu duyarlı bir web portalı;
  mobil görünüm görev-odaklı olacak (bekleyen işler, lead detayı, birim durumu,
  onay, arama/mesaj kısayolu). Native/PWA yalnızca ayrı bir kararla.

## Faz 9 — Kurumsal görsel sistem (P1)

Görsel dönüşüm yalnızca işlev/iddia düzeltmelerinden SONRA uygulanır.
- Ana site/admin/portal: açık taş-beyazı zemin, grafit metin, mavi-gri vurgu,
  ince teknik çizgiler, güçlü tipografik hiyerarşi. Fiyatlandırma: koyu premium
  istisna (kontrollü indigo/mavi, yüksek okunabilirlik, reduced-motion fallback).
- Mimari çizim/saha planı/modül diyagramı/ölçü çizgisi/doküman estetiği.
- Mevcut orijinal SVG ikon/desen/diyagram varlıkları dosya adına göre değil kalite/
  anlam uygunluğuna göre değerlendirilecek.
- Sahte dashboard ekran görüntüsü asla ürün kanıtı olarak sunulmayacak.
- Her yüzey için loading/empty/error/permission/conflict/offline durumları
  tasarlanacak.
- Widget'ın köşe/yarım/tam ekran davranışı KORUNACAK — yalnızca görünüm/erişilebilirlik
  iyileştirilecek.
- Klavye navigasyonu, görünür focus, kontrast, semantik başlıklar, form etiket/hata
  ilişkisi, dialog focus trap, reduced motion doğrulanacak.
- 390/768/1024/1440 genişliklerde TR/EN/AR/FA için taşma ve RTL testi.

**⚠️ Çözülmemiş çelişki (kullanıcıya bu fazda sorulacak, şimdi sessizce
çözülmeyecek):** Master promptun bu fazdaki "metin fallback'ini kaldırma" talimatı,
ÖNCEDEN tamamlanmış, gözden geçirilmiş, pushlanmış ve artık CLAUDE.md'de kalıcı kural
olan "yazılı sohbet tamamen kaldırıldı" kararıyla çelişiyor. Bkz.
`IMPLEMENTATION-BASELINE.md` §7.

## Faz 10 — Çekirdek son-müşteri ajanı, ayrı feature gate (ayrı, dikkatli faz)

Eğer pazarlamanın vaat ettiği gerçek tenant son-müşteri ajanı bugün yoksa, metinle
örtbas edilmeyecek — ayrı bir feature flag/faz olarak minimum dikey dilim
tasarlanacak: şirket slug/domain allowlist ile tenant çözümleme, dar kapsamlı
kısa ömürlü ziyaretçi oturumu, yalnızca yayınlanmış proje/birim/fiyat alanlarını
okuyan güvenli sorgular, rıza tabanlı lead oluşturma, konuşmanın ilgili lead/
müşteriye bağlanması, fiyat/stok cevaplarında kaynak-zaman damgası ve belirsizlik/
fallback, insana devir, audit, rate-limiting, tenant-negatif testler. Randevu,
otomatik follow-up, WhatsApp, belge ingestion, gerçek CRM connector'ları bu dilim
gerçekten çalışana kadar "aktif" olarak işaretlenmeyecek — her biri ayrı backend/
auth/hata-yönetimi/testle ayrı ayrı gönderilecek.

## Her fazdan sonra ortak test/kalite kapısı

- İlgili mevcut testler çalıştırılır.
- Yeni negatif/regresyon testleri eklenir.
- Gerçek HTTP sunucusu üzerinden frontend smoke testi.
- Tarayıcı konsol hatası/başarısız kaynak/kırık link/yatay taşma kontrolü.
- Kimlik doğrulamalı admin/portal ekran görüntüleri YALNIZCA izole yerel seed
  veriden (asla canlı veri veya ücretli provider).
- Her faz için: test sonucu, komut, ortam, commit raporlanır.
- "127/127 worker-portal testi tek başına 'tüm sistem hazır' sonucu değildir."

## Nihai teslimat

Tüm fazlar tamamlandığında (veya oturumun gerçekçi kapsamına ulaşıldığında), repo
kökü DIŞINDA `VERALIQ-UYGULAMA-SONUC/` klasörü: `00-EXECUTIVE-SUMMARY.md`'den
`11-LEGAL-INPUT-REQUIRED.md`'ye 12 dosya, güncel masaüstü/mobil/RTL ekran
görüntüleri, değişen dosyalar + commit hash listesi, ve yalnızca kaynak
değişikliklerini içeren bir patch veya temiz bir git branch'i. Her madde
`TAMAMLANDI / KISMEN / BLOCKED / YAPILMADI` etiketiyle; "production ready"/"tam
uyumlu"/"aşılmaz"/"%100 güvenli" gibi mutlak dil kullanılmayacak.
