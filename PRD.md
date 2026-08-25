# Veraliq — Gayrimenkul/İnşaat Sektörü için AI Satış Ajanı Platformu
## Ürün Gereksinim Dokümanı (PRD) — v0.1

---

## 1. Ürün Vizyonu

Veraliq, inşaat ve gayrimenkul şirketlerinin (öncelik: müteahhitler) kendi proje verileriyle eğitilmiş yapay zeka satış ajanları üzerinden, WhatsApp kanalında uçtan uca satış yürütmesini sağlayan çok kiracılı (multi-tenant) bir SaaS platformudur. Ajan; tanıtım, broşür paylaşımı, soru-cevap, takip (follow-up), özel gün hatırlatması ve — insan onayı kapısından geçerek — ön ödeme/kapora sürecini yönetir.

**Kapsam dışı (bu platformun yapmadığı):** Tapu devri, resmi satış sözleşmesinin hukuki geçerliliğinin sağlanması, gayrimenkul danışmanlığı lisansı gerektiren faaliyetler. Platform süreci hızlandırır ve otomatikleştirir; nihai hukuki adımlar insan/kurum onayı gerektirir.

### 1.1 İki Farklı Ajan — Önemli Ayrım

| | **Müşteri Ürünü** (satılan şey) | **Veraliq.com Ajanı** (kendi sitemiz) |
|---|---|---|
| Nerede çalışır | Müşteri şirketin **kendi web sitesi** + WhatsApp | Yalnızca veraliq.com |
| Kime konuşur | Şirketin son müşterileri (ev/daire almak isteyenler) | Bize müşteri olmak isteyen şirket sahipleri/yetkilileri |
| Veri kaynağı | O şirketin proje/fiyat/broşür verisi | Veraliq'in kendi iş modeli, fiyatlandırma, özellik bilgisi |
| Görevi | Satış yapmak, kapora almak, sözleşme başlatmak | Veraliq'i pazarlamak, iş modelini anlatmak, demo/lead toplamak |
| Dağıtım şekli | Tek satır `<script>` etiketiyle şirketin sitesine gömülür (bkz. Bölüm 7.1) | Sitemize doğrudan yerleşik, gömülmez |

Veraliq.com'daki ajan, aynı alttaki teknolojiyi kullanır (dogfooding) — ama farklı bir "tenant" ve farklı bir bilgi tabanıyla çalışır: kendi ürünümüz hakkında.

---

## 2. Kullanıcı Rolleri

| Rol | Kim | Erişim |
|---|---|---|
| Veraliq Admin | Veraliq operasyon ekibi | Tüm workspace'ler, faturalama, sistem sağlığı |
| Şirket Yöneticisi | Müteahhit/gayrimenkul şirketi sahibi/yöneticisi | Kendi workspace'i: proje verisi, ajan ayarları, raporlar |
| Şirket Yetkilisi (Satış Sorumlusu) | Şirketin satış ekibi | Onay bekleyen işlemler, canlı konuşma takibi, mobil bildirimler |
| Son Müşteri | Daire/proje almak isteyen kişi | Yalnızca WhatsApp üzerinden ajanla etkileşim |

---

## 3. Temel Kullanıcı Akışları

### 3.1 Müşteri — Ajan Etkileşimi (WhatsApp)
1. Müşteri, şirketin reklam/ilan/QR kodu üzerinden WhatsApp numarasına yazar.
2. Ajan karşılar, ilgi alanını (proje, daire tipi, bütçe) sorar.
3. İlgili broşür/görsel/fiyat listesini paylaşır (şirket portalından yüklenen gerçek veriden).
4. Soruları CRM/proje verisiyle yanıtlar; stok/fiyat bilgisini her zaman canlı veriden çeker.
5. Müşteri hafızası güncellenir: ilgi alanı, bütçe, iletişim tercihi, önemli tarihler.
6. Müşteri satın almaya karar verirse **Onay Akışı**'na (bkz. 3.2) geçilir.
7. Müşteri karar vermezse: takip programına (follow-up cadence) alınır — ajan belirli aralıklarla nazikçe hatırlatma mesajı gönderir (insan tarafından ayarlanabilir sıklıkta, spam olmayacak şekilde sınırlı).

