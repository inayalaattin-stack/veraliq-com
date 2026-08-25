# Spatius.ai — "Clara" Avatar Araştırması (Faz 7 / Adım 1)

**Tarih:** 2026-08-25
**Durum:** Araştırma tamamlandı, **Clara onaylandı** (Spatius'un kendi kütüphanesindeki avatar — önce Halima seçilmişti, 2026-08-25'te Clara'ya değiştirildi), ücretsiz Spatius hesabı açıldı, entegrasyon iskeleti yazıldı — henüz production'a BAĞLANMADI. Hiçbir kart bilgisi girilmedi, hiçbir avatar ID production'a bağlanmadı. Brief'in 20. maddesindeki sıra takip edildi. Sıradaki adım için bkz. bölüm 7 — İmparator'dan 2 bilgi bekleniyor.

**GÜNCELLEME (2026-08-25):** Kullanıcı ("İmparator") netleştirdi: **VERALIQ şu an ticari bir faaliyet değil, bireysel/kişisel bir deneme aşamasında.** Bu, aşağıdaki "Kritik Bulgu"yu fiilen çözüyor — Spatius'un "Free plan ticari kullanıma kapalı" kısıtı, ticari faaliyet olmadığı sürece bir engel teşkil etmiyor. Aşağıdaki bulgu geçmiş karar süreci için kayıt amacıyla korunuyor; proje ticarileştiğinde (gerçek müşteri trafiği, gelir vb.) tekrar gözden geçirilmeli ve o noktada paid plana geçiş değerlendirilmeli.

---

## 🚨 KRİTİK BULGU (ÇÖZÜLDÜ — bkz. yukarıdaki güncelleme)

**Spatius'un ücretsiz planı ("Free", $0/ay) ticari kullanıma izin vermiyor.**

Fiyatlandırma sayfasından (spatius.ai/pricing) doğrudan alıntı:

> Free plan: 1.000 kredi (~100 dakika), Web/iOS/Android SDK erişimi, 2 eşzamanlı oturum — **"Commercial Usage" sütunu Free planda "—" (yok) olarak işaretli.** Ticari kullanım hakkı yalnızca Starter ($19/ay) ve üzeri planlarda başlıyor.

**Ne anlama geliyor:** VERALIQ canlı, ticari bir üründür (gayrimenkul satış danışmanlığı hizmeti veriyor, gelir amaçlı). Spatius'un kendi fiyatlandırma sayfası, ücretsiz planın bu şekilde bir kullanıma (yani tam olarak VERALIQ'in yapmak istediği şeye) izin vermediğini açıkça yazıyor. Bu, brief'teki "ASLA ücretli abonelik alma / kredi kartı ekleme" kuralıyla çelişmiyor — kod hiçbir ödeme tetiklemeyecek — ama **Spatius'un kendi kullanım şartlarını ihlal etme riski** var: teknik olarak "ücretsiz kotayı kullanmak" mümkün, ama sözleşme/ToS açısından "ücretsiz plan ticari sitede kullanılamaz" deniyor.

Bu, brief'in ruhuna (6. madde — "Ödeme Koruması", ödeme riskinden kaçınma; 18. madde — ücretli plana karşı koruma) çok yakın bir risk türü: para kaybı yok, ama VERALIQ'i bilmeden bir ToS ihlaline sokabilir.

**Seçenekler (sana bırakıyorum):**

