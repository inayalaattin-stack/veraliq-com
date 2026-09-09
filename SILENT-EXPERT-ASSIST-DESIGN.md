# Silent Expert Assist — Teknik Tasarım

**Durum: TASARIM AŞAMASI.** Bu belge kod DEĞİLDİR — henüz hiçbir migration
yazılmadı, hiçbir route uygulanmadı, hiçbir DO deploy edilmedi. Kullanıcının
kendi talimatı gereği ("Kullanıcı onayı olmadan migration, production
deploy veya canlı bildirim gönderme"), bu belge onaylanmadan uygulamaya
GEÇİLMEYECEK.

**Önceki iş bağlantısı:** Bu özellik daha önce hiç uygulanmadı (bkz. bu
oturumdaki önceki inceleme). Yeniden kullanılan tek gerçek altyapı:
`approval_requests` tablosu/route'ları (atomik durum geçişi deseni) ve
`PresentationLock` Durable Object'i (tek örnek DO deseni, aşağıda
`ExpertQueryChannel` DO'su bunun üzerine inşa edilecek).

## 1. Amaç ve Kapsam

VERALIQ'in satış ajanı, doğrulanmış veriden cevap veremediği bir soruyla
karşılaştığında görüşmeyi kesmez, tahmin yürütmez ve "sizi insana
aktarıyorum" demez. Bunun yerine arka planda şirketin belirlediği en fazla
3 yetkiliye soruyu iletir, İLK geçerli cevabı atomik olarak kabul eder ve
canlı görüşmeye geri basar. Ana akış hâlâ otonom satış görüşmesidir — insan
yalnızca bir bilgi kaynağıdır, görüşmenin sahibi değildir.

## 2. Mimariye Entegrasyon Noktaları

| Mevcut bileşen | Nasıl kullanılıyor |
|---|---|
| `worker-portal/portal-api-worker.js` | Yeni route'lar buraya eklenir (`requireAuth`, `json`, `writeAudit` zaten export ediliyor — aynı desen) |
| `worker-portal/presentation-lock-do.js` | Yeni `ExpertQueryChannel` DO'sunun stil/kalıp referansı (aynı `constructor(state, env)`/`fetch(request)` biçimi — proje `extends DurableObject` modern kalıbına henüz geçmedi, tutarlılık için AYNI stil korunacak) |
| `approval_requests` tablosu | `expert_answers.category='commercial_approval'` olduğunda GERÇEK yetkilendirme hâlâ buradan geçer — expert cevabı yalnızca BİLGİ verir, onay execute etmez (bkz. §6) |
| `auth.js` `signJWT`/`verifyJWT` | Yeni WebSocket bağlantı token'ı (visitor-token/Faz 2,10 ile AYNI HMAC-JWT deseni) için yeniden kullanılır — yeni bir kriptografi şeması İCAT EDİLMEYECEK |
| `COMPANY_ROLE_BASE_TIER` (RBAC) | DEĞİŞMEZ. "Yetkili" (expert) statüsü bir ROL değil, `expert_group_members` üzerinden konu/proje bazlı bir ATAMA — mevcut rolün üstüne eklenir, tier haritasını bozmaz |
| `conversations`/`conversation_messages`/`conversation_summaries` | `expert_queries.conversation_id` bunlara referans verir — mevcut transkript/özet şemasına PARALEL, onu değiştirmez |

## 3. Veri Modeli (migration `0007_silent_expert_assist.sql`)

Aşağıdaki 6 tablo (+ Web Push için 1 ek tablo — spesifikasyonda ADI
GEÇMEYEN ama "PWA/Web Push" gereksinimini karşılamak için ZORUNLU olan
`push_subscriptions`, açıkça bir tasarım kararı olarak eklendi).

```sql
-- Bir şirketin, konu/proje bazlı yetkili gruplarını tanımlar.
CREATE TABLE IF NOT EXISTS expert_groups (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- örn. "Fiyat/İskonto Yetkilileri"
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expert_groups_company ON expert_groups(company_id);

-- Bir gruba en fazla 3 AKTİF üye — bu sınır DB'de değil, INSERT
-- route'unda (server-side COUNT kontrolü) uygulanır (SQLite'ta declarative
-- bir "max 3 satır" kısıtı yok).
CREATE TABLE IF NOT EXISTS expert_group_members (
  id                TEXT PRIMARY KEY,
  expert_group_id   TEXT NOT NULL REFERENCES expert_groups(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type        TEXT NOT NULL DEFAULT 'company',  -- 'company'|'project'|'topic'
  scope_project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  scope_topic       TEXT,               -- örn. 'pricing','payment_plan','legal','availability'
  approval_limit    REAL,               -- NULL = ticari onay VEREMEZ, yalnızca bilgi cevaplayabilir
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(expert_group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_expert_members_group ON expert_group_members(expert_group_id);
CREATE INDEX IF NOT EXISTS idx_expert_members_user ON expert_group_members(user_id);

-- Canlı görüşmeden doğan, yetkiliye iletilen soru.
CREATE TABLE IF NOT EXISTS expert_queries (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id           TEXT REFERENCES customers(id) ON DELETE SET NULL,
  project_id            TEXT REFERENCES projects(id) ON DELETE SET NULL,
  unit_id               TEXT REFERENCES units(id) ON DELETE SET NULL,
  expert_group_id       TEXT NOT NULL REFERENCES expert_groups(id),
  question_text         TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'info',  -- 'info' | 'commercial_approval'
  required_valid_answers INTEGER NOT NULL DEFAULT 1,
  sent_to               TEXT NOT NULL,   -- JSON dizi: sorgulanan user_id'ler (<=3)
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'answered'|'timeout'|'unresolved'|'cancelled'
  accepted_answer_id    TEXT,            -- yalnızca status='answered' iken dolu
  timeout_at            TEXT NOT NULL,   -- DO alarm'ının tetikleneceği zaman
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_expert_queries_company ON expert_queries(company_id);
CREATE INDEX IF NOT EXISTS idx_expert_queries_conversation ON expert_queries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_expert_queries_status ON expert_queries(status);

-- Bir yetkilinin verdiği cevap. Yarışan tüm cevaplar buraya yazılır,
-- yalnızca İLK geçerli olan `result='accepted'` alır.
CREATE TABLE IF NOT EXISTS expert_answers (
  id                TEXT PRIMARY KEY,
  expert_query_id   TEXT NOT NULL REFERENCES expert_queries(id) ON DELETE CASCADE,
  answered_by       TEXT NOT NULL REFERENCES users(id),
  answer_text       TEXT NOT NULL,
  attachment_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  result            TEXT NOT NULL,  -- 'accepted'|'already_answered'|'rejected_invalid'|'rejected_unauthorized'
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expert_answers_query ON expert_answers(expert_query_id);

-- Yapılandırılmış müşteri hafızası — ham transkript DEĞİL, özet birim.
CREATE TABLE IF NOT EXISTS conversation_memories (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id           TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  key_type              TEXT NOT NULL,  -- 'preference'|'interested_unit'|'interested_project'|
                                          -- 'objection'|'document_sent'|'open_question'|
                                          -- 'follow_up_preference'|'consent_snapshot'
  key                   TEXT NOT NULL,
  value                 TEXT NOT NULL,  -- JSON string
  source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at            TEXT            -- retention — NULL = varsayılan şirket politikasına tabi
);
CREATE INDEX IF NOT EXISTS idx_conv_memories_customer ON conversation_memories(company_id, customer_id);

-- Bir yetkili cevabından doğan, ŞİRKET-GENELİ bilgiye dönüşme ADAYI.
-- Otomatik yayınlanmaz — ayrı bir onay adımı gerekir (§7).
CREATE TABLE IF NOT EXISTS company_knowledge_candidates (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_expert_answer_id TEXT NOT NULL REFERENCES expert_answers(id),
  question_text         TEXT NOT NULL,
  answer_text           TEXT NOT NULL,
  scope                 TEXT NOT NULL DEFAULT 'this_conversation',
                        -- 'this_conversation'|'this_customer'|'this_unit'|'this_project'|'company_wide'
  source_reference       TEXT,
  valid_until            TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending_review', -- 'pending_review'|'published'|'rejected'|'expired'
  answered_by            TEXT NOT NULL REFERENCES users(id),
  approved_by            TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_candidates_company ON company_knowledge_candidates(company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_candidates_status ON company_knowledge_candidates(status);

-- YENİ (spesifikasyonda isim geçmiyor, Web Push için ZORUNLU): bir
-- kullanıcının tarayıcı/PWA push aboneliği.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh_key  TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, endpoint)
);
```

**Migration disiplini:** `ALTER TABLE ADD COLUMN` içermiyor (hepsi `CREATE
TABLE IF NOT EXISTS`) — Faz 4-10'daki gibi güvenle tekrar çalıştırılabilir.
`schema.sql`'e de fresh-install için aynı içerik eklenecek (mevcut disiplin).

## 4. Durum Makinesi (`expert_queries.status`)

```
PENDING ──(ilk geçerli cevap, atomik UPDATE)──> ANSWERED
PENDING ──(timeout_at'e ulaşıldı, DO alarm)───> TIMEOUT ──> UNRESOLVED
PENDING ──(görüşme müşteri tarafından kapandı)─> CANCELLED
```

- **PENDING → ANSWERED**: `UPDATE expert_queries SET status='answered',
  accepted_answer_id=?, resolved_at=datetime('now') WHERE id=? AND
  status='pending'` — `approval_requests`/`units` ile AYNI atomik desen
  (D1/SQLite tek yazıcı garantisi, ekstra kilit gerekmez). `result.meta.changes
  === 0` ise bu cevap KAYBETMİŞTİR → `expert_answers.result =
  'already_answered'`.
- **PENDING → TIMEOUT**: `ExpertQueryChannel` DO'sunun `alarm()` handler'ı
  `timeout_at` anında tetiklenir, hâlâ `pending` ise `UNRESOLVED`'e çeker.
  UNRESOLVED, tahmin YÜRÜTÜLMEDEN görüşmenin devam ettiği son durumdur.
- **ANSWERED/UNRESOLVED/CANCELLED terminal** — geri dönüş yok, yeni bir soru
  gerekiyorsa YENİ bir `expert_queries` satırı açılır.

## 5. Yetkili (Expert) Yanıt Yarışı — Atomiklik ve Yetki Kontrolü

`POST /api/expert-answers` akışı:

1. `requireAuth(request, env, ['company_owner','company_staff'])` — mevcut
   auth katmanı, yeni bir rol İCAT EDİLMEZ.
2. `expert_query`'yi oku; `status !== 'pending'` ise HEMEN `409
   already_resolved` (yarışı beklemeye bile gerek yok).
3. **Yetki kontrolü (server-side, ASLA istemciye güvenilmez):**
   `auth.sub`'ın `expert_group_members`'ta bu `expert_query.expert_group_id`
   için AKTİF bir üyeliği var mı VE (varsa) `scope_project_id`/`scope_topic`
   sorgunun bağlamıyla eşleşiyor mu? Eşleşmiyorsa `403
   unauthorized_expert` — cevap hiç `expert_answers`'a yazılmaz.
4. Atomik `UPDATE ... WHERE status='pending'` (yukarıdaki §4). Kazanırsa
   `expert_answers` satırı `result='accepted'`; kaybederse
   `result='already_answered'`.
5. Kazanan cevap `writeAudit()` ile loglanır, `ExpertQueryChannel`
   DO'sunun `pushAnswer()` RPC'si çağrılır (§6).
6. **Ticari onay ayrımı:** `category === 'commercial_approval'` ise, bu
   route SADECE bilgiyi kaydeder — GERÇEK yetkilendirme hâlâ mevcut
   `POST /api/approvals/:id/decide`'tan geçer. O route'a TEK ekleme:
   karar veren kullanıcının `expert_group_members.approval_limit`'i
   (varsa) `approval_requests.amount`'tan küçükse `403
   approval_limit_exceeded` — bugün var olmayan bu kontrol YENİ eklenir.

## 6. Canlı Görüşmeye Geri Basma — `ExpertQueryChannel` Durable Object

`PresentationLock` ile AYNI stil (`constructor(state, env)` / `fetch`), ama
`unit_id` değil `conversation_id` ile `idFromName()`'lenir — koordinasyon
atomu bir konuşma oturumudur.

- Widget, rıza sonrası (Faz 2/10 visitor-token deseniyle AYNI ilke) kısa
  ömürlü bir "conversation-participant" JWT'si alır (`role:
  'conversation_participant', conversation_id, company_id`).
- Widget bu token'la `wss://.../ws/conversation/:id`'ye bağlanır; worker
  `Upgrade` header'ını görünce token'ı `verifyJWT` ile doğrular, DO'ya
  `idFromName(conversation_id)` ile yönlendirir, DO
  `state.acceptWebSocket(ws)` (Hibernation API — bağlantı boşta beklerken
  DO'yu uyandırmaz, maliyet/kapasite açısından doğru seçim) ile bağlantıyı
  kabul eder.
- `POST /api/expert-answers` kazanan cevabı, ilgili DO stub'ına `fetch('
  /push', {method:'POST', body: {expert_query_id, answer_text}})` ile
  iletir; DO, hibernasyondaki soket(ler)e `ws.send(JSON.stringify({type:
  'expert_answer', ...}))` yapar.
- **Bağlantı garantisi YOK varsayımı:** Widget WS kapalıyken cevap gelirse
  DO onu sessizce düşürmez — `state.storage.put('pending_push', ...)`
  ile saklar, widget yeniden bağlandığında (`onopen`) DO bekleyen push'ları
  hemen gönderir. Ayrıca widget, DO bağlantısı hiç kurulamazsa 5 sn'de bir
  `GET /api/expert-queries/:id` ile POLL'a düşer (WS tek yol değil, yedek
  var).

## 7. Kurumsal Bilgiye Dönüşüm (`company_knowledge_candidates`)

Varsayılan `scope='this_conversation'` — bir yetkili cevabı OTOMATİK olarak
şirket-geneli bilgi OLMAZ. `company_wide` yayın, ayrı bir
`POST /api/knowledge-candidates/:id/publish` çağrısı gerektirir, yalnızca
`company_owner`/`company_manager` yapabilir (`approved_by` dolar).
`valid_until` geçmiş bir `company_knowledge_candidates` satırı, agent'ın
gelecekteki sorularda kaynak olarak KULLANAMAYACAĞI şekilde sorgudan
(`WHERE status='published' AND (valid_until IS NULL OR valid_until >
datetime('now'))`) filtrelenir.

## 8. Hafıza Politikası (`conversation_memories`)

- **Tenant izolasyonu:** HER sorgu `WHERE company_id = ? AND customer_id =
  ?` — `customers` tablosundaki mevcut `company_id` FK zincirine AYNI
  şekilde güvenilir, yeni bir izolasyon mekanizması İCAT EDİLMEZ.
- **Yapılandırılmış özet, ham geçmiş DEĞİL:** Agent'a her turda TÜM
  `conversation_messages` verilmez — yalnızca o müşterinin AKTİF
  `conversation_memories` satırları (key_type'a göre gruplu) + varsa en son
  `conversation_summaries` satırı. Bu, `conversation_summaries` deseninin
  DOĞAL bir uzantısıdır.
- **Hassas veri hariç tutma:** Kimlik no, kart/IBAN, sağlık bilgisi gibi
  alanlar `key_type` enum'unda YOK — agent'ın "beyni" (Zero Trust AI ilkesi,
  CLAUDE.md) zaten SQL üretmediği için rastgele bir alanı hafızaya
  YAZAMAZ, yalnızca sabit `key_type` listesindeki türler yazılabilir.
- **Devre dışı bırakma:** `customers.consent_status = 'declined'` ise
  `conversation_memories` için hem YENİ YAZMA hem OKUMA engellenir (route
  seviyesinde bir guard — `resolveCustomerMemory()` benzeri tek bir
  fonksiyon, tüm okuma/yazma yollarının ZORUNLU geçtiği tek nokta).
- **Retention/silme:** `expires_at` alanı var ama VARSAYILAN saklama süresi
  bir ÜRÜN SAHİBİ KARARIDIR (bkz. `LEGAL-INPUT-REQUIRED.md` madde 2 — AYNI
  açık karar buraya da uygulanıyor). Karar gelene kadar `expires_at = NULL`
  bırakılacak (süresiz DEĞİL, yalnızca "henüz belirlenmedi" — bir cron/
  scheduled Worker ile silme işi ayrı bir turun konusu).

## 9. Bildirimler

- **Portal notification center** (yeni, `portal.html`'e eklenir): zil
  ikonu + sayaç, `GET /api/notifications` (mevcut kullanıcının
  `expert_group_members` üyeliklerinden `pending` `expert_queries`'i
  listeler), öncelik (kaç dakikadır bekliyor) + timeout geri sayımı
  gösterir. "Cevapla / Belge Ekle / Doğrulanamıyor" üç seçeneği.
- **PWA/Web Push:** `manifest.json` + minimal bir `service-worker.js`
  (yalnızca push-receive + notification-click, offline-cache YOK — kapsam
  dışı). Push payload'ı MİNİMUM kişisel veri taşır: `{title: "Yeni bir
  soru var", query_id}` — müşteri adı/telefonu/soru metni kilit ekranında
  GÖRÜNMEZ, yalnızca uygulama açılıp kimlik doğrulandığında yüklenir.
- **Ücretli SMS/WhatsApp:** VARSAYILAN OLARAK KAPALI (spesifikasyonun kendi
  talimatı) — şirket başına opt-in bir ayar, bu turun kapsamı DIŞINDA.

## 10. İnsana Aktarım Kuralları (davranış katmanı, agent-core)

Yeni bir LLM brain fonksiyonu DEĞİL — mevcut deterministik brain'lerin
(companyAssistant / tenant companyPublicAssistant) karar ağacına yeni bir
dal: "bilmiyorum" durumunda önce `expert_queries` oluştur, insana aktarma
CTA'sı GÖSTERME. Yalnızca şu 5 durumdan biri GERÇEKLEŞMİŞSE aktar: müşteri
AÇIKÇA insan istedi, ödeme güvenliği şüphesi, hukuki şikâyet, kişisel veri
talebi, güvenlik acili. Bu 5 durum sabit bir liste — LLM'in kendi takdirine
BIRAKILMAZ (Zero Trust AI ilkesiyle tutarlı).

## 11. Tehdit Modeli

| Tehdit | Önlem |
|---|---|
| İki yetkili aynı anda cevaplar, ikisi de "kabul edildi" görür | Atomik `UPDATE ... WHERE status='pending'` (§4) — DB seviyesinde tek kazanan garantisi |
| Yetkisiz bir kullanıcı, üyesi olmadığı bir expert_group'a cevap yazmaya çalışır | Server-side üyelik+scope kontrolü (§5 adım 3), ASLA istemci beyanına güvenilmez |
| Bir yetkilinin scope'u proje/konu ile sınırlıyken başka bir projenin sorusuna cevap vermesi | `scope_project_id`/`scope_topic` sorgunun bağlamıyla eşleşmezse `403` |
| Bilgi cevabının ticari onaya (ör. iskonto) otomatik dönüşmesi | §6 madde 6 — kategori ayrımı, gerçek yetkilendirme HÂLÂ `approval_requests`'ten geçer |
| `approval_limit`'i aşan bir "yetkili" ticari onay vermeye çalışır | `POST /api/approvals/:id/decide`'a eklenecek limit kontrolü |
| WebSocket bağlantısına conversation_id tahmin/brute-force edilerek başka bir görüşmenin trafiği dinlenir | Bağlantı, `verifyJWT` ile doğrulanan ve `conversation_id`'yi claim olarak taşıyan kısa ömürlü token gerektirir — token'sız/yanlış token'lı Upgrade isteği reddedilir |
| Push bildirimi kilit ekranında müşteri PII'sini sızdırır | Payload'da yalnızca query_id, gerçek içerik kimlik doğrulamalı fetch sonrası |
| Bir yetkilinin cevabı, müşterinin rızası olmadan company_wide bilgiye/hafızaya sızar | Varsayılan scope `this_conversation`; company_wide yalnızca AYRI bir yetkili onayıyla |
| Müşteri "hafızamı kullanma" derse eski veriler hâlâ kullanılır | `consent_status='declined'` tüm okuma/yazma yollarının ZORUNLU geçtiği tek guard fonksiyonunda kontrol edilir |
| DO alarm hiç tetiklenmez, soru sonsuza kadar "pending" kalır | `setAlarm()` DO constructor'ında/`lock` oluşturulduğunda HER ZAMAN set edilir (PresentationLock'un TTL deseniyle aynı disiplin) |

## 12. Test Planı (kullanıcının kendi listesine birebir karşılık)

1. Üç yetkilinin eşzamanlı cevap yarışı → yalnızca 1 `accepted`, 2
   `already_answered`.
2. Yalnızca ilk geçerli cevabın kabulü (ikinci cevap DAHA ERKEN gönderilse
   bile DB'ye ULAŞMA sırası belirler, gönderim sırası değil).
3. Yanlış tenant'tan gelen cevabın reddi (başka company_id'nin
   expert_group_member'ı → 403).
4. Yetkisiz konu/proje cevabının reddi (scope eşleşmiyor → 403).
5. Timeout → `UNRESOLVED`, agent görüşmeyi tahminsiz sürdürür.
6. Canlı WebSocket cevabı — gerçek bir DO test harness'ıyla (bkz.
   `durable-objects` skill'inin test referansı) push doğrulanır.
7. Kapalı (ended_at dolu) bir görüşmeye geç gelen cevap → DO push'u
   sessizce no-op, `expert_answers` yine de kaydedilir (audit için).
8. Bilgi cevabı (`category='info'`) ile ticari onayın (`approval_requests`)
   ayrı akışlar olduğu — biri diğerini worker-portal 400'e düşürmeden
   tetiklemez.
9. `approval_limit` — düşük limitli bir yetkilinin yüksek tutarlı bir onayı
   REDDEDİLİR.
10. Müşteri hafızası tenant izolasyonu — Faz 4/6'daki mevcut "TENANT
    ISOLATION" test desenine BİREBİR benzer (bir şirketin
    `conversation_memories`'i başka şirketin sorgusunda GÖRÜNMEZ).
11. Company-wide bilgi yayınlama — yalnızca yetkili rol yapabiliyor,
    otomatik yayın YOK.
12. Süresi dolmuş (`valid_until` geçmiş) bilgi, agent'ın kaynak
    sorgusundan DÜŞÜYOR.
13. Silme/hafıza devre dışı bırakma — `consent_status='declined'` sonrası
    hem yeni yazma hem eski okuma engelleniyor.
14. Asistanın cevap gelmeden bilgi UYDURMAMASI — `status='pending'` veya
    `'unresolved'` iken agent'ın yanıtında GERÇEK bir sayı/tarih/fiyat
    iddiası OLMADIĞI, yalnızca "kontrol ediyorum" tarzı nötr bir ifade
    kullanıldığı (brain seviyesinde, LLM'e değil sabit şablona dayalı).

## 13. Rollout Planı

- Feature flag: `companies.silent_expert_assist_enabled` (Faz 10'daki
  `tenant_widget_enabled` ile AYNI desen — varsayılan 0/kapalı).
- İlk uygulama turu: yalnızca veri modeli + state machine + atomik cevap
  kabulü + audit (WebSocket/PWA/push OLMADAN, `GET /api/expert-queries/:id`
  polling ile) — riski küçük parçalara böler.
- İkinci tur: `ExpertQueryChannel` DO + WebSocket canlı push.
- Üçüncü tur: portal notification center UI + PWA/Web Push.
- Her tur kendi migration + test + review döngüsünden geçer (Faz 1-10'daki
  AYNI disiplin — tek dev commit'te hepsini birden YAZILMAYACAK).

## 14. Bu belgeyle YAPILMAYAN (açık sınır)

Migration dosyası (`0007_...sql`) HENÜZ YAZILMADI. Hiçbir route kodu
yazılmadı. `ExpertQueryChannel` DO'su yazılmadı. `wrangler.toml`'a hiçbir
binding eklenmedi. Hiçbir test yazılmadı. Bunların HEPSİ, bu tasarımın
kullanıcı tarafından onaylanmasından SONRAKİ bir adım.