### 3.2 Onay Akışı (Zorunlu İnsan Kontrol Noktası)
> Bu akış, kapora tahsilatı, sözleşme gönderimi, özel fiyat/indirim teklifi gibi **geri döndürülemez veya finansal sonucu olan** her adımda zorunludur — opsiyonel değildir.

1. Ajan, müşterinin niyetini (satın alma, kapora ödemeye hazır) tespit eder.
2. Sistem, ilgili Şirket Yetkilisi'ne mobil/portal bildirimi gönderir: müşteri özeti, talep edilen tutar, daire/proje bilgisi.
3. Yetkili tek tıkla onaylar veya reddeder/düzenler.
4. Onay sonrası sistem, **ham IBAN metni değil**, o işleme özel, tutarı sabit, süreli bir ödeme linki (ödeme sağlayıcı entegrasyonu üzerinden) üretir ve ajan bunu müşteriye iletir.
5. Ödeme tamamlanınca hem müşteri hem yetkili otomatik bilgilendirilir; CRM'de fırsat durumu "kapora alındı" olarak güncellenir.
6. Sözleşme taslağı e-imza servisi üzerinden müşteriye gönderilir; nihai sözleşme ve tapu süreci şirketin insan ekibi/hukuk süreciyle tamamlanır.

### 3.3 Şirket Yöneticisi — Kurulum
1. Portale giriş yapar, proje(ler)ini, daire tiplerini, fiyat listesini, broşür/görsellerini yükler.
2. Ajanın ton/dil tercihini (resmi/samimi), çalışma saatlerini, eskalasyon kurallarını tanımlar.
3. Kendi CRM/XRM sistemini bağlar (API anahtarı veya Veraliq'in dahili CRM'ini kullanır).
4. WhatsApp Business hesabını (Meta Business Manager üzerinden) platforma bağlar.
5. Satış ekibi üyelerini ve onay yetkisi olan kişileri tanımlar.

---

## 4. Sistem Mimarisi (Yüksek Seviye)

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  WhatsApp        │◄───►│   Mesajlaşma Katmanı   │◄───►│  Ajan Motoru     │
│  Business API    │     │   (Meta Cloud API)     │     │  (LLM + RAG)     │
│  (her şirket için │     └──────────────────────┘     │  workspace bazlı │
│   ayrı WABA)      │                                    │  izole veri      │
└─────────────────┘                                    └────────┬─────────┘
                                                                  │
        ┌─────────────────────────────────────────────────────┼─────────┐
        │                                                       │         │
┌───────▼────────┐   ┌──────────────────┐   ┌──────────────▼──┐  ┌──▼─────────┐
│  Şirket Verisi   │   │  Onay/Eskalasyon  │   │  CRM/XRM         │  │  Ödeme      │
│  (proje, fiyat,  │   │  Motoru           │   │  Entegrasyonu    │  │  Sağlayıcı  │
│   broşür, stok)  │   │  (push bildirim)  │   │  (kendi/3.parti) │  │  (link üret)│
└─────────────────┘   └──────────────────┘   └──────────────────┘  └────────────┘
        │                       │
