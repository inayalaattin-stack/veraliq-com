# VERALIQ — IMPLEMENTATION-BASELINE.md

**Amaç:** `VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md`'nin zorunlu kıldığı salt-okunur
taban doğrulaması. Bu doküman Faz 1 uygulamasından ÖNCE toplanan bulguları, Faz 1'in
kendisini ve test kanıtını içerir. Hiçbir üretim deploy'u, canlı migration'ı, secret
değişikliği veya ücretli provider çağrısı YAPILMADI.

## 1. Taban durumu (bu turun başlangıcı)

- **Branch:** `main`
- **HEAD (bu tur başlarken):** `99602a0152124c342668268f3627d9f65d598a18` (2026-09-08T23:03:06+03:00)
  — beklenen minimum taban commit `0a6001a864dbe25c33d23bc097fc1b10c7d5b3ae`'den 4 commit
  ileride. Aradaki commit'ler zaten uygulanmış ve pushlanmış durumda:
  - `55344ac` — avatar/TTS `mock`/`webspeech`'e düşürüldü (Spatius kredisi tükendiği için)
  - `11d5d48` — yazılı sohbet tamamen kaldırıldı (yalnızca sesli konuşma)
  - `0c6b072` — CLAUDE.md'ye iki kalıcı kural eklendi (cross-surface, voice-only)
  - `99602a0` — `enterprise-light.css`'teki sarkan metin-sohbet CSS seçicileri temizlendi
- **Working tree:** Bu turun kendi değişiklikleri dışında temiz. Önceden var olan,
  bu turla ilgisiz untracked dosyalar dokunulmadan bırakıldı: `Claude outputs/`,
  `PROJECT_HANDOFF.md`, `VERALIQ-Admin-Portal-Mobil-Inceleme-Raporu.md`,
  `VERALIQ-Source-Consent-Patch.zip`, `VERALIQ-Source-Consent-Patch/`.

**Not:** `VERALIQ-BAGIMSIZ-KAYNAK-DEGERLENDIRMESI.md`, `main @ 0a6001a`'ı incelemişti.
O tarihten bu yana `avatarProvider`/`ttsProvider` `mock`/`webspeech`'e düşürüldü ve
yazılı sohbet tamamen kaldırıldı (yukarıdaki 3 commit). Değerlendirmenin "aktif
yapılandırma: avatar: Spatius, TTS: Google Translate proxy" tespiti artık GÜNCEL
DEĞİL — bu, taban kaymasının somut bir örneği, geriye alınacak bir şey değil.

## 2. Korunması istenen 8 regresyon — kod içinde doğrulandı

Master promptun "taban bunlarla uyuşmuyorsa dur" maddesi gereği, her biri dosya:satır
düzeyinde grep ile teyit edildi (`worker-portal/portal-api-worker.js` aksi
belirtilmedikçe):

1. `VIEWER_SAFE_MUTATIONS` allowlist'i — satır 99; viewer allowlist kontrolü — satır 114.
2. `price_locked_after_contract` guard'ı — satır 800; `sold_price = ?` dondurma — satır 837.
3. `conflict_stale_status` (409 optimistic-concurrency) — satır 850.
4. Onay karar rotası (`/approvals/.../decide`) rol kısıtlaması
   `requireAuth(request, env, ['company_owner', 'company_manager'])` — satır 1183;
   `already_decided` çift-karar koruması — satır 1188 ve 1198.
5. `leavingPresentation` temizlik bayrağı — satır 805/828/852;
   `presentation_session_id = NULL` — satır 829 ve 913.
6. `portal.html:941` — Müşteriler ekranı `/api/customers`'ı gerçek bir `fetch` ile çağırıyor
   (sahte/mock veri değil).
7. `portal-i18n.js:48` — `"nav.item.payments":"Onay Talepleri"` anahtarı mevcut.
8. `agent-core/config.js` — mevcut durum `avatarProvider: 'mock'`, `ttsProvider: 'webspeech'`,
   `sttProvider: 'webspeech'`, `llmProvider: 'faq'` (bkz. yukarıdaki taban-kayması notu).

Sekizi de mevcut kodda doğrulandı — hiçbiri geri alınmadı, hiçbiri "körlemesine" eski
haline döndürülmedi.

## 3. Test kanıtı (taban)

```
cd worker-portal/test
node --experimental-sqlite portal-worker.test.mjs
```

