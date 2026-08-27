# worker-portal — VERALIQ Şirket Portalı Backend (Cloudflare D1 + Worker)

Bu, `docs/MASTER_PLATFORM_ANALYSIS_AND_ROADMAP.md`'de tarif edilen
"gerçek backend" katmanıdır: `admin.html` ve `portal.html` artık
localStorage yerine bu API'yi çağırıyor. Cloudflare D1 (SQL veritabanı) +
bir Durable Object (Presentation Lock için) + tek bir Worker script'inden
oluşuyor. **Mevcut `worker/` (Anam) ve `worker-spatius/` (Spatius+TTS)
worker'larına dokunulmadı — bu tamamen ayrı, bağımsız bir deploy.**

Bu dosyadaki adımları yalnızca **siz, kendi Cloudflare hesabınızdan**
çalıştırabilirsiniz — ben (Claude) hesabınıza giremediğim ve bu ortamdan
`wrangler`/Cloudflare API'sine erişemediğim için (bu sandbox'ın ağ
izinleri npm registry ve Cloudflare API'sini engelliyor). Ama her adım
kopyala-yapıştır kadar basit. Toplam süre: ~10-15 dakika.

---

## 0. Neyin hazır, neyin sizin çalıştırmanız gerektiği

**Ben (Claude) bu oturumda şunları yazdım ve test ettim** (26/26 test
geçti — bkz. `test/portal-worker.test.mjs`, gerçek wrangler/miniflare
olmadan Node'un `node:sqlite` modülüyle kurulmuş bir test ortamında):
`schema.sql`, `auth.js`, `presentation-lock-do.js`, `portal-api-worker.js`,
`wrangler.toml`, `seed.sql`.

**Sizin çalıştırmanız gereken** (aşağıdaki adımlar): D1 veritabanını
gerçekten oluşturmak, worker'ı gerçekten deploy etmek, secret'ları
girmek. Bunlar Cloudflare hesap kimlik doğrulaması gerektirdiği için
benim tarafımdan yapılamaz.

---

## 1. Wrangler'ı kurun ve giriş yapın (bir kere)

```bash
npm install -g wrangler
wrangler login
```

Bu bir tarayıcı penceresi açar, Cloudflare hesabınızla giriş yapıp izin
verirsiniz.

## 2. D1 veritabanını oluşturun

```bash
cd worker-portal
wrangler d1 create veraliq-portal-db
```

Bu komut size şuna benzer bir çıktı verecek:

```
[[d1_databases]]
binding = "DB"
database_name = "veraliq-portal-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**`database_id` değerini kopyalayın** ve `wrangler.toml` dosyasındaki
`REPLACE_WITH_YOUR_D1_ID` yerine yapıştırın.

## 3. Şemayı ve test verisini yükleyin

```bash
wrangler d1 execute veraliq-portal-db --remote --file=schema.sql
wrangler d1 execute veraliq-portal-db --remote --file=seed.sql
```

`seed.sql` size iki test hesabı verir (şifreleri hash'lenmiş olarak
saklanır — düz metin hiçbir yerde tutulmaz):

| Rol | E-posta | Şifre |
|---|---|---|
| VERALIQ Admin | `admin@veraliq.com` | `Veraliq!Admin2026` |
| ABC İnşaat (örnek şirket) | `abcinsaat@veraliq.com` | `Abc12345!` |

**Canlıya tamamen geçmeden önce bu iki şifreyi MUTLAKA değiştirin** —
admin panelinden (`admin.html`) yeni bir şirket eklerken şifre kendiniz
belirlersiniz; VERALIQ admin şifresini değiştirmek için şimdilik
`wrangler d1 execute` ile elle bir `UPDATE users SET password_hash = ...`
çalıştırmanız gerekir (ileride admin.html'e "şifre değiştir" ekranı
eklenecek — bkz. roadmap dokümanı Faz 19).

## 4. Worker'ı deploy edin

```bash
wrangler deploy
```

Çıktıda size gerçek worker adresi gösterilecek, örn.:
`https://veraliq-portal-api.<hesap-adınız>.workers.dev`

**Bu adresi not edin** — `admin.html` ve `portal.html` içindeki
`API_BASE` sabiti şu anda `https://veraliq-portal-api.veraliq-com.workers.dev`
olarak varsayılmış (mevcut `worker-spatius` ile aynı hesap alt alan adı
örüntüsüne göre). Eğer gerçek adres farklıysa, bu iki dosyadaki
`API_BASE` satırını güncelleyip GitHub'a push edin.

## 5. Secret'ları girin

```bash
wrangler secret put JWT_SECRET
```
(İstendiğinde uzun, rastgele bir metin girin — örn. bir şifre
yöneticisinden 40+ karakterlik rastgele bir dize üretip yapıştırın. Bu,
oturum token'larını imzalamak için kullanılır; kimseyle paylaşmayın.)

```bash
wrangler secret put AGENT_SHARED_SECRET
```
(Bu, `agent-core`'daki AI agent'ın "Presentation Lock" uçlarını (birim
kilitleme) çağırabilmesi için kullanılan paylaşılan anahtar — yine uzun
rastgele bir metin. NOT: bu, geçici/basitleştirilmiş bir mekanizma —
kod içindeki yorumda da belirtildiği gibi, üretimde şirkete özel, düşük
yetkili bir "public embed key"e dönüştürülmesi planlanıyor, Faz 19b.)

## 6. Doğrulayın

```bash
curl -X POST https://<worker-adresiniz>/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@veraliq.com","password":"Veraliq!Admin2026"}'
```

Bir JWT token dönerse her şey doğru çalışıyor demektir. Ardından
`admin.html`'i tarayıcıda açıp giriş yapabilirsiniz.

---

## Testleri kendiniz de çalıştırmak isterseniz

```bash
cd worker-portal/test
node --experimental-sqlite portal-worker.test.mjs
```

Bu, gerçek `portal-api-worker.js` kaynak kodunu, Node'un deneysel
`node:sqlite` modülü üzerinde gerçek SQL semantiğiyle çalıştırıp 26
senaryoyu doğrular (multi-tenant izolasyon, state machine, presentation
lock race-condition koruması, yetkilendirme). Wrangler/Miniflare'ın
gerçek Cloudflare çalışma zamanı davranışının yerini TUTMAZ — yalnızca
uygulama mantığını doğrular. Gerçek deploy sonrası ayrıca canlı ortamda
manuel/entegrasyon testi yapmanız önerilir.

---

## Faz 6+ için not (Document/Contract/Payment/CRM)

Bu backend kasıtlı olarak Master Platform Prompt'un 84 maddesinin
TAMAMINI değil, Faz 3/5/9/10/14 çekirdeğini kapsıyor (Company/User/
Project/Unit envanteri + Presentation Lock + Lead + Approval + Audit
Log). Belge içerik depolama (R2), Contract, Payment, CRM/ERP entegrasyon
senkron logu gibi sonraki fazlar ayrı migration dosyalarıyla eklenecek —
detaylar için `docs/MASTER_PLATFORM_ANALYSIS_AND_ROADMAP.md` Bölüm 2.3'e
bakın. Bu fazların çoğu ayrıca sizin kendi hesabınızı/kararınızı
gerektiriyor (ör. bir e-imza sağlayıcısı, bir ödeme sağlayıcısı, bir
CRM API anahtarı) — bu yüzden şimdiden "sahte" bir versiyonu kurulmadı.
