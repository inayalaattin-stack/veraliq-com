# Sağlanan kaynak arşivi: self-hosted geçiş değerlendirmesi

Bu değerlendirme 7 Eylül 2026'da yüklenen ZIP'in statik kod incelemesine dayanır; canlı site veya GPU servisi doğrulaması değildir.

## Gerçek mevcut yapı

- Uygulama statik HTML/JavaScript: index.html, admin.html, portal.html. Üçü de agent-core/widget-runtime.js kullanıyor; native mobil proje bulunmadı.
- config.js varsayılanları: avatarProvider=spatius, ttsProvider=googleTranslate, sttProvider=webspeech, llmProvider=faq; selfHostedBaseUrl boş.
- Yönetim/şirket panelleri sırasıyla adminAssistant/companyAssistant deterministik sağlayıcılarını kullanıyor. Bunları genel amaçlı bir LLM ile değiştirmek yetki sınırlarını bozabilir; korunmalıdır.
- Portal görüşme günlüğü D1 kayıtlarına bağlıdır. Kamera onayı önceki kayıtları silmez.
- Kullanıcı düğmesine kadar avatar bağlantısı başlamıyor; hata halinde yazılı sohbet yedeği mevcut. Eski handoff/patch açıklamaları bu ZIP'in davranışını tam temsil etmiyor.

## Önceki bağımsız avatar paketi neden doğrudan kopyalanmadı?

Önceki taslak whisper.cpp HTTP /inference ve /api/avatar/session sözleşmesini öneriyordu. Mevcut gerçek proje faster-whisper WebSocket /stt/stream ve /tts/synthesize sözleşmelerini kullanıyor. Önceki prototipin API adaptörünü buraya doğrudan eklemek iki uyumsuz sistem yaratırdı. Bu teslim sadece mevcut ortak widget'a izin/kamera katmanını bağlar.

## Yerel model geçişinde somut engeller

1. GPU/VRAM/RAM/işletim sistemi ve self-hosted adres bilinmiyor; modeller kurulmadı. Config'in boş URL ile yerel sağlayıcıya çevrilmesi çalışan yolu bozar.
2. services/tts/main.py içinde ChatterboxMultilingualTTS, chatterbox.tts üzerinden içe aktarılıyor. Kurulacak gerçek paket sürümüyle doğrulanmalı; önceki araştırmadaki çok dilli örnek chatterbox.mtl_tts kullanıyordu. Bu çalışma model paketini yükleyip denemedi.
3. Ses profili adı dosya yoluna doğrudan ekleniyor. Servis açılmadan önce profil allowlist'i ve güvenli dizin çözümlemesi gerekli. Kullanıcı tarafından verilen keyfi yollar kabul edilmemeli.
4. STT WebSocket örneğinde uygulama düzeyi oturum doğrulaması, origin kontrolü, süre/buffer/kota sınırları bulunmuyor. CORS middleware'i WebSocket kimlik doğrulamasının yerine geçmez. Yerel servisler internete çıplak açılmamalı.
5. STT sürekli MediaRecorder WebM parçalarını kullanıyor; buffer temizleme sonraki sesin çözülebilir kapsayıcı başlığını kaybetmesine yol açabilir. Tek cümle değil ardışık tur testi gerekli.
6. Whisper mikrofon izin bekleme/kapatma yarışı ve TTS hata/iptal akışı gerçek cihaz/model ile sertleştirilmeli. Yeni izin katmanının geç kamera izni koruması, mevcut Whisper sağlayıcısındaki mikrofon yarışıyla aynı şey değildir.
7. /health yanıtları modelin yüklendiğini veya ses üretiminin çalıştığını kanıtlamıyor. Gerçek model readiness testi ve sınırlı smoke istekleri gerekli.
8. OpenTalking avatar istemcisinin kaynak dokümanı WHEP adresi ve konuşma-bitti sinyalinin tam doğrulanmadığını söylüyor. Kurulacak sunucunun gerçek API'siyle eşleştirilmeden kusursuz konuşan avatar kabulü yapılamaz.
9. Avatar/model ağırlıkları, referans fotoğraflar ve ses örneklerinin ticari kullanım izinleri ayrı değerlendirilmelidir. Runtime'ın açık kaynak olması her modelin/varlığın aynı lisansa sahip olduğu anlamına gelmez.
10. OpenTalking avatarı kendi sunucu TTS hattını kullanabiliyor; config'te chatterbox seçmek tek başına avatarın dahili sesini değiştirmeyebilir. İki eşzamanlı ses üretim yolu oluşturulmamalı.

## Hedef mimari — sonraki aşama

Tarayıcıda açık onay ve yerel kamera önizlemesi; yalnızca izin verilen sesin yetkilendirilmiş gateway üzerinden yerel STT'ye aktarılması; mevcut deterministik tenant/RBAC iş araçlarının korunması; gerekiyorsa katalog temelli yerel dil modeli; yerel TTS ve doğrulanmış avatar ses/video yolu. Kamera hiçbir bu sunucu adımına taşınmamalı.

Cloudflare Pages arayüzü, Worker ise kimlik/kota/gateway işlerini barındırabilir; GPU model çıkarımı ayrı bir sunucu gerektirir. WebRTC gerekiyorsa signaling ve STUN/TURN ihtiyaçları gerçek topolojiyle belirlenmeli. Model ve altyapı maliyeti sıfır veya tüm diller kusursuz varsayılmamalı.

## Değiştirmediklerimiz

Avatar varsayılanı, ücretli servis yapılandırmaları, sağlayıcı modülleri, SQL/RBAC, şema, mevcut iş akışları ve tasarım yeniden yazılmadı. Bu engeller çözülmeden SaaS bağımlılıklarının kaldırıldığı veya fotogerçekçi 3D avatarın çalıştığı söylenemez.