1. **Spatius'u atla, sıradaki sağlayıcıya geç** (Simli) — brief'in 3. maddesindeki sıralama zaten esnek ("bu sıralama sabit olmak zorunda değil"), bir sonraki ücretsiz+ticari-uyumlu sağlayıcıyı dene.
2. **Spatius'u yalnızca iç/demo/geliştirme ortamında kullan**, canlı veraliq.com'a bağlama — free tier'ın "Web SDK" erişimini dev/test için kullanıp, gerçek kullanıcıya asla gösterme.
3. **Spatius ile iletişime geç** ("Bize Ulaşın" / Contact formu var) ve ücretsiz ama ticari-uyumlu bir istisna olup olmadığını sor — bazı sağlayıcılar küçük/erken-aşama şirketlere yazılı izin verebiliyor.
4. **Riski bilerek kabul et** ve free tier'ı yine de canlıda dene — bu durumda hesap Spatius tarafından askıya alınabilir (`ACCOUNT_SUSPENDED` — zaten router'ın otomatik fallback tetikleyicilerinden biri, brief madde 5), yani sistem otomatik olarak Simli'ye geçer. Teknik risk düşük, ama "bilerek ToS ihlali" sende kalır.

**Kendi önerim (karar sende):** Seçenek 1 — Spatius'u şimdilik atlayıp Simli ile devam etmek en temiz yol, çünkü brief zaten sıralamanın esnek olduğunu söylüyor ve amaç "ücretsiz + sorunsuz" bir provider zinciri kurmak. Ama Clara karakteri görsel olarak gerçekten uygun (aşağıda), o yüzden karar tamamen sana ait.

---

## 1. Spatius Playground — 11 Avatarın Tamamı

`spatius.ai/playground` genel/herkese açık kütüphanesinde tam 11 hazır avatar var (custom avatar yükleme de mevcut — "Kendin Yap": portre yükle, ~48 saat içinde teslim, muhtemelen ücretli):

| # | İsim | Görünüm | Kategori (site etiketi) |
|---|------|---------|--------------------------|
| 1 | **Clara** | Esmer, dalgalı 1950'ler tarzı saç, kırmızı ruj, kurumsal/vintage şık | Genel |
| 2 | Julian | Açık tenli, lacivert takım, ofis arka planı | Girişim |
| 3 | Kian | Doğu Asyalı, beyaz doktor önlüğü, klinik ortam | Sağlık |
| 4 | Aarav | Güney Asyalı, koyu takım elbise, ofis | Girişim |
| 5 | Halima | Bordo başörtülü, takım ceket, kurumsal | Girişim |
| 6 | Daiki | Doğu Asyalı, lacivert takım, kravat | Girişim |
| 7 | Elena | Açık tenli, yeşil boğazlı kazak, ev/ofis | Yoldaş |
| 8 | Amara | Siyahi, kısa saç, krem kazak | Yoldaş |
| 9 | Andy | Kıvırcık kahverengi saçlı, sıcak/samimi, köy/kasaba arka planı, günlük hırka | Yoldaş |
| 10 | Shu (adı Google Çeviri tarafından "Şu Adam" olarak yanlış çevrilmiş — kadın avatar) | Doğu Asyalı, uzun siyah saç, pembe/mor bluz, ev ortamı, günlük | Yoldaş |
| 11 | Emily | Sarışın, krem boğazlı kazak, sıcak ev ortamı, samimi | Yoldaş |

**Not:** "Şu Adam" gerçek bir isim değil — Google Çeviri'nin orijinal İngilizce ismi (muhtemelen "Shu") yanlış çevirmesinden kaynaklanıyor. Hesap açıldığında/İngilizce arayüzde gerçek isim teyit edilebilir.

**Clara zaten platformun kendi "Clara" adını taşıyan hazır avatarı** — VERALIQ'in ortak persona ismiyle bire bir örtüşüyor (tesadüf, ama pratik açıdan kafa karıştırmayacak bir eşleşme). Görsel olarak: profesyonel, kurumsal, "vintage glamour" tarzı — brief'in istediği "profesyonel / güven veren / kurumsal / sıcak" tanımına ton olarak uyuyor, ama daha "1950'ler Hollywood" esintili bir stil; modern/kurumsal bir gayrimenkul danışmanından biraz farklı, daha "editoryal" bir görünüm. Ekran görüntüleri aşağıda gönderildi.

