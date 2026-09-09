# VERALIQ — DATA-PROCESSING-MAP.md

Faz 3 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md). Gerçek, koddan doğrulanmış
çalışma zamanı veri akışı — varsayım/iddia değil, her satır ilgili kaynak dosyaya
referanslı. `privacy.html`/`kvkk.html`/`terms.html`/consent dialog bu haritaya göre
hizalanır (bkz. bu dosyanın sonundaki "Hizalama" bölümü).

## 1. Altyapı

- **Cloudflare Pages** — statik site barındırma (`public-dist/`, bkz. Faz 1).
- **Cloudflare Workers** — 4 ayrı worker: `worker-portal` (D1 + Durable Object,
  şirket/admin backend'i), `worker-spatius` (Spatius session + Google Translate TTS
  proxy'si, Faz 2'de sertleştirildi), `worker-llm` (Anthropic Claude proxy — koda
  var, hiçbir aktif `llmProvider` bunu seçmiyor, bkz. §4), `worker` (eski Anam proxy
  — koda var, hiçbir aktif `avatarProvider` bunu seçmiyor, bkz. §4).
- **Cloudflare D1** (`worker-portal`) — şirket/kullanıcı/proje/birim/lead/müşteri/
  konuşma/audit_log tabloları.

## 2. Aktif sesli asistan akışı (index.html + admin.html + portal.html)

`agent-core/config.js`'in şu anki (2026-09-09) değerleri — üçü de AYNI config'i
paylaşıyor (bkz. `IMPLEMENTATION-BASELINE.md` §1.1, bu değer oturum içinde bir kez
değişti):

| Bileşen | Sağlayıcı | Veri akışı |
|---|---|---|
| Avatar (görsel) | **Spatius** | Tarayıcı, `worker-spatius`'tan kısa ömürlü bir session token alır (Faz 2: artık `/visitor-token` ile önce bir ziyaretçi token'ı gerekiyor), ardından Spatius'un kendi Motion Server'ına (üçüncü taraf, ABD) DOĞRUDAN bağlanıp ses baytlarını (PCM16, agent'ın KENDİ ürettiği/TTS'ten gelen konuşma sesi — müşterinin sesi DEĞİL) gönderir, karşılığında dudak-senkronlu video alır. Spatius'un kendi gizlilik/veri işleme koşulları ayrıca geçerlidir (VERALIQ'in kontrolü dışında). |
| TTS (agent'ın sesi) | **Google Translate** (dokümante edilmemiş `translate_tts` endpoint'i) | Agent'ın SÖYLEYECEĞİ metin (FAQ/adminAssistant/companyAssistant'ın ürettiği yanıt — müşterinin kendi sözleri değil, ama yanıt müşterinin sorduğu özel bilgiyi (proje adı, fiyat vb.) yansıtabilir), `worker-spatius`'un `/tts` route'u üzerinden Google'a gönderilir, sese çevrilip geri döner. Resmi bir SLA'si/ticari kullanım lisansı YOK (bkz. `google-translate-tts-provider.js` başlığı) — geçici/doğrulama katmanı, kalıcı production çözümü değil. |
| STT (ziyaretçinin sesi) | **Web Speech API** (tarayıcı yerleşik) | Ziyaretçinin SESİ, tarayıcının kendi konuşma tanıma motoruna gider — bu, TARAYICI/İŞLETİM SİSTEMİ BAĞIMLI bir kara kutudur: Chrome'da genellikle Google'ın bulut STT servisine, Safari'de Apple'ın servisine gider. VERALIQ bu işlemeyi YÖNETMEZ, GÖRMEZ, GÜVENCE VEREMEZ — `call-consent.js`'teki rıza metni bunu zaten doğru şekilde "tarayıcı veya üçüncü taraf servisleri kullanabilir, tamamen yerel çalışma garantisi yok" diye belirtiyor (bkz. §5, bu metin değiştirilmedi çünkü zaten doğru). |
| LLM ("beyin") | `faq` (index.html) / `adminAssistant` (admin.html) / `companyAssistant` (portal.html) | Hiçbiri harici bir LLM API'sine gitmez — hepsi deterministik, sabit backend fonksiyonları çağıran Zero Trust AI beyinleri (bkz. CLAUDE.md). Hiçbir zaman SQL üretmez/rastgele intent çalıştırmaz. |

## 3. Konuşma kalıcılığı — YALNIZCA portal.html için aktif

`agent-core/conversation-logger.js`, `opts.conversationLogging` ayarlanmışsa
`worker-portal`'ın `/api/conversations*` uçlarına yazar:

