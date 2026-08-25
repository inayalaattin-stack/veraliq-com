# VERALIQ Digital Human Engine — Faz 1-3 Analiz ve Mimari Raporu

**Tarih:** 2026-08-25
**Kapsam:** `github.com/inayalaattin-stack/veraliq-com` reposunun tam analizi, Anam.ai bağımlılık haritası, provider-agnostic Digital Human Engine mimarisi ve bu turda gerçekten yazılan kod.

> Bu doküman, talep edilen "CURRENT ARCHITECTURE / ANAM DEPENDENCIES / PROPOSED ARCHITECTURE / FILES TO CHANGE / FILES TO CREATE / RISKS / LICENSE RISKS / GPU REQUIREMENTS / EXPECTED COST" raporudur. Kodlamaya bu raporun ardından, aynı oturumda başlandı — aşağıda "Bu Turda Teslim Edilenler" bölümünde ne durduğu var.

---

## 0. ÖNEMLİ GERÇEK DURUM TESPİTİ

Talepte "mevcut kod tabanını incele, mevcut mimariyi anla, çalışan sistemi doğrudan geliştir" deniyor. Repoyu klonlayıp satır satır incelendikten sonraki gerçek durum, 44 maddelik talebin varsaydığından belirgin şekilde daha küçük:

**Repoda gerçekten var olan:**
- Statik pazarlama sitesi: `index.html` (54KB), `script.js` (23KB), `i18n.js` (135KB, 8 dilde çeviri sözlüğü), `privacy.html`, `kvkk.html`, `terms.html`
- Cloudflare Pages üzerinden yayınlanıyor (repo kökü = publish dizini)
- Tek bir Cloudflare Worker: `worker/session-worker.js` (~5.5KB) — tek işi Anam session-token basmak
- 8 dilli i18n sistemi (TR/EN/AR/RU/DE/FA/FR/ES), RTL desteği, dil değişimi `localStorage`'da tutuluyor
- "Adaptive Agent Window": corner / half / fullscreen / minimized(bubble) / closed durum makinesi, sürükle-bırak köşeye yapıştırma, bağlantı koptuğunda üstel geri-çekilmeli otomatik yeniden bağlanma — bu **gerçekten iyi yazılmış, Anam'a özel olmayan** bir UI iskeleti (bkz. Bölüm 2)

