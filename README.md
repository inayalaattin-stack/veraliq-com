# Veraliq — Kurumsal Web Sitesi

## Bu pakette ne var
- `index.html` — Ana site (hero, çözümler, global varlık, güvenlik, iletişim, AI asistan widget'ı)
- `script.js` — Etkileşim mantığı (menü, dil algılama, asistan arayüzü)
- `_headers` — Cloudflare Pages / Netlify için güvenlik başlıkları (CSP, HSTS, vb.)
- `backup-template.sh` — Gerçek 3-2-1 yedekleme şablonu (siz doldurup planlarsınız)
- `deploy.yml` — GitHub Actions: statik site dağıtımı + gece güvenlik taraması + 6 saatte bir yedekleme tetikleyici

## Kurulum adımları (siz veya ekibiniz yapmalı)
1. Bu dosyaları bir GitHub reposuna (`veraliq-com`) yükleyin.
2. `deploy.yml` dosyasını `.github/workflows/deploy.yml` yoluna taşıyın.
3. GitHub repo secrets'a ekleyin: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`, `S3_BUCKET`, `BACKUP_ENCRYPTION_KEY`.
4. Cloudflare Pages'te yeni proje oluşturup bu repoyu bağlayın, DNS kaydını `www.veraliq.com` için ekleyin.
5. Cloudflare panelinden WAF, Rate Limiting ve DDoS korumasını (Pro/Business/Enterprise plana göre) etkinleştirin — bunlar Cloudflare hesap ayarlarıdır, kodla otomatik açılmaz.
6. `index.html` içindeki `[Şehir, Ülke — düzenleyin]` ve MERSİS/ticaret sicil no gibi yer tutucuları gerçek bilgilerinizle değiştirin.

## Asistan artık gerçek bir yapay zekaya bağlı ✅

Önceki sürümde `script.js` sabit/demo yanıtlar veriyordu. Artık **gerçek, çalışan bir backend** var:

- `worker/worker.js` — Cloudflare Worker, Google Gemini'nin ücretsiz katmanına bağlanıyor
- `worker/README.md` — 5 dakikalık kurulum rehberi (ücretsiz API anahtarı alma dahil)
- `script.js` — artık `ASSISTANT_ENDPOINT`'e gerçek istek atıyor, sesli giriş/çıkış (Web Speech API) eklendi

**Yapmanız gereken tek şey**: `worker/README.md`'deki 5 adımı takip edip kendi ücretsiz API anahtarınızı almak ve worker'ı deploy etmek. Kod tarafında başka bir şey değişmiyor.

Backend henüz deploy edilmediyse, asistan sahte akıllılık göstermek yerine dürüst bir "bağlantı kurulamadı, info@veraliq.com'a yazın" mesajı verir — önceki turda eleştirdiğimiz "sahte demo" sorununu bilerek burada tekrar etmedik.

## Bilinçli olarak YAPILMAYAN şeyler ve nedenleri
| İstenen | Neden yapılmadı | Bunun yerine ne var |
|---|---|---|
| Kullanıcının insanla konuştuğunu sanmasını sağlayan video asistan | Yanıltıcı UX; güven inşa etmez, güveni riske atar | Kimliği açık, çok dilli metin/sesli asistan iskeleti |
| Kendi kendini sınırsızca güncelleyen "AI CEO" | Denetimsiz otomatik kod değişikliği güvenlik açığıdır | Gece taraması + PR tabanlı, insan onaylı güncelleme akışı |
| 20 dakikada tam otonom canlıya alma | Gerçek hesap erişimi ve DNS/SSL süreçleri dışarıdan tamamlanamaz | Adım adım, sizin çalıştıracağınız net bir kurulum rehberi |
| Sahte müşteri sayısı/istatistik | Yanlış pazarlama beyanı riski | Yer tutuculu, dürüst şablon alanları |

## İyileştirme önerileri (öncelik sırasına göre)
1. **Gerçek içerik**: Yer tutucu bölge/ofis bilgilerini ve MERSİS numarasını gerçek verilerle doldurun.
2. **KVKK/GDPR sayfaları**: `/privacy.html` ve `/kvkk.html` şu an linklenmiş ama oluşturulmadı — bir sonraki adımda yazabilirim.
3. **Analitik**: Gizlilik dostu bir analitik (Plausible, Fathom) ekleyin; Google Analytics kullanacaksanız çerez rızası akışını da ekleyin.
4. **Performans**: Görseller eklendiğinde WebP/AVIF ve `loading="lazy"` kullanın.
5. **Erişilebilirlik**: Renk kontrastları WCAG AA için kontrol edildi; formlar eklendiğinde etiketleme ve klavye odağını test edin.
6. **Asistan backend'i**: Yukarıdaki adımları takip ederek gerçek bir model bağlayın; ilk aşamada yalnızca SSS düzeyinde yanıtlarla sınırlı tutup zamanla genişletin.
