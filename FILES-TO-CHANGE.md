# VERALIQ — Değiştirilecek Dosyaların Listesi

Faz 1 için kesin liste (uygulandı — bkz. `IMPLEMENTATION-BASELINE.md`); Faz 2-10 için
ileriye dönük, fazın kendisi başladığında kesinleşecek tahmini liste.

## Faz 1 (TAMAMLANDI) — kesin liste

| Dosya | Durum |
|---|---|
| `scripts/build-public-dist.mjs` | YENİ |
| `scripts/verify-public-dist.mjs` | YENİ |
| `.github/workflows/deploy.yml` | DEĞİŞTİRİLDİ |
| `.gitignore` | DEĞİŞTİRİLDİ (`public-dist/` eklendi) |
| `.claude/launch.json` | DEĞİŞTİRİLDİ (yerel önizleme konfigürasyonu — `.gitignore`'da zaten `.claude/` altında, commit edilmiyor) |
| `IMPLEMENTATION-BASELINE.md` | YENİ |
| `IMPLEMENTATION-PLAN.md` | YENİ |
| `FILES-TO-CHANGE.md` | YENİ (bu dosya) |

## Faz 2 (tahmini) — Spatius session/TTS koruması

- `worker-spatius/spatius-worker.js` (veya eşdeğeri — gerçek dosya adı fazın
  başında doğrulanacak): rate limiting, Turnstile, visitor token, POST JSON `/tts`,
  hata maskeleme, `Cache-Control: no-store`.
- Yeni: `worker-spatius/test/spatius-worker.test.mjs` (worker-portal'daki
  `node:sqlite`-benzeri bağımsız test deseni).
- `spatius-test.html` — zaten public-dist allowlist'inde değil; worker tarafı
  sertleşince bu dosyanın repo içindeki durumu (silinsin mi/iç test aracı olarak
  mı kalsın) ayrıca değerlendirilecek.

## Faz 3 (tahmini) — Veri işleme haritası ve yasal metinler

- YENİ: `DATA-PROCESSING-MAP.md`
- YENİ: `LEGAL-INPUT-REQUIRED.md`
- `privacy.html`, `kvkk.html`, `terms.html`
- Consent dialog kodu (muhtemelen `agent-core/call-consent.js` / `call-consent.css`
  — yalnızca metin/açıklama içeriği, davranış mantığı değil)
- İlgili `i18n.js` anahtarları (8 dil)

## Faz 4 (tahmini) — Demo talebi akışı

- Yeni backend endpoint (`worker-portal/portal-api-worker.js` içinde yeni route
  veya ayrı bir worker — fazın başında karar verilecek)
- Yeni migration: `worker-portal/migrations/00X_demo_requests.sql` +
  `worker-portal/schema.sql` güncellemesi
- `index.html` (demo formu), `script.js`
- `admin.html`, `portal-i18n.js`/`i18n.js` (yeni "Demo Talepleri" ekranı)
- Yeni test dosyası (CSV/XSS/idempotency/duplicate-submit)

## Faz 5 (tahmini) — Auth/API sertleştirme

- `worker-portal/portal-api-worker.js` (login throttle, token_version, JWT claim
  doğrulama, body-size/content-type, 500 hata maskeleme, CORS, health endpoint)
- `worker-portal/schema.sql` + yeni migration (`token_version` kolonu vb.)
- `worker-portal/test/portal-worker.test.mjs` (yeni negatif/cross-tenant testler)

## Faz 6 (tahmini) — Capability ledger ve içerik paritesi

- YENİ: `CAPABILITY-LEDGER.md`
- `index.html`, `i18n.js` (8 dil), FAQ bot cevapları (`agent-core/llm-providers/faq-sales-brain-provider.js`),
  satış sunumu HTML/PDF kaynağı, `portal.html`/`admin.html` (temsili metrik etiketleri)
- Yeni key-parity test scripti (8 dil site + TR/EN/RU portal)

## Faz 7 (tahmini) — Merkezi fiyatlandırma (karar: %0,5+KDV)

- YENİ: merkezi fiyat config dosyası (ör. `pricing-config.js`)
- `pricing.html`, `pricing.js`, `i18n.js` (8 dil), FAQ bot, satış sunumu HTML/PDF,
  maliyet hesaplayıcısı (varsa), meta/structured-data etiketleri
- `BUSINESS-DECISIONS-REQUIRED.md` (prim doğuran satış tanımı kararı)
- Yeni parite testi (oran/format regresyon koruması)

## Faz 8 (tahmini) — Admin/portal bilgi mimarisi

- `admin.html`, `portal.html` (nav yeniden yapılanması)
- `portal-i18n.js`, `i18n.js` (yeni nav etiketleri)

## Faz 9 (tahmini) — Kurumsal görsel sistem

- `assets/enterprise-light.css` (veya yeni bir tema dosyası)
- `index.html`, `admin.html`, `portal.html`, `pricing.html` (yapısal/erişilebilirlik
  düzeltmeleri gerektiği kadarıyla)
- `agent-core/call-consent.css`

## Faz 10 (tahmini) — Son-müşteri ajanı dikey dilimi

- Yeni feature-flag mekanizması (`agent-core/config.js` içine veya ayrı bir
  `feature-flags.js`)
- Yeni backend endpoint'leri (tenant resolution, visitor session, published-field
  sorguları, lead oluşturma)
- Yeni migration(lar)
- Yeni test dosyası (tenant-negatif, rate-limit, audit)

## Nihai teslimat (tüm fazlar sonrası)

- YENİ (repo DIŞINDA): `VERALIQ-UYGULAMA-SONUC/00-EXECUTIVE-SUMMARY.md` … `11-LEGAL-INPUT-REQUIRED.md`
