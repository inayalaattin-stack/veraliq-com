# VERALIQ — Proje Mimarisi

_Bu dosya gerçek, çalışan kod tabanını anlatır — planlanan/istenen değil, MEVCUT durumu. 2026-08-27 itibarıyla doğru. Codex veya başka bir ajan bu projede çalışacaksa önce bu dosyayı, sonra DATABASE_SCHEMA.md ve API_DOCUMENTATION.md'yi okumalı._

## 1. Üç ayrı yüzey, üç ayrı HTML dosyası

| Dosya | Kim için | Auth | Ana rolü |
|---|---|---|---|
| `index.html` | Herkese açık pazarlama sitesi | yok | VERALIQ'ı tanıtır, ziyaretçiyi "Elif Kaya" karşılar, demo talebi toplar |
| `admin.html` | VERALIQ'ın kendi ekibi | `veraliq_admin` rolü, JWT | Tüm şirketleri/kullanıcıları/projeleri yönetir, platform istatistikleri |
| `portal.html` | Müşteri şirketlerin ekibi | `company_owner` / `company_staff`, JWT | Kendi şirketinin projeleri/envanteri/lead'leri/satışları |

Üçü de bağımsız statik HTML dosyaları (build adımı yok, framework yok — vanilla JS + `<script>`). Aynı Cloudflare Pages sitesinden (`veraliq.com`) servis ediliyor.

## 2. Backend: tek Cloudflare Worker + D1 + bir Durable Object

`worker-portal/portal-api-worker.js` — admin.html ve portal.html'in KONUŞTUĞU tek backend. Ayrı ve bağımsız deploy edilir; `worker/` (Anam) ve `worker-spatius/` (Spatius session token) worker'larına dokunmaz.

- **Veritabanı**: Cloudflare D1 (SQLite), şema `worker-portal/schema.sql` — bkz. DATABASE_SCHEMA.md.
- **Durable Object**: `presentation-lock-do.js` → `PresentationLock` sınıfı, bir birimin (unit) aynı anda tek bir ajan (AI veya insan) tarafından "sunum kilidi" altına alınmasını garanti eder (race-condition güvenli).
- **Auth**: `auth.js` — PBKDF2-SHA256 (100.000 iterasyon, Web Crypto) parola hash'leme + HMAC-SHA256 imzalı JWT. Harici bir auth sağlayıcı (Auth0, Clerk vb.) YOK — kendi basit JWT'miz var.
- **Multi-tenant izolasyon**: her iş tablosu bir `company_id` taşır; her route `requireAuth()` ile JWT'yi doğrular ve `company_id`'yi İSTEMCİDEN DEĞİL JWT'DEN alır. `veraliq_admin` rolü tüm şirketleri görebilir, diğer roller yalnızca kendi `company_id`'lerini.

## 3. AI Ajan Motoru — `agent-core/` (provider-agnostic pipeline)

Bu, projenin en kritik soyutlama katmanı ve YENİ 65 maddelik master promptun 1-2-20-21-41-52. maddelerinin BÜYÜK KISMI ZATEN BURADA KARŞILANIYOR:

```
agent-core/
  providers.js      → 4 soyut arayüz: AvatarProvider, TTSProvider, STTProvider, LLMProvider
  config.js         → TEK config objesi (AGENT_PROVIDER_CONFIG) + dinamik import loader'lar
  orchestrator.js   → STT→LLM→TTS→Avatar akışını yönetir, barge-in / state machine
  state-machine.js  → ConversationStateMachine (IDLE/LISTENING/THINKING/SPEAKING/INTERRUPTED)
  emotion-engine.js → metinden kaba duygu sınıflandırması
  widget-runtime.js → pencere/bubble/fullscreen UI mantığı (persona-agnostic)
  widget.js, admin-widget.js, portal-widget.js → her sayfanın İNCE sarmalayıcısı
  avatar-providers/ → mock, anam, spatius, quicktalk, musetalk, opentalking-base
  tts-providers/    → webspeech, chatterbox, google-translate
  stt-providers/    → webspeech, whisper
  llm-providers/    → faq (müşteri satış), adminAssistant, companyAssistant, openai, anthropic
```

