# İzinli kamera ve görüşme katmanı — 7 Eylül 2026

## Kapsam

Bu yama, kullanıcının sağladığı veraliq-com.zip kaynak kopyasına uygulanmıştır. Mevcut uygulamayı yeniden yazmaz. Önceki bağımsız React tasarım paketi veya avatar önizleme paketi bu kaynaklara topluca kopyalanmamıştır.

- Gerçek index.html, admin.html ve portal.html aynı agent-core/widget-runtime.js üzerinden güncellenir.
- Mobil kapsam bu üç sayfanın responsive web görünümüdür. Native iOS/Android uygulaması eklenmemiştir.
- Varsayılan avatar/TTS/STT/LLM seçimi değiştirilmemiştir. Bu yama SaaS bağımlılıklarını kaldırmaz.
- Kamera yalnızca yerel video öğesine bağlanır; kaydedilmez, sunucuya gönderilmez ve analiz edilmez. Kamera görüntüsü mevcut avatar/LLM sağlayıcısına verilmez.
- Yüz tanıma, psikolojik durum çıkarımı, gizli satış yönlendirmesi yoktur.

## Kullanıcı akışı

1. Görüşmeyi Başlat: AI kimliği, ticari amaç ve veri işleme açıklaması açılır; cihaz veya avatar sağlayıcısı henüz başlatılmaz.
2. Kullanıcı açıklamayı onaylar. Kamera seçimi ayrıca ve isteğe bağlıdır.
3. Onayla ve başlat: mevcut yapılandırılmış avatar zinciri başlatılır; seçildiyse kamera yalnızca yerel önizleme için açılır.
4. Mevcut Görüşmeye Katıl düğmesi konuşma tanımayı başlatır. Bu izin katmanı mevcut ses iletimini bas-konuş modeline dönüştürmez.
5. Kamerayı kapat kamerayı bağımsız kapatır. Görüşmeyi kapatma, sayfayı gizleme ve sayfadan ayrılma izin katmanını sıfırlar, kamerayı kapatır ve mevcut orchestrator.stop() metodunu çağırır. Sayfaya dönüşte kendiliğinden görüşme başlatılmaz.
6. Yeniden açmada yeni onay gerekir. Önceki portal görüşme kayıtları bu işlemle silinmez.

Kullanıcı kamera iznini geç yanıtlarsa, kapatılmış görüşme için gelen akış anında durdurulur. Kamera izni reddi sesli/metinli mevcut görüşme yolunu engellemez. Native dialog klavye odağını yönetir; Escape başlatmadan vazgeçer.

## Değişen dosyalar

- agent-core/call-consent.js: bağımsız kamera yaşam döngüsü + onay penceresi.
- agent-core/call-consent.css: yalnızca yeni izin/kamera kontrollerine ait sınıflar.
- agent-core/widget-runtime.js: onay kapısı, kapanış/geç bağlantı kontrolleri, sayfa gizlenmesinde kapatma, yeniden açma sıfırlaması.
- agent-core/orchestrator.js: kapatma sonrası geç yanıtın konuşmaması; aktif TTS iptali; dil değişiminin mikrofon katılım kapısını atlamaması.
- _headers: camera=() yerine camera=(self). Mikrofon aynı origin ile sınırlı kalır; diğer CSP/frame/geolocation izinleri genişletilmemiştir.

Mevcut avatar hatasında yazılı sohbet yedeği korunmuştur. D1 şeması, RBAC, müşteri/proje verileri, mevcut giriş ve iş fonksiyonları değiştirilmemiştir. Yeni izin metni Türkçedir; mevcut site diliyle otomatik çevrilmez. İsim öğrenme, yeni konuşma belleği, görselden 3D avatar üretimi ve yeni dudak senkronu bu yamanın kapsamı dışındadır.

## Doğrulama

- Önce ve sonra: mevcut conversation-logger testinde 8 PASS, 0 FAIL.
- Önce ve sonra: mevcut portal-worker testinde 111 PASS, 0 FAIL (yerel SQLite/D1 ve Durable Object taklit katmanı; Cloudflare üretim testi değildir).
- Yeni call-consent.test.mjs: 10/10 geçti; kamera izin reddi, geç izin, kamera kapatma, dil değişimi, geç avatar/LLM yanıtı ve TTS iptali.
- Yeni call-consent.browser.mjs: 66/66 kontrol geçti; 1440 ve 390 px genişliklerde üç gerçek HTML giriş sayfası.
- Tarayıcı sunucusu kaynak _headers dosyasındaki CSP ve Permissions-Policy değerlerini gerçekten uyguladı.
- Tarayıcı testlerinde sağlayıcılar taklit edildi, kamera sentetikti, dış ağ engellendi; ücretli veya gerçek avatar oturumu kullanılmadı.
- Masaüstü ve mobil izin pencereleri görsel olarak kontrol edildi.
- Üç değişen/yeni JavaScript çalışma dosyası node --check ile kontrol edildi.

Test komutları (Node 24 veya uygun node:sqlite destekli sürüm):

```sh
node agent-core/test/conversation-logger.test.mjs
node --experimental-sqlite worker-portal/test/portal-worker.test.mjs
node --test agent-core/test/call-consent.test.mjs
node agent-core/test/call-consent.browser.mjs
```

Son komut için geliştirme ortamında Playwright ve Chromium gerekir; CHROMIUM_PATH ile tarayıcı yolu verilebilir. Bu bağımlılıklar üretim widget'ına eklenmez. Test kaynakları normal ziyaretçi sayfalarından yüklenmez. Python servisleri veya model ağırlıkları çalıştırılmamıştır.

## Bilinen sınırlar / yayından önce

- Gerçek iOS Safari/Android, fiziksel mikrofon/kamera, WebSpeech/Whisper/Spatius kapanış davranışı ve sağlayıcı oturum iptali test edilmedi. Onay katmanı, sağlayıcıların kendi cihaz kaynaklarını doğru bırakması gerekliliğini ortadan kaldırmaz.
- Kaynak WhisperSTTProvider, bekleyen mikrofon izni sonrasında kapanışı yeniden kontrol etmiyor. Yerel Whisper'a geçmeden önce bu yarış koşulu düzeltilmeli ve gerçek cihazda test edilmeli; bu yamada sağlayıcı modülü değiştirilmedi.
- Mevcut durum makinesi bazı durumlardan IDLE geçişini reddediyor; yeni testin geç LLM kapanış durumunda THINKING -> IDLE uyarısı görüldü. Sonraki yeni widget görüşmesi yeni durum makinesi oluşturur; kaynaklar için ayrı stop yolları kullanılır. Tam durum makinesi düzeltmesi bu yamada yapılmadı.
- İşleme açıklamasının veri sorumlusu, gerçek sağlayıcı listesi, saklama süresi ve KVKK/gizlilik metniyle eşleştirilmesi gerekir. Bu metin hukuki uygunluk belgesi değildir.
- Kapatılmış bir uzak oturumun sunucuda silindiği veya devam eden bir isteğin sağlayıcı tarafından kesin iptal edildiği garantisi verilmez; gerçek sağlayıcı kontrolleri gereklidir.
- Model kalitesi, aksan, lip-sync, GPU gecikmesi ve eşzamanlı kullanıcı kapasitesi ölçülmedi.
- GitHub push, Cloudflare deploy, DNS/veritabanı değişikliği yapılmadı. main dalına push mevcut CI üzerinden yayın tetikleyebilir; önce ayrı dalda inceleyin.