┌───────▼────────┐   ┌─────────▼─────────┐
│  Admin Panel     │   │  Mobil Uygulama    │
│  (Veraliq)       │   │  (Şirket Yetkilisi)│
└─────────────────┘   └───────────────────┘
```

**Kritik tasarım ilkesi — tenant izolasyonu:** Her şirketin proje verisi, konuşma geçmişi ve müşteri verisi ayrı şemada/namespace'te tutulur. Ajan bir şirket için çalışırken yalnızca o şirketin verisine erişebilir — çapraz veri sızıntısı mimari olarak engellenir.

---

## 5. Veri Modeli (Ana Varlıklar)

| Varlık | Alanlar (özet) |
|---|---|
| `Company` (Workspace) | id, unvan, sektör, WABA numarası, plan/paket, durum |
| `Project` | company_id, proje adı, konum, teslim tarihi, açıklama |
| `Unit` (Daire/Bağımsız Bölüm) | project_id, tip (1+1, 2+1...), m², kat, fiyat, stok durumu |
| `Brochure/Asset` | project_id, dosya, tip (broşür/görsel/video) |
| `Customer` | company_id (tenant), ad, telefon, ilgi alanı, bütçe, özel tarihler, konuşma geçmişi referansı |
| `Conversation` | customer_id, mesaj geçmişi, durum (aktif/takipte/kapandı) |
| `ApprovalRequest` | conversation_id, tip (kapora/indirim/sözleşme), tutar, durum (bekliyor/onaylandı/reddedildi), onaylayan |
| `Payment` | approval_id, tutar, ödeme linki, durum, sağlayıcı işlem id |
| `Contract` | payment_id, taslak dosya, e-imza durumu |
| `User` (Şirket Yetkilisi) | company_id, rol, bildirim tercihi |

---

## 6. Ekran Listesi

### 6.1 Admin Panel (Veraliq operasyon ekibi)
- Şirket listesi, plan/faturalama durumu
- Sistem sağlığı, hata/uyarı logları
- Kullanım metrikleri (mesaj hacmi, dönüşüm oranı)

### 6.2 Şirket Portalı (Web)
- Proje/daire/fiyat/broşür yönetimi
- Ajan ayarları (ton, çalışma saati, eskalasyon kuralları)
- CRM/XRM bağlantı ayarları
- Konuşma geçmişi ve müşteri listesi (CRM görünümü)
- Onay bekleyen işlemler kuyruğu
- Raporlar (dönüşüm hunisi, ortalama yanıt süresi, kapanan satış)

### 6.3 Mobil Uygulama (Şirket Yetkilisi)
- Anlık onay bildirimleri (push)
- Tek ekrandan onayla/reddet/düzenle
- Aktif konuşmaları canlı izleme
- Günlük özet bildirimleri

---

## 6.4 Yönetici Asistanı (Portal + Mobil — Sesli/Görüntülü)

Şirket yöneticileri ve müdürleri için, satış ajanından **ayrı** bir modül: kendi şirket verisiyle "eğitilen", sesli soru-cevap yapabilen, raporları sesli sunabilen bir iç kullanım asistanı.

**Yetenekler:**
- Konuşarak soru sorma (ses tanıma) ve sesli yanıt alma
- Yöneticinin serbest metinle şirket bilgisi girerek asistanı "eğitmesi" (hedefler, süreçler, öncelikler)
- Haftalık/günlük raporları sesli özet olarak sunma ("bu hafta kaç kapora alındı", "hangi projede stok azaldı" vb.)
- Basit animasyonlu avatar ile görsel varlık (bkz. teknoloji notu)

**Teknoloji yaklaşımı (maliyet kademeleri):**

| Bileşen | Ücretsiz/açık seçenek (MVP) | Ücretli yükseltme (ileri faz) |
|---|---|---|
| Ses tanıma (STT) | Tarayıcı Web Speech API | Whisper API / bulut STT servisi (daha tutarlı çok dilli doğruluk) |
| Ses sentezi (TTS) | Tarayıcı Web Speech API (SpeechSynthesis) | ElevenLabs / bulut TTS (doğal insan sesi) |
| Görsel avatar | Canvas tabanlı basit 2D animasyon (ağız hareketi) | Fotogerçekçi video avatar (D-ID, HeyGen) |
| Dil modeli | Şirketin zaten kullandığı LLM API (satış ajanıyla ortak altyapı) | Aynı — bu bileşen zaten gerekli |

Bir çalışan prototip `exec-assistant/index.html` dosyasında teslim edilmiştir — yalnızca ücretsiz tarayıcı API'leri kullanır, ek servis/anahtar gerektirmez. Mobil uygulamada aynı mantık React Native'in `expo-speech` ve `@react-native-voice/voice` gibi ücretsiz paketleriyle karşılanabilir.

**Önemli sınır:** Tarayıcı tabanlı ücretsiz TTS/STT kalitesi, ücretli servislere göre daha düşüktür (robotik ses, sınırlı dil desteği). Kurumsal sunum kalitesinde bir deneyim isteniyorsa ileride ücretli servislere geçiş planlanmalıdır — bu, ürün olgunlaştıkça bütçe onayına bağlı bir karardır.

---

## 7. Entegrasyon Noktaları

| Entegrasyon | Yaklaşım |
|---|---|
| WhatsApp | Resmi Meta WhatsApp Business Platform (Cloud API) — her şirket için ayrı WABA. "WhatsApp Web" otomasyonu **kullanılmayacak** (ToS ihlali, numara banlanma riski). |
| Ödeme | Kurumsal ödeme sağlayıcı (iyzico/PayTR/Stripe benzeri) — tokenize edilmiş, süreli ödeme linki üretimi. Ham IBAN metni ajan tarafından otomatik gönderilmez. |
| CRM/XRM | (a) Veraliq dahili CRM'i (varsayılan) veya (b) müşterinin mevcut CRM'ine (Salesforce, HubSpot, Zoho, yerli çözümler) API/webhook entegrasyonu. |
| E-imza | Sözleşme taslağının imzalanması için 3. parti e-imza servisi. |
| Web widget | Müşteri şirket sitesine `<script src="cdn.veraliq.com/widget.js" data-company-id="...">` ile gömülen, o şirketin company-id'sine bağlı, izole veri erişimli chat widget'ı. Aynı motor WhatsApp katmanıyla veri ve müşteri hafızasını paylaşır — bir kanaldaki konuşma diğerinde devam edebilir. |

---

## 8. Güvenlik, Uyum ve Risk Kontrolleri

- **KVKK/GDPR**: Müşteri verisi (telefon, isim, bütçe, konuşma geçmişi) açık rıza ile toplanır; veri saklama süresi ve silme talebi süreci tanımlanır.
- **Finansal işlemler**: Kapora/ödeme adımı her zaman insan onayından geçer; ham banka bilgisi ajan tarafından serbestçe paylaşılmaz.
- **Tenant izolasyonu**: Şirketler arası veri sızıntısını önleyen mimari ayrım (bkz. Bölüm 4).
- **Ajan halüsinasyon kontrolü**: Fiyat/stok gibi kritik bilgiler LLM'in kendi hafızasından değil, canlı veritabanından çekilir.
- **Denetlenebilirlik**: Her onay, ödeme ve sözleşme adımı loglanır; kim ne zaman onayladı kaydı tutulur.
- **WhatsApp mesaj politikası**: Meta'nın "24 saat kuralı" ve şablon mesaj onay süreçlerine uyum (soğuk/pazarlama mesajlarında Meta'nın onayladığı şablonlar kullanılır).

---

## 9. Fazlama (Yol Haritası)

**Faz 1 — MVP**
- Tek şirket, tek proje ile pilot
- WhatsApp Cloud API entegrasyonu, temel ajan (soru-cevap + broşür gönderimi)
- Manuel onay akışı (kapora talebi → yetkiliye WhatsApp/e-posta bildirimi, henüz mobil uygulama yok)
- Basit portal: proje/fiyat yükleme

**Faz 2 — Otomasyon Derinleştirme**
- Onay motoru + push bildirim (mobil uygulama v1)
- Ödeme sağlayıcı entegrasyonu (link üretimi)
- Müşteri hafızası ve otomatik takip (follow-up) mesajları
- Özel gün hatırlatma modülü

**Faz 3 — Ölçekleme**
- Çoklu şirket, tam multi-tenant admin panel
- 3. parti CRM/XRM entegrasyonları
- E-imza entegrasyonu, sözleşme otomasyonu
- Raporlama ve analitik paneli

**Faz 4 — Genişleme**
- Ek dikeyler (araç galerileri, diğer yüksek bilet perakende)
- Çoklu dil desteği (uluslararası müşteri tabanı için)

---

## 10. Açık Sorular (Zamanla Netleştirilecek)

- Ödeme sağlayıcı tercihi (iyzico/PayTR/başka)?
- Dahili CRM mi geliştirilecek, yoksa yalnızca entegrasyon mu sunulacak?
- Fiyatlandırma modeli: aylık abonelik mi, işlem başına komisyon mu, ikisi birden mi?
- Mobil uygulama iOS/Android ikisi birden mi, hangi öncelikle?
- Pilot şirket sayısı ve zaman çizelgesi?