**Provider değişimi tek satır**: `agent-core/config.js`'teki `AGENT_PROVIDER_CONFIG` objesindeki bir string'i değiştirip deploy etmek yeterli — `orchestrator.js` hiçbir zaman somut bir sağlayıcıyı import etmez, yalnızca `providers.js`'teki arayüzlerle konuşur. Bugün: `avatarProvider:'spatius'` (persona: Elif Kaya, Spatius'un "Clara" avatarı), `ttsProvider:'googleTranslate'`, `sttProvider:'webspeech'`, `llmProvider:'faq'` (yalnızca index.html için — admin.html/portal.html kendi `llmProvider` override'larını `createProviders()`'a geçiyor: `adminAssistant` / `companyAssistant`).

**Üç farklı "beyin", AYNI avatar/ses altyapısı**:
1. `FaqSalesBrainProvider` (index.html) — VERALIQ'ı tanıtır, sabit bilgi tabanı, API çağrısı yok.
2. `AdminAssistantBrainProvider` (admin.html) — `POST /api/admin/assistant/query`'yi çağırır, platform-geneli.
3. `CompanyAssistantBrainProvider` (portal.html) — `POST /api/assistant/query`'yi çağırır, JWT ile şirkete izole.

**Zero Trust AI**: Üç "beyin" de kendi başına SQL üretmiyor / veritabanına dokunmuyor — hepsi worker içindeki SABİT, deterministik `answerAssistantQuery()` / `answerAdminAssistantQuery()` fonksiyonlarını çağırıyor. `LLMProvider.respond()`'ın döndürdüğü `intent` alanı ASLA doğrudan çalıştırılmıyor (bkz. `orchestrator.js`'teki yorum) — kritik bir yetkilendirme/iş kuralı motoru bu repo'da henüz yok (65 maddelik promptun 35-36. maddeleri, aşağıya bakınız).

## 4. Veri sahipliği — provider'dan bağımsız (65 maddelik promptun 3-5, 61-62. maddeleri)

VERALIQ Core (D1 veritabanı) tüm iş verisinin TEK sahibi: `companies`, `users`, `projects`, `units`, `leads`, `approval_requests`, `documents`, `audit_log`. Hiçbir avatar/LLM sağlayıcısı bu verinin bir kopyasını KENDİ tarafında tutmuyor — sağlayıcı yalnızca ses/görüntü/metin üretiyor, ID'ler (company_id, project_id, lead_id...) tamamen VERALIQ'a ait ve provider değişse bile aynı kalıyor.

**Gerçek, dürüst eksik**: şu an "conversation memory" (görüşme geçmişi/özeti) provider-bağımsız, yapılandırılmış bir tabloda TUTULMUYOR — yalnızca `audit_log` bazı ajan aksiyonlarını (`unit.presentation_lock` vb.) kaydediyor, gerçek konuşma transkriptleri D1'e yazılmıyor (tarayıcı belleğinde kalıyor — `orchestrator.js`'in `this.history` dizisi, sayfa kapanınca kaybolur). 65 maddelik promptun 38-39. maddeleri (Conversation Memory / Summary) bu nedenle **henüz yapılmadı** — bir sonraki migration'da `conversations` + `conversation_summaries` tabloları eklenmesi planlanıyor.

## 5. Test stratejisi

- `worker-portal/test/portal-worker.test.mjs` — Node'un deneysel `node:sqlite` modülü üzerinde GERÇEK SQL semantiğiyle çalışan bir D1+Durable-Object "shim". `node --experimental-sqlite portal-worker.test.mjs` ile çalıştırılır. 2026-08-27 itibarıyla **50/50 PASS**.
- Gerçek tarayıcı (Playwright/Chromium) testleri — sandbox ortamında `node_modules/playwright` içeren bir dizinden (`/opt/node-tools/`) çalıştırılıyor, ekran görüntüleriyle doğrulanıyor. Modül `<script type="module">` etiketlerinin gerçek davranışı için `file://` DEĞİL, yerel bir `python3 -m http.server` üzerinden test ediliyor (module script'ler `file://` altında CORS hatası veriyor — bu bir test kısıtı, üretimde sorun değil çünkü https üzerinden servis ediliyor).
- `npx wrangler dev` / gerçek Cloudflare ortamı bu sandbox'tan erişilemiyor (registry 403) — bu yüzden yukarıdaki shim var. Gerçek deploy sonrası manuel/entegrasyon testi öneriliyor.