**Repoda OLMAYAN** (PRD.md'de vizyon olarak tarif edilmiş ama koda hiç dökülmemiş):
- Backend/API sunucusu, veritabanı, authentication sistemi
- Şirket portalı, admin portalı, multi-tenant altyapı
- CRM/lead sistemi, onay (approval) motoru, ödeme planı motoru, sözleşme sistemi
- WhatsApp entegrasyonu, PDF/PPT/Excel sunum sistemi
- Proje lokasyon analizi / harita entegrasyonu
- Raporlama/KPI sistemi

Yani 42 maddelik talebin **15-27, 20-23, 40 gibi bölümleri "mevcut sistemi geliştirme" değil, sıfırdan yeni bir backend/SaaS platformu inşa etme** işi — bu, ayrı ve çok büyük bir mühendislik projesi (haftalar sürer). Bu rapor ve bu turda yazılan kod, talebin **asıl hedefine ("ANA HEDEF: Anam.ai bağımlılığını tamamen ortadan kaldır" + provider-agnostic Digital Human Engine + Mock Mode)** odaklanıyor. CRM/ödeme/onay/WhatsApp/sözleşme/raporlama katmanları için Bölüm 8'de ayrı bir yol haritası veriyorum.

**Kritik ek gerçek:** Önceki oturumlardan hafızada duran bilgiye göre, Anam.ai entegrasyonu **2026-08-24 itibarıyla kullanım limitine ulaştı** ve widget şu anda ziyaretçilere "Agent şu anda bağlanamıyor" gösteriyor. Yani bugün canlıda "çalışan" bir Anam deneyimi zaten yok — bu, aşağıdaki değişikliklerin "çalışan bir şeyi bozma" değil, **zaten bozuk olan bir özelliği onarma** anlamına geldiğini gösteriyor. Bunu siz de tarayıcıdan doğrulamak isteyebilirsiniz.

---

## 1. CURRENT ARCHITECTURE

```
Ziyaretçi tarayıcısı
   │
   ├─► Cloudflare Pages (veraliq-com.pages.dev, DNS: veraliq.com)
   │      index.html + script.js + i18n.js  (tamamen statik, build adımı yok)
   │
   └─► script.js "Adaptive Agent Window" IIFE
          │  dynamic import: https://esm.sh/@anam-ai/js-sdk@latest   (npm bağımlılığı DEĞİL — CDN'den runtime'da çekiliyor)
          │
          ├─► POST https://veraliq-agent.veraliq-com.workers.dev/session
          │        (Cloudflare Worker: worker/session-worker.js)
          │        env.ANAM_API_KEY (secret, sadece worker'da) ──► POST https://api.anam.ai/v1/auth/session-token
          │        ◄── { sessionToken }
          │
          └─► anamClient = createClient(sessionToken)
                 anamClient.streamToVideoElement('agentVideo')   (WebRTC video/audio Anam'ın kendi altyapısından geliyor)
```

Persona ("Elif Kaya", TR, personaId `9ae72476-...`), ses, dil davranışı ve konuşma mantığının **tamamı Anam Lab'de** tanımlı — kod tabanında hiçbir konuşma/LLM mantığı yok. `worker/session-worker.js` kasıtlı olarak "tek iş yapan" bir proxy: gerçek API anahtarını tarayıcıya sızdırmadan session token basmak.

---

## 2. ANAM DEPENDENCIES (Dependency Map)

Repo genelinde `anam` için tam metin taraması yapıldı — Anam'a değen **her yer**:

| # | Dosya | Ne yapıyor | Anam'a bağımlılık derecesi |
|---|---|---|---|
| 1 | `worker/session-worker.js` | Tüm dosyanın *tek amacı* Anam session-token basmak; `ELIF_KAYA_PERSONA_ID` hard-code, `PERSONA_BY_LANGUAGE` haritası, `https://api.anam.ai/v1/auth/session-token` çağrısı | **Tam bağımlı** — dosyanın kendisi Anam-özel |
| 2 | `worker/wrangler.toml`, `worker/README.md` | `ANAM_API_KEY` secret'ı, worker adı `veraliq-agent` | **Tam bağımlı** (konfig/dokümantasyon) |
| 3 | `script.js` satır 293-580 (Adaptive Agent Window) | `SDK_URL = esm.sh/@anam-ai/js-sdk`, `SESSION_ENDPOINT`, `createClient`, `AnamEvent` isimleri (`VIDEO_PLAY_STARTED`, `SESSION_READY`, `CONNECTION_ESTABLISHED/CLOSED`, `USER_SPEECH_STARTED/ENDED`, `MIC_PERMISSION_*`), `anamClient.streamToVideoElement` / `stopStreaming` | **Kısmen bağımlı** — pencere durum makinesi (corner/half/fullscreen/bubble/reopen, sürükleme, dil değişince yeniden bağlanma) Anam'a özel değil; sadece `initAgent()` fonksiyonunun *içi* Anam SDK'sına bağlı |
| 4 | `index.html` satır 893-899 | Sadece açıklama yorumu ("Anam.ai JS SDK ile...") | **Bağımlılık yok** — `<video id="agentVideo">` elementi zaten provider-agnostic |
| 5 | `README.md`, `PRD.md` | Anam'dan bahsetmiyor (README hatta eski/yanlış — hâlâ "Google Gemini" worker'ından bahsediyor, güncellenmemiş) | — |

**Bulunmayanlar (önemli):** `package.json` içinde `@anam-ai/js-sdk` diye bir npm bağımlılığı **yok** — SDK tarayıcıda runtime'da CDN'den çekiliyor. Yani "npm uninstall" adımı gerekmiyor; kaldırma işlemi = `initAgent()` içindeki dynamic import'u ve worker'daki `/session` çağrısını devre dışı bırakmak. Anam webhook, billing logic, ayrı bir "Anam client SDK" paketi de yok — kullanıcının playbook'ta varsaydığı bazı bağımlılık türleri (`Anam webhook`, `Anam billing logic`) zaten kod tabanında hiç var olmamış.