## 2. Türkçe / TTS Desteği — ÇÖZÜLDÜ (docs.spatius.ai okunarak)

docs.spatius.ai'deki mimari sayfalarını (concepts/how-it-works, concepts/audio, sdk-reference/web-sdk/reference) okuyunca kritik bir mimari gerçek ortaya çıktı:

**Spatius, Anam'ın aksine kendi TTS/LLM/STT'sini ÇALIŞTIRMIYOR.** Spatius yalnızca bir "Motion Server" — kendisine gönderilen ham sesi (mono 16-bit PCM) alıp o sese göre dudak senkronizasyonlu 3D yüz animasyonu üreten saf bir render motoru. Kendi dokümantasyonlarından: *"Avatar speech audio is the audio the Avatar should speak, usually TTS output from a voice-agent pipeline"* — yani konuşma sesini BİZ üretiyoruz, Spatius sadece o sese göre dudak oynatıyor.

**Sonuç:** Clara'nın Türkçe konuşup konuşmaması Spatius'a değil, **bizim TTS sağlayıcımıza** bağlı. VERALIQ'in kendi `agent-core/tts-providers/` katmanı zaten Türkçe TTS üretiyor. Türkçe riski pratik olarak ortadan kalktı.

**Tek teknik kısıt:** Spatius'a ham ses göndermek gerektiği için, bu avatarla birlikte kullanılacak TTS sağlayıcısının GERÇEK ses verisi (bir `AudioBuffer`) üretmesi lazım. Bugün varsayılan olan `webspeech` (tarayıcı TTS'i) bunu vermiyor — tarayıcı sesi doğrudan hoparlöre çalıyor, bize ham veri sunmuyor. Bu yüzden Spatius'la `ttsProvider: 'chatterbox'` (repoda zaten mevcut, self-hosted) ya da ileride eklenecek buffer-döndüren ücretsiz bir bulut TTS gerekiyor.

## 3. Kredi Kartı / Hesap Açma

- Ücretsiz kayıt sürecinde kredi kartı istenip istenmediği **doğrulanamadı** (halka açık kaynaklarda net bilgi yok). Bu, hesap açma adımına gelindiğinde ilk ekranda görülüp orada durdurulabilir — brief'in 6. maddesi zaten net: kart isterse o an vazgeç, sıradaki sağlayıcıya geç.
- **Bu adıma henüz gelinmedi** — brief'in 20. madde sırasına göre önce senin onayın gerekiyor.

## 4. Otomatik Yükseltme / Ödeme Riski (Terms of Service)

Spatius ToS'undan kontrol edilen kısımlar:
- Otomatik ücretsizden-ücretliye yükseltme (`auto_upgrade`) ile ilgili **hiçbir madde bulunamadı** — sadece zaten ücretli bir aboneliğin kendi döngüsünde otomatik yenilendiği yazıyor ("Paid subscriptions automatically renew..."). Biz hiç kart girmeyeceğimiz için bu madde bizi hiç etkilemiyor.
- Bu açıdan brief'in 18. maddesindeki (`AUTO_UPGRADE=false` mantığı) riski **düşük** — Spatius'un kendisi de ücretsiz kullanıcıyı otomatik kart kesmeye zorlamıyor görünüyor. Asıl risk yukarıdaki ticari kullanım kısıtı.

## 5. KARAR (2026-08-25): Clara onaylandı (Halima'dan değiştirildi)

