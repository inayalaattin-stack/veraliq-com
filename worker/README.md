# Veraliq Satış Ajanı — Backend Kurulumu (Ücretsiz Katman)

Bu klasör, sitenizdeki chat widget'ını gerçek bir dil modeline (Google Gemini)
bağlayan Cloudflare Worker'ı içerir. Tamamı ücretsiz katmanlarla çalışacak
şekilde tasarlanmıştır.

## Neden bu seçimler?

- **Google Gemini Flash**: Ücretsiz API katmanı, kredi kartı istemeden
  kullanılabiliyor ve başlangıç trafiği için yeterli istek hakkı sunuyor.
- **Cloudflare Workers**: Günde 100.000 istek ücretsiz — zaten sitenizi
  Cloudflare Pages'te barındıracağınız için ek bir hesap açmıyorsunuz.

## Kurulum Adımları

### 1. Ücretsiz Gemini API anahtarı alın
1. https://aistudio.google.com/apikey adresine gidin.
2. Google hesabınızla giriş yapın.
3. "Create API key" ile ücretsiz bir anahtar oluşturun. Kredi kartı istemez.

### 2. Worker'ı deploy edin
```bash
npm install -g wrangler
cd worker
wrangler login
wrangler deploy
```
Bu komut size bir URL verecek: `https://veraliq-agent.<hesap-adınız>.workers.dev`

### 3. API anahtarını güvenli şekilde tanımlayın
```bash
wrangler secret put GEMINI_API_KEY
```
İstendiğinde 1. adımda aldığınız anahtarı yapıştırın. Bu anahtar asla
koda veya tarayıcıya yazılmaz — yalnızca Cloudflare'in şifreli secret
deposunda tutulur.

### 4. Site tarafını bağlayın
`script.js` dosyasını açın, şu satırı bulun:
```js
var ASSISTANT_ENDPOINT = 'https://veraliq-agent.YOUR-SUBDOMAIN.workers.dev';
```
`YOUR-SUBDOMAIN` kısmını 2. adımda aldığınız gerçek URL ile değiştirin.

### 5. Test edin
Siteyi açın, sağ alttaki asistana bir soru yazın (örn. "WhatsApp entegrasyonu nasıl çalışıyor?"). Artık kalıp cevap değil, gerçek bir dil modelinin ürettiği yanıtı alacaksınız.

## Trafiğiniz arttığında ne olur?

Ücretsiz katman sınırına yaklaşırsanız iki seçeneğiniz var:
1. Google AI Studio'da ücretli katmana geçmek (kullanım başına düşük maliyetli).
2. Cloudflare Workers Paid plana geçmek (günde 100.000'den fazla istek gerekiyorsa, $5/ay).

Her iki durumda da kod değişmez — yalnızca faturalama devreye girer. Bu iyi bir sorundur, çünkü yüksek trafik demektir.

## Maliyeti kontrol altında tutmak için yapılmış şeyler

- Mesaj uzunluğu 2000 karakterle sınırlı (kötüye kullanım koruması).
- Konuşma geçmişi yalnızca son 8 mesajla sınırlı (token maliyeti kontrolü).
- Yanıt uzunluğu 300 token ile sınırlı (`maxOutputTokens`).

Bu sınırları `worker.js` içinde ihtiyaca göre ayarlayabilirsiniz.