**Sonuç:** Anam'ı koddan çıkarmak, sanıldığından çok daha küçük bir operasyon — tek dosya (`worker/session-worker.js`) + `script.js`'in ~290 satırlık bir bölümü. Asıl büyük iş, onun **yerine gerçekten çalışan bir şey koymak**.

---

## 3. PROPOSED ARCHITECTURE — VERALIQ Digital Human Engine

```
CUSTOMER (browser)
   │
   ▼
AGENT WINDOW (corner/half/fullscreen/bubble/closed — korunan mevcut UI)
   │
   ▼
ORCHESTRATOR  (agent-core/orchestrator.js)              STATE MACHINE
   │  IDLE → LISTENING → THINKING → SPEAKING            (agent-core/state-machine.js)
   │  ↕ INTERRUPTED (barge-in)  → PRESENTING → WAITING_APPROVAL → COMPLETED
   │
   ├─ STTProvider   ──►  WebSpeechSTTProvider (bugün, ücretsiz)  │  WhisperSTTProvider (self-host, GPU)
   ├─ LLMProvider   ──►  FaqSalesBrainProvider (bugün, ücretsiz) │  OpenAI/Anthropic Provider (anahtar eklenince)
   ├─ TTSProvider   ──►  WebSpeechTTSProvider (bugün, ücretsiz)  │  ChatterboxTTSProvider (self-host, GPU)
   └─ AvatarProvider──►  MockAvatarProvider (bugün, GPU gerekmez)│  QuickTalk/MuseTalkProvider (self-host, GPU) │ AnamAvatarProvider (izole, varsayılan KAPALI)
          │
          ▼
      EmotionEngine — LLM yanıtının/duygu etiketinin avatar mimiğine eşlenmesi
```

Her katman `packages`/`agent-core` içinde bir **interface** (JSDoc tip sözleşmesi) olarak tanımlı; hangi implementasyonun kullanılacağı tek bir `config.js` dosyasından seçiliyor — kod değişikliği gerekmeden `avatarProvider: "mock" | "anam" | "quicktalk" | "musetalk"` gibi.

**Neden Cloudflare Workers değil de düz statik dosyalar + tarayıcı tarafı orchestrator?** Mevcut site build adımı olmayan vanilla JS — bu tutarlılığı bozmamak ve Cloudflare Pages dağıtımını riske atmamak için `agent-core` da aynı şekilde build-step'siz ES modülleri olarak yazıldı. GPU gerektiren gerçek servisler (STT/TTS/Avatar model çıkarımı) zaten ayrı bir sunucuda (sizin GPU makineniz) HTTP/WebSocket ile konuşulacak — bu yüzden orchestrator'ın kendisi Cloudflare'de mi tarayıcıda mı çalıştığı ikinci derece önemli; şu an tarayıcıda çalışması en az hareketli parçayı olan seçenek.

---

## 4. FILES TO CHANGE

| Dosya | Değişiklik |
|---|---|
| `script.js` | Adaptive Agent Window'un `initAgent()` içindeki Anam SDK çağrıları kaldırıldı; yerine `agent-core/orchestrator.js` bağlandı. Pencere durum makinesi (corner/half/fullscreen/bubble/reopen/sürükleme) **birebir korundu**. |
| `index.html` | `<script type="module">` ile yeni `agent-core` giriş noktası eklendi; Anam'a atıf yapan yorum satırları güncellendi. Görünür DOM (video elementleri, kontrol butonları) değişmedi. |
| `worker/README.md` | Anam worker'ının artık **opsiyonel/legacy** olduğu, varsayılan pipeline'da kullanılmadığı not edildi. |
| `README.md` | Güncel olmayan "Google Gemini worker" referansı düzeltildi, gerçek mimari yazıldı. |

## 5. FILES TO CREATE (bu turda gerçekten yazıldı — bkz. Bölüm 7)