**Sonuç: 127 PASS, 0 FAIL.** Ortam: Node v24.19.0, Windows, gerçek Cloudflare/D1
kimlik bilgisi kullanılmadı (yerel `node:sqlite` tabanlı D1-shim test harness).
Bu 127 test, worker-portal API'sinin RBAC/tenant-isolation/race-condition
davranışını kapsar — statik yayın sınırı, Spatius/TTS koruması veya frontend'i
KAPSAMAZ (bkz. `worker-portal/test/portal-worker.test.mjs`'nin kendi kapsam notu).

## 4. Faz 1 öncesi doğrulanan 3 somut bulgu

1. **Yayın sınırı hatası (P0):** `.github/workflows/deploy.yml`'de `deploy` işi
   Cloudflare Pages'e `directory: .` gönderiyordu — repo kökünün tamamı statik
   dosya olarak yayınlanıyordu. Bu; worker kaynak kodu, `schema.sql`/`seed.sql`,
   migration'lar, `worker-portal/test/`, iç dokümanlar (README/PRD/deploy notları) ve
   gerçek, çağrılabilir bir Spatius session/TTS test sayfası olan
   `spatius-test.html`'i de kapsıyordu.
2. **Kırık zamanlanmış yedekleme:** `backup` işi `backup-template.sh`'i
   `SOURCE_DIR: ./data` ile çalıştırıyordu; `./data` repoda hiçbir yerde yok.
   Gerçek, çalışan D1 yedekleme scripti `worker-portal/scripts/backup-d1.sh`
   (gerçek `wrangler d1 export`, opsiyonel AES-256-CBC+PBKDF2 şifreleme +
   ZORUNLU deşifre-doğrulama turu) — hiç bağlanmamıştı.
3. **Sahte güvenlik taraması:** `security-scan` işi `npm audit --audit-level=high || true`
   çalıştırıyordu. Repoda hiçbir yerde `package.json` yok — denetlenecek hiçbir
   bağımlılık ağacı olmadığından bu adım her zaman "yeşil" görünüyordu, aslında
   hiçbir şey taramıyordu. Ardından gelen OWASP Dependency-Check adımı da aynı
   nedenle anlamsızdı.

## 5. Faz 1 uygulaması (bu turda tamamlandı)

### 5.1 Yeni dosyalar

- **`scripts/build-public-dist.mjs`** — bağımsız (harici paket yok), açık allowlist
  ile `public-dist/` üretir: 7 genel sayfa, kök script/stil/sözlük dosyaları,
  `_headers`, gerçekten referans edilen 8 `assets/*` dosyası, ve tarayıcı tarafından
  dinamik `import()` ile yüklenen tüm `agent-core/` ağacı (yalnızca Node-only
  `agent-core/test/` hariç). `spatius-test.html`, worker kaynakları, `*.sql`,
  migration'lar, testler, iç dokümanlar ve `assets/brand/` (kullanılmayan pazarlama
  kiti) allowlist'e HİÇ girmiyor.