İmparator, brief madde 19 gereği avatarı tek tek inceledikten sonra önce **Halima**'yı onayladı; aynı gün, hesap açıldıktan sonra bu kararı **Clara**'ya (Spatius'un kendi kütüphanesindeki, vintage/kurumsal görünümlü, ismi zaten VERALIQ'in Clara'sıyla örtüşen avatar) çevirdi. Nihai/geçerli seçim: **Clara**.

**GÜNCELLEME (2026-08-25):** İmparator, VERALIQ'in şu an ticari gelir elde eden bir işletme olmadığını, sadece test/deneme yapıldığını, ücretli aboneliğe geçip geçmeme kararının ileride verileceğini tekrar teyit etti — bu, bölüm "Kritik Bulgu"daki ticari kullanım kısıtı riskini ortadan kaldırmaya devam ediyor.

**Ücretsiz Spatius hesabı 2026-08-25'te İmparator tarafından açıldı** ✅ (kredi kartı girilmedi).

## 6. Yazılan kod — İSKELET, henüz production'a BAĞLI DEĞİL

Onay üzerine brief madde 20.8'e ("Ben onayladıktan sonra entegrasyona geç") göre entegrasyon katmanının iskeleti yazıldı. Mevcut çalışan sistemin (index.html, script.js, i18n.js, `avatarProvider: 'anam'`) HİÇBİR SATIRI değişmedi — sadece ek dosyalar eklendi:

- `agent-core/avatar-pool/free-tier-guard.js` — brief madde 6+18'in kod karşılığı: `AUTO_UPGRADE=false`, `PAYMENTS_ENABLED=false`, `PAID_PROVIDERS_ALLOWED=false` sabitleri + `PROVIDER_STATUS` enum'u. İleride Simli/Beyond Presence/Tavus/D-ID/HeyGen eklenince hepsi bunu kullanacak — tek bir ödeme-koruma katmanı.
- `agent-core/avatar-providers/spatius-avatar-provider.js` — Spatius'un `AvatarProvider` arayüzüne uyan implementasyonu (docs.spatius.ai'nin Web SDK referansına göre yazıldı: `AvatarSDK`, `AvatarManager.load()`, `AvatarView`, Direct Mode `controller.send()` ile PCM16 ses akışı).
- `worker-spatius/` — Anam'ın CANLI worker'ına hiç dokunmadan, ayrı ve bağımsız bir Cloudflare Worker: Spatius API key'ini sunucu tarafında tutup tarayıcıya sadece kısa ömürlü bir session token veriyor (brief madde 10: "API key'leri frontend'e gönderme").
- `agent-core/config.js` — `avatarProvider` seçeneklerine `'spatius'` eklendi ama **varsayılan hâlâ `'anam'`** — hiçbir ziyaretçi bunu görmüyor, hiçbir şey canlıda değişmedi.

**Bu iskelet neden "bitmiş" değil:** Gerçek `@spatius/avatarkit` paketinin tam davranışını (DOM mount şekli, sample rate, kesin endpoint yolu) hesap olmadan %100 doğrulayamadım — kod, dokümantasyonun izin verdiği ölçüde en iyi tahminle yazıldı ve dosyaların başında hangi kısımların hesap açıldıktan sonra doğrulanması gerektiği açıkça yorumlandı.

## 7. Senden ihtiyacım olan 2 şey (hesap zaten açıldı ✅ — geri kalanı ben yapamıyorum, hesap/kimlik işlemleri bu oturumun güvenlik kuralları gereği bana yasak)

1. Spatius Studio'dan **App ID** ve **API Key**'i al, `worker-spatius/README.md`'deki adımlarla kendi Cloudflare hesabından bu worker'ı deploy et ve secret'ları gir (`wrangler secret put SPATIUS_APP_ID` / `SPATIUS_API_KEY`).
2. `app.spatius.ai/avatars/library` sayfasından **Clara**'nın avatar-id'sini kopyala.

Bu bilgileri (worker adresi + Clara'nın avatar-id'si) bana ilettiğinde, `spatius-avatar-provider.js`'i gerçek SDK ile karşılaştırıp doğrulayacağım, yerelde test edeceğim ve sonucu sana göstereceğim — **sen son kez onaylamadan** `config.js`'te varsayılanı `'spatius'` yapmayacağım (brief madde 17+19).