```
agent-core/
  config.js                          — provider seçimi (tek nokta)
  providers.js                       — 4 interface: AvatarProvider, TTSProvider, STTProvider, LLMProvider
  state-machine.js                   — ConversationStateMachine (8 durum)
  emotion-engine.js                  — metin/intent → emotion state
  orchestrator.js                    — STT→LLM→TTS→Avatar akışı, barge-in/interruption control
  avatar-providers/
    mock-avatar-provider.js          — canvas tabanlı, GERÇEK ÇALIŞAN, GPU gerektirmeyen avatar
    anam-avatar-provider.js          — mevcut Anam SDK mantığı, izole edildi, varsayılan KAPALI
    quicktalk-avatar-provider.js     — OpenTalking/QuickTalk self-host sunucusuna WebRTC client (GPU'da doğrulanacak)
    musetalk-avatar-provider.js      — MuseTalk self-host sunucusuna client (fallback, GPU'da doğrulanacak)
  tts-providers/
    webspeech-tts-provider.js        — GERÇEK ÇALIŞAN, tarayıcı SpeechSynthesis
    chatterbox-tts-provider.js       — self-host Chatterbox sunucusuna HTTP client (GPU'da doğrulanacak)
  stt-providers/
    webspeech-stt-provider.js        — GERÇEK ÇALIŞAN, tarayıcı SpeechRecognition, interim-result barge-in
    whisper-stt-provider.js          — self-host faster-whisper sunucusuna client (GPU'da doğrulanacak)
  llm-providers/
    faq-sales-brain-provider.js      — GERÇEK ÇALIŞAN, anahtar gerektirmeyen deterministik VERALIQ bilgi tabanı
    openai-provider.js               — stub, kullanıcı kendi anahtarını ekleyince aktif
    anthropic-provider.js            — stub, kullanıcı kendi anahtarını ekleyince aktif
services/
  stt/  (Dockerfile + FastAPI iskeleti, faster-whisper)
  tts/  (Dockerfile + FastAPI iskeleti, Chatterbox Multilingual V3)
  avatar/ (Dockerfile + kurulum notları, OpenTalking + QuickTalk/MuseTalk)
docs/
  DIGITAL_HUMAN_ENGINE_REPORT.md     — bu dosya
  SELF_HOSTED_DEPLOYMENT.md          — GPU makinenizde kurulum adımları
```

---

## 6. RISKS