- **`scripts/verify-public-dist.mjs`** — üretilen `public-dist/`'i doğrular: 7 zorunlu
  sayfa var mı, `_headers` var mı, yasak dosya/dizin deseni (worker*, *.sql, docs/,
  scripts/, agent-core/test/, .git, node_modules, .env*, *.pem/*.key, vb.) yok mu,
  her sayfadaki yerel `src=`/`href=` referansları gerçekten çözülüyor mu.

### 5.2 Değiştirilen dosyalar

- **`.github/workflows/deploy.yml`**
  - `deploy` işi artık build → verify → deploy sırasıyla çalışıyor; Cloudflare Pages'e
    `directory: .` yerine `directory: public-dist` (yeni `wrangler pages deploy
    public-dist --project-name=veraliq-com` komutu) gönderiliyor.
  - Cloudflare'ın resmi dokümantasyonu doğrulandı (WebFetch ile
    developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/):
    `cloudflare/pages-action@v1` artık önerilmiyor; güncel resmi yöntem
    `cloudflare/wrangler-action@v3` + `command: pages deploy ...`. Workflow buna göre
    güncellendi.
  - `security-scan` işi artık gerçek kontroller çalıştırıyor: repodaki her `.js`/`.mjs`
    dosyasında `node --check` taraması, worker-portal'ın 127 testlik takımının
    yeniden çalıştırılması, ve yayın-sınırı allowlist'inin regresyon koruması olarak
    tekrar build+verify edilmesi. Anlamsız `npm audit`/OWASP adımları kaldırıldı.
  - `backup` işi artık kasıtlı olarak BAŞARISIZ oluyor, açık bir "kurulum gerekli"
    mesajıyla (`worker-portal/scripts/backup-d1.sh`'e işaret ediyor) — sessizce
    "başarılı" görünüp hiçbir şey yedeklemek yerine.
- **`.gitignore`** — `public-dist/` (üretilen çıktı, asla commit edilmemeli) eklendi.

### 5.3 Test kanıtı (Faz 1)

```
node scripts/build-public-dist.mjs
# [build-public-dist] OK — 21 files + 1 directory copied into .../public-dist

node scripts/verify-public-dist.mjs
# [verify-public-dist] OK — 50 files checked, 7 required pages present,
# 0 forbidden paths, all local references resolve.

# Yeni CI syntax-check adımının yerel simülasyonu (find + node --check):
# checked 64 files, fail=0

cd worker-portal/test && node --experimental-sqlite portal-worker.test.mjs
# 127 PASS, 0 FAIL (Faz 1 hiçbir worker-portal davranışına dokunmadı)
```

**Gerçek HTTP sunucusu testi** (dosya sistemi değil — sayfalar kardeş `assets/`/
`agent-core/` dosyalarına bağımlı olduğu için gerçek bir sunucu şart):
`.claude/launch.json`'a eklenen `veraliq-public-dist-preview` konfigürasyonu
(`npx http-server public-dist -p 8081`) üzerinden `index.html`, `admin.html`,
`portal.html`, `pricing.html` gerçek HTTP ile açıldı:

- Her sayfada konsol hatası **yok** (yalnızca `index.html` üzerinde kasıtlı olarak
  denenen 7 yasak yol — `spatius-test.html`, `worker-portal/schema.sql`,
  `worker-portal/portal-api-worker.js`, `docs/SECURITY.md`,
  `scripts/create-full-backup.sh`, `PRD.md`, `README.md` — beklendiği gibi 404
  döndü; bunlar test amaçlı denemelerdi, gerçek hata değil).
- Dinamik `import()` ile yüklenen her provider dosyası (`providers.js`,
  `mock-avatar-provider.js`, `webspeech-tts-provider.js`, `webspeech-stt-provider.js`,
  `faq-sales-brain-provider.js`, `admin-widget.js`, `portal-widget.js`) 200 döndü;
  `agent-core/test/conversation-logger.test.mjs` beklendiği gibi 404 döndü.
- `admin.html`, `portal.html`, `pricing.html` sayfa başlıkları doğru yüklendi,
  sıfır konsol hatası.

**Test edilemeyen / kapsam dışı bırakılan:** Gerçek Cloudflare Pages'e deploy
(kimlik bilgisi bu sandbox'ta yok — kural gereği zaten yapılmayacaktı),
`worker-portal/scripts/backup-d1.sh`'in gerçek `wrangler d1 export` ile uçtan uca
çalıştırılması (aynı nedenle).

## 6. Faz 1 dışında henüz DOKUNULMAYAN konular (bilerek)

Aşağıdakiler Faz 2+'nin kapsamı; bu turda bilerek değiştirilmedi:

- Spatius `/session`/`/tts` rate limiting, Turnstile, visitor token (Faz 2).
- `DATA-PROCESSING-MAP.md` ve yasal metin güncellemeleri (Faz 3).
- Demo talebi kalıcılığı ve admin ekranı (Faz 4).
- Auth/JWT/rate-limit sertleştirme (Faz 5).
- `CAPABILITY-LEDGER.md` ve pazarlama/gerçeklik paritesi (Faz 6).
- Fiyatlandırma merkezileştirme — %0,5 + KDV artık kesinleşmiş karar, ancak
  uygulaması sıradaki fazlarda (Faz 7, master promptun kendi sırasına göre).
- Admin/portal bilgi mimarisi (Faz 8), kurumsal görsel sistem (Faz 9),
  son-müşteri ajanı dikey dilimi (Faz 10).

## 7. Henüz kullanıcıya sorulmamış, ileride sürpriz olmaması için burada kayıtlı çelişki

Master promptun Faz 9 maddesi şöyle diyor: *"Metin fallback'ini kaldırma; bekleyen
eski patch'leri uygulama."* Ancak bu talimattan ÖNCE, ayrı ve açık bir kullanıcı
talebiyle, yazılı sohbet TAMAMEN kaldırıldı (commit `11d5d48`), kod-review ve
security-review'dan geçti, pushlandı, ve artık CLAUDE.md'de kalıcı bir kural
("Voice-only, no written chat") olarak kayıtlı. Bu iki talimat doğrudan çelişiyor.
Bu, sessizce hiçbir yöne çözülmedi — Faz 9'a gelindiğinde kullanıcıya ayrıca
sorulacak.
