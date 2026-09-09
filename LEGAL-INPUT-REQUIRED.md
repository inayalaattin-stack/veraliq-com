# VERALIQ — LEGAL-INPUT-REQUIRED.md

Faz 3. Bu belge, `privacy.html`/`kvkk.html`/`terms.html`'in yayına hazır olması
için gerçek şirket bilgisi veya profesyonel hukuki karar gerektiren, Claude'un
UYDURAMAYACAĞI/karar VEREMEYECEĞİ maddeleri listeler. Hiçbiri bu turda dolduruldu
— hepsi mevcut `[düzenleyin]` placeholder'ları olarak bırakıldı.

## 1. Şirket kimlik bilgileri (blocker — kod/metin hazır, veri eksik)

- **Şirket unvanı** — `privacy.html` §1, `kvkk.html` §1.
- **MERSİS / Ticaret Sicil No** — `privacy.html` §1, `kvkk.html` §1.
- **Açık tebligat adresi** (yalnızca "Antalya, Türkiye" değil, tam adres) —
  `kvkk.html` §8 (başvuru yöntemi için KVKK m. 11 gereği gerekli).
- **Veri sorumlusu temsilcisi** (varsa) — `kvkk.html` §1'e eklenmesi gerekebilir.

## 2. Saklama/silme politikası — karar gerekiyor

`DATA-PROCESSING-MAP.md` §6'da tespit edildi: bugün hiçbir tabloda (audit_log,
conversations, customers, leads) otomatik bir TTL/arşivleme/anonimleştirme
mekanizması YOK. Karar gereken sorular:

1. Portal'daki şirket-müşteri konuşma kayıtları ne kadar süre saklanacak?
2. `audit_log`'daki IP/User-Agent alanları için bir saklama süresi belirlenecek mi?
3. Bir veri sahibi silme talebinde bulunursa (KVKK m. 7 / GDPR "right to erasure"),
   gerçek bir teknik silme akışı (hangi tablolardan, nasıl) nasıl işleyecek?

Bu üçü cevaplanmadan `privacy.html`/`kvkk.html`'e "hazır silme süreci" gibi somut
bir teknik vaat EKLENMEMELİDİR — bu turda eklenmedi, yalnızca KVKK'nın kendi genel
ilkesi (mevzuatın öngördüğü süre) tekrar edildi.

## 3. Üçüncü taraf veri işleme sözleşmeleri (DPA) — hukuki risk, karar gerekiyor

- **Spatius** — bir Veri İşleme Sözleşmesi (DPA)/Ek Sözleşme imzalandı mı? Avatar
  render için ses verisi (agent'ın sesi) bu sağlayıcıya gidiyor.
- **Google Translate TTS** (dokümante edilmemiş endpoint) — bu bir RESMİ Google
  hizmeti değil; resmi bir DPA/ticari kullanım izni YOK (bkz.
  `google-translate-tts-provider.js` başlığı, zaten kod içinde açıkça
  belirtiliyor). Bu, salt teknik değil, GERÇEK bir hukuki risktir: ticari bir
  ürünün, üçüncü tarafın kendi kullanım şartlarına aykırı olabilecek bir
  entegrasyona bağımlı olması. Bu turda bu ilişki değiştirilmedi (kapsam dışı) —
  ancak bir hukuk danışmanının bu riski değerlendirmesi önerilir.

## 4. Profesyonel hukuki inceleme (zaten belgelerde not edilmiş, tekrar vurgu)

`privacy.html` ve `kvkk.html`'nin kendi üst kısımlarındaki "Not" kutuları zaten
bu metinlerin taslak olduğunu ve yayına almadan önce bir hukuk danışmanı
onayı gerektirdiğini belirtiyor — bu turda bu uyarı KALDIRILMADI, korunuyor.
`DATA-PROCESSING-MAP.md` ile hizalanmış olmaları, hukuki yeterliliklerini
GARANTİ ETMEZ — yalnızca teknik doğruluk sağlar.