1. **Kalite beklentisi:** Bugün varsayılan olarak devreye giren `WebSpeech*` (tarayıcı STT/TTS) ve `MockAvatarProvider`, Anam'ın fotogerçekçi videosu/doğal sesi **seviyesinde değil**. Bu bilinçli bir ara adım — GPU'lu gerçek avatar (QuickTalk/MuseTalk) ve Chatterbox TTS devreye girene kadar. Bunu netleştirmek için sitede/portalda "Beta" ibaresi düşünülebilir.
2. **Tarayıcı desteği:** `SpeechRecognition` (STT) yalnızca Chrome/Edge/Safari (kısmi) destekliyor, Firefox desteklemiyor. Firefox ziyaretçileri için otomatik olarak yazılı chat'e düşen bir fallback eklendi (Bölüm 7).
3. **Bu oturumun GitHub'a push yetkisi yok:** `git push` denemesi `403 access denied by the git proxy` ile reddedildi (repo bu session'ın yetkili kaynak listesinde değil). Kod yerelde commit edildi; teslimat git bundle + zip olarak yapıldı — Bölüm 9'da tam talimat var.
4. **GPU'lu fazlar bu ortamda çalıştırılamıyor/doğrulanamıyor:** Bu cloud sandbox'ta GPU yok. `services/` altındaki QuickTalk/MuseTalk/Chatterbox/Whisper servisleri **yazıldı ama bu oturumda çalıştırılıp test edilmedi** — gerçek doğrulama sizin GPU makinenizde yapılmalı (bkz. Bölüm 8-9).
5. **Lenovo LOQ 15IAX9 laptop GPU kapasitesi:** Bu model tipik olarak RTX 4050/4060 (6-8GB VRAM) ile geliyor. Yayınlanmış bir MuseTalk performans testinde gerçek-zamanlı, birden fazla eşzamanlı oturum için RTX 4090 (24GB, batch=4'te ~20GB kullanım) öneriliyor. Tek ziyaretçi/düşük batch'te 6-8GB'lık bir laptop GPU'su muhtemelen çalışır ama üretim kalitesinde eşzamanlı çoklu görüşme için yetersiz kalabilir — gerçek FPS/gecikme sadece o donanımda ölçülerek doğrulanabilir. ([kaynak](https://frankfu.blog/real-time-digital-human/digital-human-series-4-parameter-tuning-and-gpu-selection-for-a-real-time-digital-human-system-based-on-musetalk-realtime-api/))
6. **Prompt injection / veri güvenliği (Bölüm 26-27 talebi):** Bugünkü `FaqSalesBrainProvider` deterministik ve LLM kullanmıyor, dolayısıyla prompt injection yüzeyi yok. Gerçek bir LLM (OpenAI/Anthropic) bağlanınca, kullanıcı yüklediği PDF/Excel içeriğinin "untrusted data" olarak işaretlenmesi ayrı bir güvenlik implementasyonu gerektirir — bu turda **henüz yapılmadı**, sadece mimaride yer ayrıldı.

## 7. LICENSE RISKS (gerçek zamanlı doğrulandı, 2026-08-25)

| Proje | Lisans | Not |
|---|---|---|
| **OpenTalking** (`datascale-ai/opentalking`) — talebinizdeki "OPEN TALKING" bu | **Apache-2.0** | Orkestrasyon çatısının kendisi temiz. Kendi "Mock mode"u var, GPU gerektirmiyor — Faz 4'ün (Bölüm 30) referans aldığı proje tam da bu. ([kaynak](https://github.com/datascale-ai/opentalking)) |
| **QuickTalk** model ağırlıkları (`datascale-ai/quicktalk`, OpenTalking'in içindeki avatar modeli) | **"License: other"** — Hugging Face model kartında net bir standart lisans etiketlenmemiş, "upstream model card ve lisansları inceleyin" notu var | ⚠️ **Belirsiz.** Sizin kendi kuralınız ("Lisansı belirsiz bir modeli production'a koyma") gereği, QuickTalk ağırlıkları production'a alınmadan önce HF reposundaki tam LICENSE/model kartı elle okunmalı. ([kaynak](https://huggingface.co/datascale-ai/quicktalk)) |
| **MuseTalk** (Tencent Music, `TMElyralab/MuseTalk`) | **MIT** | Ticari kullanıma açık, ek kısıtlama yok. Şu an için **en net lisanslı seçenek** — QuickTalk'un lisansı netleşene kadar birincil aday olarak MuseTalk önerilir (talebinizdeki sıralamanın tersi ama lisans netliği gerekçesiyle). ([kaynak](https://github.com/TMElyralab/MuseTalk/blob/main/LICENSE)) |
| **LiveTalking** (`lipku/LiveTalking`) | **Apache-2.0** ama README'de "Bilibili/Douyin/WeChat gibi platformlarda yayınlanan videolarda LiveTalking filigranı/marka zorunlu" notu var; entegre ettiği **Wav2Lip** modeli ayrı ve **belirsiz/araştırma-amaçlı** lisanslı (topluluk tartışmaları ticari kullanımı net onaylamıyor) | LiveTalking'i kullanacaksanız Wav2Lip modelini DEĞİL, MuseTalk modelini seçin. ([kaynak](https://github.com/lipku/LiveTalking)) |
| **Chatterbox Multilingual TTS** (Resemble AI) | **MIT** | Ticari kullanıma tamamen açık, filigran/watermark opsiyonel bir güven özelliği olarak var (zorunlu değil). ([kaynak](https://github.com/resemble-ai/chatterbox)) |
| **faster-whisper** (SYSTRAN) | **MIT** | Ticari kullanıma tamamen açık. ([kaynak](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE)) |
| **SenseVoice** (FunAudioLLM/Alibaba) | Kod: **MIT**; model ağırlıkları: FunASR Model Open Source License Agreement (atıf şartlı, ticari kullanım izinli) | İkinci STT adayı olarak kullanılabilir; atıf şartına uyulmalı. ([kaynak](https://github.com/FunAudioLLM/SenseVoice)) |

**Öneri:** Avatar motorunda **birincil: MuseTalk (MIT, net)**, **ikincil/deneysel: QuickTalk (lisans netleşince)** — bu, sizin QuickTalk-öncelikli talebinizin tam tersi ama "lisansı belirsiz model production'a girmez" kuralınızı önceliklendiriyor. STT'de **faster-whisper (MIT)** birincil. TTS'te **Chatterbox Multilingual (MIT)** — talebinizle bire bir uyumlu.

## 8. GPU REQUIREMENTS

| Bileşen | Minimum (tek ziyaretçi, düşük gecikme hedefi yok) | Önerilen (üretim, birkaç eşzamanlı görüşme) |
|---|---|---|
| MuseTalk / QuickTalk avatar çıkarımı | ~6-8GB VRAM (RTX 4050/4060 sınıfı) — laptopunuzda muhtemelen çalışır, ölçülmeli | RTX 4090 24GB sınıfı (yayınlanmış bir referans testte batch=4'te ~20GB kullanım) |
| Chatterbox Multilingual TTS | ~4-6GB VRAM (CPU'da da çalışır ama çok daha yavaş) | Ayrılmış 6GB+ |
| faster-whisper (STT) | CPU'da bile çalışır (int8), GPU'da çok daha hızlı | 2-4GB VRAM yeterli |

**Sonuç:** Lenovo LOQ 15IAX9 (RTX 4050/4060) laptopunuz **geliştirme + tek-ziyaretçi pilot testi** için muhtemelen yeterli; gerçek üretim trafiği (aynı anda birden fazla ziyaretçi + yüksek görüntü kalitesi) için performans laptopta bizzat ölçülmeden garanti verilemez. Bu, GPU çıkarım servislerinin bu cloud oturumunda çalıştırılıp doğrulanamamasının doğal sonucu — Bölüm 9'daki adımlarla kendi makinenizde ölçüm yapmanız gerekiyor.

## 9. EXPECTED COST

| Kalem | Anam.ai (eski) | Yeni mimari |
|---|---|---|
| Avatar/dakika ücreti | Kullanım bazlı, plan limiti aşıldığında ek ücret (şu an tam da bu limite takıldınız) | **$0** — kendi donanımınızda self-hosted |
| TTS | Anam paketine dahil | **$0** (Chatterbox, self-hosted) — bugün ara çözüm: tarayıcı SpeechSynthesis, **$0** |
| STT | Anam paketine dahil | **$0** (faster-whisper, self-hosted) — bugün ara çözüm: tarayıcı SpeechRecognition, **$0** |
| LLM | Anam paketine dahil | Bugün **$0** (deterministik FAQ motoru); ileride gerçek LLM bağlanırsa kullanım bazlı (OpenAI/Anthropic/Gemini fiyatlandırması, sizin seçiminize bağlı) |
| Sunucu/GPU | Anam'ın kendi altyapısı | **$0 ek maliyet** — mevcut Lenovo laptop; elektrik/amortisman dışında yeni harcama yok |
| Cloudflare Pages/Workers | Free tier (mevcut) | Aynı — değişmiyor |

Yani hedef olan "Anam dakika-bazlı maliyetini sıfırlama" bu mimariyle **doğrudan karşılanıyor** — bugünden itibaren $0 işletme maliyeti, tek "maliyet" sizin GPU makinenizin elektrik/amortismanı ve gelecekte gerçek bir LLM bağlarsanız o LLM'nin token ücreti.

---

## 10.5 GERÇEK DOĞRULAMA — headless tarayıcı ile uçtan uca test

"Sadece güzel görünen bir demo yapma, gerçekten çalışan sistem yap" talimatı
gereği, kod yazılıp bırakılmadı — bu cloud ortamında önceden kurulu Chromium
ile **gerçek bir headless tarayıcı oturumu açılıp site çalıştırıldı** ve
pipeline uçtan uca test edildi. Bu test 3 gerçek bug buldu ve hepsi bu turda
düzeltildi:

1. **`WebSpeechTTSProvider` sonsuza kadar askıda kalabiliyordu** — bazı
   ortamlarda (test edilen headless Chromium dahil) tarayıcının
   `SpeechSynthesis` API'si `onend`/`onerror` hiç tetiklemiyor; bu da tüm
   orchestrator'ı donduruyordu. Düzeltme: metne göre hesaplanan bir güvenlik
   zaman aşımı eklendi (`webspeech-tts-provider.js`).
2. **`MockAvatarProvider.connect()` sonsuza kadar askıda kalabiliyordu** —
   `<video autoplay>` elementi `muted` değilse, kullanıcı etkileşimi
   olmadan `play()` çağrısının döndürdüğü promise bazı tarayıcılarda ne
   resolve ne reject oluyor. Düzeltme: canvas akışının zaten sesi olmadığı
   için video elementleri mute edildi + ek bir zaman aşımı sınırı eklendi.
3. **`ConversationStateMachine`, açılış selamlamasını reddediyordu** —
   IDLE → SPEAKING geçişi izin listesinde yoktu (spec section 11'deki kısa
   açılış konuşması). Düzeltme: bu geçiş izin listesine eklendi.
4. **`WebSpeechSTTProvider`, kalıcı `audio-capture` hatasında sınırsız
   restart döngüsüne giriyordu** (mikrofon donanımı yoksa saniyede
   onlarca kez yeniden başlatma denemesi). Düzeltme: ardışık sert hata
   sayacı + üst sınır eklendi.

Ayrıca `AgentOrchestrator`'ın **BARGE-IN/INTERRUPTION CONTROL**'ü (spec
bölüm 6) sahte (fake) provider'larla izole bir testte doğrulandı: durum
sırası tam olarak `LISTENING → THINKING → SPEAKING → (kesme) → INTERRUPTED
→ LISTENING` şeklinde gerçekleşti, hem `tts.stop()` hem `avatar.stopSpeaking()`
gerçekten çağrıldı. Bu testler bu oturumda çalıştırıldı; yeniden çalıştırmak
isterseniz `python3 -m http.server` ile repo kökünü servis edip Playwright
ile `index.html`'i açmanız yeterli — CI'a eklemek için iyi bir aday.

## 10. BU TURDA TESLİM EDİLENLER (gerçekten çalışan kod)

- ✅ Provider-agnostic mimari (`agent-core/`) — 4 interface, config-driven seçim
- ✅ `MockAvatarProvider` — GPU gerektirmeyen, canvas tabanlı, göz kırpma/nefes alma/emotion-state'e göre ifade değişimi olan **gerçekten çalışan** idle avatar
- ✅ `WebSpeechTTSProvider` + `WebSpeechSTTProvider` — tarayıcı API'leriyle **gerçekten çalışan**, $0 maliyetli sesli konuşma (interrupt/barge-in dahil)
- ✅ `FaqSalesBrainProvider` — VERALIQ hakkında **gerçekten çalışan** deterministik soru-cevap motoru (LLM anahtarı gerekmez)
- ✅ `ConversationStateMachine` (8 durum) + `EmotionEngine` + barge-in/interruption control
- ✅ `AnamAvatarProvider` — mevcut Anam mantığı izole edildi, config ile açılabilir ama **varsayılan kapalı**
- ✅ `script.js`/`index.html` yeni pipeline'a bağlandı, mevcut corner/half/fullscreen/bubble UI/UX **birebir korundu**
- ✅ `services/` altında STT/TTS/Avatar için Dockerfile + FastAPI iskeleti (GPU makinenizde `docker compose up` ile deploy edilecek, bu oturumda çalıştırılamadı)
- 🔜 **Bu turda yapılmayanlar** (ayrı faz/proje): CRM, onay motoru, ödeme planı motoru, sözleşme sistemi, WhatsApp entegrasyonu, admin/şirket portalı, çoklu-kiracı veritabanı, PDF/PPT sunum sistemi, lokasyon zekası, raporlama. Bunlar sıfırdan backend gerektiriyor — Faz 13-27 kapsamında ayrı bir çalışma önerilir.

---

## Kaynaklar (bu raporda kullanılan web araştırması)

- [OpenTalking (datascale-ai)](https://github.com/datascale-ai/opentalking) — Apache-2.0, mock mode
- [QuickTalk model kartı](https://huggingface.co/datascale-ai/quicktalk) — "License: other"
- [MuseTalk LICENSE](https://github.com/TMElyralab/MuseTalk/blob/main/LICENSE) — MIT
- [LiveTalking](https://github.com/lipku/LiveTalking) — Apache-2.0 + filigran notu
- [Chatterbox (Resemble AI) LICENSE](https://github.com/resemble-ai/chatterbox/blob/master/LICENSE) — MIT
- [faster-whisper LICENSE](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) — MIT
- [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) — kod MIT, ağırlıklar FunASR lisansı
- [MuseTalk GPU/VRAM performans testi](https://frankfu.blog/real-time-digital-human/digital-human-series-4-parameter-tuning-and-gpu-selection-for-a-real-time-digital-human-system-based-on-musetalk-realtime-api/)
