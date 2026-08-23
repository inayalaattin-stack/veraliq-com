/**
 * Veraliq — Satış Ajanı Backend (Cloudflare Worker)
 *
 * Bu worker, sitenizdeki chat widget'ından gelen mesajları alır,
 * Google Gemini'nin ÜCRETSİZ katmanına iletir ve yanıtı geri döner.
 * API anahtarı yalnızca burada, sunucu tarafında saklanır — tarayıcıya
 * asla gönderilmez.
 *
 * KURULUM (5 dakika):
 * 1. https://aistudio.google.com/apikey adresinden ücretsiz bir Gemini
 *    API anahtarı alın (kredi kartı istemez).
 * 2. Bu projeyi Cloudflare hesabınızda bir Worker olarak oluşturun:
 *      npm install -g wrangler
 *      wrangler login
 *      wrangler deploy
 * 3. API anahtarını sır (secret) olarak tanımlayın:
 *      wrangler secret put GEMINI_API_KEY
 *    (İstendiğinde aldığınız anahtarı yapıştırın.)
 * 4. Worker'ın verdiği URL'yi (https://veraliq-agent.<hesabınız>.workers.dev)
 *    script.js dosyasındaki ASSISTANT_ENDPOINT değişkenine yazın.
 *
 * ÜCRETSİZ KATMAN SINIRLARI (Ağustos 2026 itibarıyla, değişebilir):
 * Gemini Flash ücretsiz katmanı dakika/gün başına istek sınırlıdır.
 * Küçük-orta trafik için yeterlidir. Trafiğiniz arttığında Google'ın
 * ücretli katmanına geçmeniz gerekebilir — o zaman bile kod değişmez,
 * yalnızca faturalama etkinleşir.
 */

// ---- Veraliq'in iş modeli bilgisi (PRD'den özetlenmiştir) ----
// Ajanın halüsinasyon görmemesi için tüm gerçek bilgi burada, promptta
// sabit tutulur. Fiyat/proje detayları değiştikçe burayı güncelleyin.
const SYSTEM_PROMPT = `Sen Veraliq'in web sitesindeki yapay zeka satış ajanısın.
Görevin: ziyaretçilere (çoğunlukla müteahhit/gayrimenkul şirketi sahipleri
veya yöneticileri) Veraliq'in ne olduğunu anlatmak, sorularını yanıtlamak
ve demo talebi/iletişim bilgisi almaya yönlendirmek.

VERALİQ NEDİR:
Veraliq, inşaat ve gayrimenkul şirketlerinin kendi web sitelerine entegre
edebileceği, o şirketin proje ve fiyat verisiyle eğitilen bir yapay zeka
satış ajanı platformudur. Şirketler kendi projelerini bir portale yükler,
ajan o şirketin sitesinde ve WhatsApp'ında ziyaretçilerle/müşterilerle
konuşur: tanıtım yapar, broşür gönderir, soruları yanıtlar, takip eder.

ÖNEMLİ GÜVENLİK İLKESİ (her zaman vurgula, soru gelirse detaylandır):
Kapora talebi, indirim veya sözleşme gönderimi gibi finansal/geri
döndürülemez adımlarda ajan HER ZAMAN şirketin yetkilisinden onay ister.
Ham IBAN paylaşılmaz; süreli, tutarı sabit bir ödeme linki kullanılır.

TEKNİK GERÇEKLER:
- WhatsApp entegrasyonu Meta'nın resmi WhatsApp Business API'si üzerinden
  yapılır (gayriresmi "WhatsApp Web botu" değil).
- Şirketin kendi CRM/XRM'i entegre edilebilir veya Veraliq'in dahili
  CRM'i kullanılabilir.
- Entegrasyon tek bir <script> etiketiyle şirketin sitesine eklenir.
- Platform tapu devrini veya sözleşmenin nihai hukuki geçerliliğini
  sağlamaz; satış öncesi ve ön ödeme sürecini hızlandırır.

HEDEF KİTLE: Öncelik müteahhitler ve gayrimenkul şirketleri.

TON: Kısa, net, iddialı ama abartısız cümleler kur. Uydurma istatistik,
sahte müşteri sayısı veya garanti verme. Fiyat sorulursa: "proje sayınıza
göre özelleştirilir, demo sırasında netleştiririz" de, uydurma rakam verme.
Bilmediğin bir şey sorulursa "bunu ekibimize iletir, size dönerler" de.
Her zaman Türkçe yanıt ver, kısa paragraflar kullan (2-4 cümle).`;

export default {
  async fetch(request, env) {
    // CORS: yalnızca kendi domain'inizden gelen isteklere izin verin.
    // "*" geliştirme için kolaydır ama üretimde kendi domain'inizle
    // değiştirin (ör. "https://www.veraliq.com").
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY tanımlı değil. `wrangler secret put GEMINI_API_KEY` çalıştırın.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const { message, history } = await request.json();

      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'message alanı gerekli' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Basit uzunluk sınırı — kötüye kullanım/maliyet koruması
      const safeMessage = message.slice(0, 2000);
      const safeHistory = Array.isArray(history) ? history.slice(-8) : [];

      const contents = [
        ...safeHistory.map((h) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(h.text || '').slice(0, 2000) }],
        })),
        { role: 'user', parts: [{ text: safeMessage }] },
      ];

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 300,
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return new Response(JSON.stringify({ error: 'Model isteği başarısız', detail: errText }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await geminiRes.json();
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Şu anda yanıt üretemedim, lütfen tekrar deneyin.';

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Sunucu hatası', detail: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