- **`index.html`** (`widget.js`) — `conversationLogging` HİÇ AYARLANMAMIŞ. Ziyaretçi
  konuşması yalnızca tarayıcı belleğinde (`orchestrator.js`'in `history` dizisi)
  tutulur, sayfa kapatılınca/yenilenince KAYBOLUR. Sunucuya HİÇ yazılmaz.
- **`admin.html`** (`admin-widget.js`) — bilinçli olarak BAĞLANMADI (dosyanın kendi
  yorumu: "conversationLogging BİLİNÇLİ OLARAK BAĞLANMADI"). Aynı şekilde kalıcı
  değil.
- **`portal.html`** (`portal-widget.js:42`) — `conversationLogging: { tokenKey:
  'veraliq_company_jwt', channel: 'portal' }` AKTİF. Giriş yapmış şirket personeli
  "Şirket Yönetim Asistanı"yla konuştuğunda, her mesaj `worker-portal` D1'deki
  `conversations`/muhtemelen ilişkili mesaj tablosuna KALICI olarak yazılır
  (`customer_id`/`lead_id` ile ilişkilendirilebilir). Kimlik doğrulama olmadan
  (JWT yoksa) hiçbir ağ çağrısı yapılmaz — 401 spam'i önlemek için sessizce atlanır.

## 4. Kodda var ama AKTİF DEĞİL

- **Anthropic Claude** (`worker-llm`, `agent-core/llm-providers/anthropic-provider.js`)
  — hiçbir sayfa `llmProvider: 'anthropic'` seçmiyor.
- **OpenAI** (`agent-core/llm-providers/openai-provider.js`) — aynı şekilde seçilmiyor.
- **Anam** (`worker/session-worker.js`, `agent-core/avatar-providers/anam-avatar-provider.js`)
  — eski/legacy entegrasyon, kod hâlâ repoda ama `avatarProvider` onu seçmiyor.
- **Self-hosted STT/TTS/avatar** (Chatterbox, QuickTalk, MuseTalk, Whisper) — kod
  iskeletleri var, hiçbiri kurulmadı/seçilmedi (`docs/SELF_HOSTED_DEPLOYMENT.md`).

## 5. Kimlik doğrulama / oturum verisi

- `admin.html` ve `portal.html`: giriş sonrası JWT, `sessionStorage`'a yazılır
  (`admin.html:291-292`, `portal.html:311-315` — `TOKEN_KEY`/`USER_KEY`/`COMPANY_KEY`).
  `sessionStorage` sekme kapanınca otomatik temizlenir (tarayıcının kendi davranışı,
  ayrı bir "çıkış yap" akışı gerekmeden) — `localStorage` KULLANILMIYOR.
- `worker-portal`'ın `audit_log` tablosu her admin/şirket işleminde `ip`
  (`CF-Connecting-IP` header'ından, `portal-api-worker.js:57`) ve `device` (User-Agent)
  alanlarını KALICI olarak, HİÇBİR otomatik silme/TTL mekanizması OLMADAN saklıyor
  (`portal-api-worker.js:52` civarı — grep ile doğrulandı, bir retention job'u yok).

## 6. Saklama ve silme — gerçek durum (dürüstçe)

**Hiçbir otomatik veri saklama süresi veya silme akışı bugün kodda YOK.** Ne
`audit_log`, ne `conversations`, ne `customers`/`leads` tabloları için bir TTL/
arşivleme/anonimleştirme job'u mevcut. Bu, `privacy.html`/`kvkk.html`'nin "süre
sonunda silinir" gibi genel/soyut ifadelerinin ARKASINDA somut bir teknik
mekanizma olmadığı anlamına gelir. Bu belge bunu iddia olarak DEĞİL, açık bir
blocker olarak `LEGAL-INPUT-REQUIRED.md`'ye işliyor — gerçek bir silme/saklama
akışı kurulana kadar yasal metinlerde "hazır silme süreci" gibi somut bir teknik
vaat kullanılmamalı (yalnızca KVKK'nın kendi genel ilkesi tekrar edilebilir, ki
kvkk.html zaten bunu yapıyor, spesifik bir sistem iddiası olmadan).

## 7. Aydınlatma vs. açık rıza ayrımı (mevcut durum, doğru)

`call-consent.js`'teki dialog (index/admin/portal ortak) HEM aydınlatma (AI kimliği,
ticari amaç, STT'nin tarayıcı/3.taraf bağımlılığı) HEM açık rıza (checkbox +
"Onayla ve başlat" butonu) içeriyor — bu ayrım zaten fiilen doğru kurulmuş, master
promptun istediği gibi. Değiştirilmedi.

## 8. Hizalama — bu belgeye göre yapılan düzeltmeler

- `privacy.html` / `kvkk.html`: var olmayan "Google (Gemini API)" işlemci iddiası
  kaldırıldı; gerçek aktif üçüncü taraflar (Spatius, Google Translate TTS, ve
  STT için tarayıcı-bağımlı üçüncü taraf işleyiciler) eklendi. Anthropic/OpenAI
  aktifmiş gibi YAZILMADI (zaten yazılmamıştı — bu doğru durum korundu).
- Şirket unvanı/MERSİS/açık adres alanları hâlâ `[düzenleyin]` placeholder'ları —
  UYDURULMADI, `LEGAL-INPUT-REQUIRED.md`'de blocker olarak listelendi.
- Son metinlerin profesyonel hukuki incelemeye ihtiyacı olduğu notu her iki
  belgede zaten mevcuttu — korundu.
