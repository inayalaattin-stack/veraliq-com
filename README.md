# Veraliq — Kurumsal Web Sitesi + Digital Human Engine

## Bu pakette ne var
- `index.html`, `script.js`, `i18n.js` — Ana site (hero, çözümler, 8 dilli i18n, FAQ, demo formu)
- `privacy.html`, `kvkk.html`, `terms.html` — yasal sayfalar
- `_headers` — Cloudflare Pages güvenlik başlıkları (CSP, HSTS, vb.)
- `agent-core/` — **VERALIQ Digital Human Engine**: provider-agnostic canlı AI agent mimarisi (avatar/TTS/STT/LLM). Bkz. `docs/DIGITAL_HUMAN_ENGINE_REPORT.md`.
- `services/` — self-hosted STT/TTS/Avatar servisleri için Docker + kurulum rehberi (GPU makinenizde çalıştırılır). Bkz. `docs/SELF_HOSTED_DEPLOYMENT.md`.
- `worker/` — Cloudflare Worker; şu an yalnızca **opsiyonel/legacy** Anam.ai session-token proxy'si (varsayılan olarak kullanılmıyor)
- `docs/` — mimari rapor + self-host kurulum rehberi
- `backup-template.sh` — Gerçek 3-2-1 yedekleme şablonu (siz doldurup planlarsınız)

## Canlı AI Agent — mimari özeti

Site üzerindeki "Elif Kaya" agent'ı artık **VERALIQ Digital Human Engine**
üzerinden çalışıyor — Anam.ai'ye bağımlı değil. Varsayılan (bugün, production'da
aktif) yapılandırma:

| Katman | Varsayılan provider | Maliyet | Not |
|---|---|---|---|
| Avatar | `MockAvatarProvider` | $0, GPU gerekmez | Canvas tabanlı, emotion-reaktif idle avatar |
| TTS | `WebSpeechTTSProvider` | $0 | Tarayıcı native SpeechSynthesis |
| STT | `WebSpeechSTTProvider` | $0 | Tarayıcı native SpeechRecognition (Chrome/Edge/Safari; Firefox desteklemiyor) |
| LLM | `FaqSalesBrainProvider` | $0, anahtar gerekmez | Deterministik VERALIQ SSS motoru |

Hangi provider'ın kullanılacağı **tek bir dosyadan** değiştirilir:
`agent-core/config.js`. Kendi GPU sunucunuzu (self-hosted QuickTalk/MuseTalk
avatar, Chatterbox TTS, faster-whisper STT) devreye almak için
`docs/SELF_HOSTED_DEPLOYMENT.md`'yi izleyin — kod tarafı zaten hazır, sadece
config'de provider adını değiştirip `selfHostedBaseUrl`'ü sunucunuza
yönlendirmeniz yeterli.

Eski Anam.ai entegrasyonu **silinmedi**, `agent-core/avatar-providers/anam-avatar-provider.js`
içinde izole edildi ve config'de `avatarProvider: 'anam'` seçilmediği sürece
hiç yüklenmiyor (dynamic import). Detaylı bağımlılık haritası, lisans
araştırması ve GPU/maliyet analizi için: `docs/DIGITAL_HUMAN_ENGINE_REPORT.md`.

## Kurulum adımları (siz veya ekibiniz yapmalı)
1. Bu dosyaları bir GitHub reposuna (`veraliq-com`) yükleyin / mevcut repoya push edin.
2. Cloudflare Pages'te bu repoyu bağlayın (repo kökü = publish dizini, build adımı yok — saf statik dosyalar + ES modülleri).
3. Cloudflare panelinden WAF, Rate Limiting ve DDoS korumasını (Pro/Business/Enterprise plana göre) etkinleştirin — bunlar Cloudflare hesap ayarlarıdır, kodla otomatik açılmaz.
4. (Opsiyonel, yalnızca Anam'ı yeniden açmak isterseniz) `worker/README.md`'deki adımları izleyin.
5. (Opsiyonel, self-hosted GPU altyapısına geçmek için) `docs/SELF_HOSTED_DEPLOYMENT.md`'yi izleyin.

## Bilinçli olarak YAPILMAYAN şeyler ve nedenleri
| İstenen | Neden yapılmadı | Bunun yerine ne var |
|---|---|---|
| Tam CRM/ödeme/onay/sözleşme/WhatsApp backend'i | Bu, koddan sıfırdan bir SaaS platformu inşa etmek — ayrı bir mühendislik projesi | `docs/DIGITAL_HUMAN_ENGINE_REPORT.md` §0'da kapsam dışı bırakıldığı ve neden açıkça belirtildi |
| GPU'lu gerçek avatar'ın bu oturumda çalıştırılıp doğrulanması | Bu cloud ortamında GPU yok | Kod yazıldı, `docs/SELF_HOSTED_DEPLOYMENT.md` ile kendi GPU'nuzda doğrulanacak |
| Sahte müşteri sayısı/istatistik | Yanlış pazarlama beyanı riski | Yer tutuculu, dürüst şablon alanları |

## İyileştirme önerileri (öncelik sırasına göre)
1. **Self-host'a geçiş**: `docs/SELF_HOSTED_DEPLOYMENT.md`'yi GPU makinenizde uygulayıp `avatarProvider`/`ttsProvider`/`sttProvider`'ı gerçek self-hosted servislere çevirin.
2. **Gerçek LLM**: `agent-core/llm-providers/openai-provider.js` ya da `anthropic-provider.js`'i aktif etmeden önce, API anahtarını tutan küçük bir Cloudflare Worker (mevcut `worker/session-worker.js` deseni gibi) yazın — anahtar asla tarayıcıya konmamalı.
3. **CRM/ödeme/onay backend'i**: `docs/DIGITAL_HUMAN_ENGINE_REPORT.md`'nin "Bu turda yapılmayanlar" listesindeki katmanlar için ayrı bir çalışma planlayın.
4. **Analitik**: Gizlilik dostu bir analitik (Plausible, Fathom) ekleyin.
5. **Erişilebilirlik**: Renk kontrastları WCAG AA için kontrol edildi; yeni formlar eklendiğinde etiketleme ve klavye odağını test edin.
