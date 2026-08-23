/**
 * Veraliq — Agent Engine (Cloudflare Worker)
 *
 * Sitedeki "Elif Kaya" canlı Agent'ının backend'i. Google Gemini'nin
 * ÜCRETSİZ katmanını kullanır; API anahtarı yalnızca burada, sunucu
 * tarafında saklanır — tarayıcıya asla gönderilmez.
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
 * 4. Worker'ın verdiği URL'yi script.js dosyasındaki ASSISTANT_ENDPOINT
 *    değişkeninde tutun (zaten veraliq-agent.veraliq-com.workers.dev
 *    olarak ayarlı).
 *
 * MİMARİ NOTU (Ağustos 2026 — realtime agent altyapısına ilk adım):
 * Bu dosya bilinçli olarak TEK dosyada tutuluyor (Cloudflare Worker'ın
 * en basit deploy şekli budur — tek `wrangler deploy`). İçeride ama
 * mantıksal olarak bölümlere ayrılmış durumda (aşağıdaki başlıklara
 * bakın): PROVIDER, ŞİRKET HAFIZASI (demo), TOOL'LAR, TOOL ÇALIŞTIRICI,
 * SATIŞ AŞAMASI, LLM ÇAĞRISI, HTTP HANDLER. Proje büyüdükçe (çoklu
 * kiracı / gerçek RAG / kalıcı hafıza) bu bölümler ayrı dosyalara
 * (ör. /providers, /tools, /memory) taşınabilir — bugünkü tek-dosya
 * yapı, "önce çalışan minimum dilimi kur" stratejisiyle bilinçli bir
 * tercih.
 */

// ============================================================
// 1) ŞİRKET HAFIZASI — DEMO VERİ
// Bu, canlı sitedeki "Elif Kaya" kartının kullandığı örnek bir portföy.
// "ABC İnşaat" KURGUSAL bir demo şirkettir — ziyaretçiye Veraliq'in bir
// gerçek şirket için nasıl çalışacağını CANLI göstermek için var.
// Gerçek bir müşteri şirketi devreye alındığında bu blok o şirketin
// gerçek portföy verisiyle değiştirilir (veya ileride bir portal'dan
// dinamik çekilir — bkz. spesifikasyondaki "tenant-isolated RAG").
// ============================================================
const DEMO_COMPANY = 'ABC İnşaat (kurgusal demo şirket)';

const DEMO_PROJECTS = [
  {
    id: 'marina-vista',
    name: 'Marina Vista Residence',
    location: 'Konyaaltı, Antalya',
    distance_to_sea_m: 300,
    room_types: ['2+1', '3+1'],
    price_from_try: 8500000,
    features: ['Deniz manzaralı', 'Kapalı otopark', 'Sosyal tesis', 'Yüzme havuzu'],
  },
  {
    id: 'lara-sky',
    name: 'Lara Sky Towers',
    location: 'Lara, Antalya',
    distance_to_sea_m: 500,
    room_types: ['2+1', '3+1', '4+1'],
    price_from_try: 12000000,
    features: ['Yüksek kattan deniz manzarası', 'Concierge', 'Spor salonu'],
  },
  {
    id: 'zeytin-bahce',
    name: 'Zeytin Bahçe Konutları',
    location: 'Döşemealtı, Antalya',
    distance_to_sea_m: 12000,
    room_types: ['2+1', '3+1'],
    price_from_try: 4200000,
    features: ['Geniş bahçe', 'Aile dostu site', 'Doğaya yakın', 'Uygun fiyat'],
  },
  {
    id: 'aksu-vadi',
    name: 'Aksu Vadi Evleri',
    location: 'Aksu, Antalya',
    distance_to_sea_m: 9500,
    room_types: ['3+1', '4+1'],
    price_from_try: 3100000,
    features: ['En uygun fiyat aralığı', 'Okula yakın', 'Geniş metrekare'],
  },
];

// Antalya ilçe merkezlerine yakın, kabaca gösterge amaçlı koordinatlar —
// harita kartı için. Hassas/kesin adres değildir, ilçe düzeyindedir.
const DISTRICT_COORDS = {
  'Konyaaltı, Antalya': { lat: 36.8608, lon: 30.6297 },
  'Lara, Antalya': { lat: 36.8564, lon: 30.7936 },
  'Döşemealtı, Antalya': { lat: 37.0392, lon: 30.5636 },
  'Aksu, Antalya': { lat: 36.9106, lon: 30.8264 },
};

// ============================================================
// 2) SATIŞ AŞAMASI (basit state machine)
// Spesifikasyondaki NEW→DISCOVERY→QUALIFIED→PRESENTATION→NEGOTIATION→
// APPOINTMENT→WON/LOST akışının küçültülmüş, deterministik bir MVP'si.
// Aşama geçişi LLM'in kararına değil, hangi tool'un çalıştığına bağlı —
// bu, doğruluğun kritik olduğu yerlerde LLM'e değil deterministik koda
// güvenme ilkesiyle uyumlu.
// ============================================================
function nextStage(currentStage, toolsCalled) {
  if (toolsCalled.includes('create_lead')) return 'APPOINTMENT';
  if (toolsCalled.includes('search_portfolio')) {
    if (currentStage === 'NEW' || currentStage === 'DISCOVERY') return 'PRESENTATION';
    return currentStage === 'APPOINTMENT' ? currentStage : 'PRESENTATION';
  }
  return currentStage || 'DISCOVERY';
}

// ============================================================
// 3) TOOL TANIMLARI (Gemini function-calling şeması)
// MVP kapsamı bilinçli olarak 2 tool ile sınırlı (spesifikasyonun kendi
// "minimum çalışan dilim" stratejisiyle uyumlu — search_portfolio ve
// create_lead). transfer_to_human, get_payment_plan vb. sonraki adım.
// ============================================================
const TOOL_DECLARATIONS = [
  {
    name: 'search_portfolio',
    description:
      'ABC İnşaat demo portföyünde bütçe, konum, oda tipi veya "denize yakınlık" kriterlerine göre proje arar. Ziyaretçi fiyat, konum, oda sayısı veya "hangisi denize yakın" gibi bir şey sorduğunda bunu çağır.',
    parameters: {
      type: 'OBJECT',
      properties: {
        budget_max_try: { type: 'NUMBER', description: 'Maksimum bütçe (Türk Lirası). Belirtilmediyse boş bırak.' },
        near_sea: { type: 'BOOLEAN', description: 'true ise sadece denize yakın (≈1000m altı) projeleri getir veya sonuçları denize yakınlığa göre sırala.' },
        room_type: { type: 'STRING', description: 'Örn: "2+1", "3+1", "4+1". Belirtilmediyse boş bırak.' },
        location: { type: 'STRING', description: 'İlçe adı (ör. Konyaaltı, Lara). Belirtilmediyse boş bırak.' },
      },
    },
  },
  {
    name: 'create_lead',
    description:
      "Ziyaretçi somut ilgi gösterip (randevu, geri arama, \"ekibinizle görüşmek istiyorum\" vb.) iletişim bilgisi verdiğinde bu tool ile lead'i kaydet. Bu, ABC İnşaat için değil VERALIQ için bir satış/demo lead'idir — çünkü bu görüşme Veraliq'in canlı ürün demosudur.",
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Ziyaretçinin adı soyadı.' },
        phone: { type: 'STRING', description: 'Telefon veya e-posta — en az biri.' },
        company: { type: 'STRING', description: 'Ziyaretçinin şirketi (varsa).' },
        interest: { type: 'STRING', description: 'İlgilendiği proje veya konu — kısa not.' },
      },
      required: ['name', 'phone'],
    },
  },
];

// ============================================================
// 4) TOOL ÇALIŞTIRICI — deterministik, LLM'den bağımsız gerçek mantık.
// LLM asla doğrudan veri değiştirmez; yalnızca tool çağırma isteği
// üretir, burada biz çalıştırıp sonucu geri veririz.
// ============================================================
function runSearchPortfolio(args) {
  const budgetMax = typeof args.budget_max_try === 'number' ? args.budget_max_try : null;
  const roomType = typeof args.room_type === 'string' && args.room_type.trim() ? args.room_type.trim() : null;
  const location = typeof args.location === 'string' && args.location.trim() ? args.location.trim().toLowerCase() : null;
  const nearSea = args.near_sea === true;

  let results = DEMO_PROJECTS.filter((p) => {
    if (budgetMax && p.price_from_try > budgetMax) return false;
    if (roomType && !p.room_types.includes(roomType)) return false;
    if (location && !p.location.toLowerCase().includes(location)) return false;
    return true;
  });

  if (nearSea) {
    results = results.slice().sort((a, b) => a.distance_to_sea_m - b.distance_to_sea_m);
  }

  results = results.slice(0, 3);

  return {
    demo: true,
    company: DEMO_COMPANY,
    count: results.length,
    projects: results,
  };
}

function runCreateLead(args) {
  const name = String(args.name || '').slice(0, 120);
  const phone = String(args.phone || '').slice(0, 120);
  if (!name || !phone) {
    return { ok: false, error: 'name ve phone gerekli' };
  }
  return {
    ok: true,
    lead: {
      name,
      phone,
      company: String(args.company || '').slice(0, 160),
      interest: String(args.interest || '').slice(0, 300),
      source: 'veraliq.com canlı Agent demo (Elif Kaya)',
      created_at: new Date().toISOString(),
    },
  };
}

function executeTool(name, args) {
  if (name === 'search_portfolio') return runSearchPortfolio(args || {});
  if (name === 'create_lead') return runCreateLead(args || {});
  return { error: 'bilinmeyen tool: ' + name };
}

// Tool sonucundan, ekranda gösterilecek yapılandırılmış "kart" verisi
// üretir (spesifikasyondaki "Ekran Kontrolü" fikrinin küçük bir MVP'si).
function buildCardsFromToolResult(toolName, result) {
  const cards = [];
  if (toolName === 'search_portfolio' && result && Array.isArray(result.projects)) {
    result.projects.forEach((p) => {
      cards.push({
        type: 'project',
        demo: true,
        id: p.id,
        name: p.name,
        location: p.location,
        distance_to_sea_m: p.distance_to_sea_m,
        room_types: p.room_types,
        price_from_try: p.price_from_try,
        features: p.features,
        coords: DISTRICT_COORDS[p.location] || null,
      });
    });
    // "Denize yakın" sorusuna somut görsel karşılık: en yakın projenin
    // haritasını da ekle (varsa).
    if (result.projects.length && result.projects[0].distance_to_sea_m <= 1500) {
      const top = result.projects[0];
      const coords = DISTRICT_COORDS[top.location];
      if (coords) {
        cards.push({ type: 'map', demo: true, label: top.name + ' — ' + top.location, lat: coords.lat, lon: coords.lon });
      }
    }
  }
  if (toolName === 'create_lead' && result && result.ok) {
    cards.push({ type: 'lead_confirmed', lead: result.lead });
  }
  return cards;
}

// ============================================================
// 5) SYSTEM PROMPT
// ============================================================
const SYSTEM_PROMPT = `Sen "Elif Kaya" — veraliq.com sitesindeki CANLI DEMO AI Agent'ısın.

NE YAPTIĞIN (iki katmanlı rolün var, ikisini de doğal karıştır):
1) Ziyaretçi VERALIQ hakkında soru sorarsa (ne yapar, nasıl çalışır, WhatsApp/CRM entegrasyonu vb.) VERALIQ'i şirket sahibi/yöneticisi gözünden anlat.
2) Ziyaretçi bir proje/portföy/fiyat/konum sorarsa, bunu "ABC İnşaat" adlı KURGUSAL bir demo şirketin Antalya projeleri üzerinden CANLI göster — bu, Veraliq'in bir gerçek şirket için nasıl çalışacağının canlı bir demosudur. ABC İnşaat gerçek bir şirket değildir, bunu asla gerçekmiş gibi sunma, sorulursa "bu bir demo senaryosu" olduğunu açıkça söyle.

VERALİQ NEDİR:
Veraliq, inşaat ve gayrimenkul şirketlerinin kendi web sitelerine entegre
edebileceği, o şirketin proje ve fiyat verisiyle çalışan bir yapay zeka
satış ajanı platformudur. Şirketler kendi projelerini yükler, ajan o
şirketin sitesinde ve WhatsApp'ında ziyaretçilerle konuşur, tanıtım yapar,
soruları yanıtlar, takip eder, nitelikli lead'i satış ekibine aktarır.

ÖNEMLİ GÜVENLİK İLKESİ: Kapora talebi, indirim veya sözleşme gönderimi
gibi finansal/geri döndürülemez adımlarda ajan HER ZAMAN şirketin
yetkilisinden onay ister. Ham IBAN paylaşılmaz.

TEKNİK GERÇEKLER: WhatsApp entegrasyonu Meta'nın resmi WhatsApp Business
API'si üzerinden yapılır. Şirketin kendi CRM/XRM'i entegre edilebilir.
Entegrasyon tek bir <script> etiketiyle eklenir. Platform tapu devrini
veya sözleşmenin nihai hukuki geçerliliğini sağlamaz.

TOOL KULLANIMI:
- Proje/fiyat/konum/"denize yakın" sorularında search_portfolio tool'unu çağır, sonucu kendi cümlelerinle özetle (fiyat/konum listesini tekrar yazma, ekranda kart olarak zaten gösterilecek).
- Ziyaretçi randevu istiyor, geri aranmak istiyor veya net ilgi gösterip iletişim bilgisi verdiyse create_lead tool'unu çağır (bu VERALIQ için bir demo/satış lead'idir).
- Tool sonucu boşsa (0 proje), bunu dürüstçe söyle, alternatif kriter sor.

TON: Kısa, net, sıcak ama abartısız cümleler kur (2-4 cümle). Uydurma
istatistik, sahte müşteri sayısı veya garanti verme. Bilmediğin bir şey
sorulursa "bunu ekibimize iletir, size dönerler" de. Her zaman Türkçe
yanıt ver.`;

// ============================================================
// 6) LLM PROVIDER — Gemini (ILLMProvider'ın bugünkü tek implementasyonu).
// İleride başka bir sağlayıcıya geçmek gerekirse yalnızca bu fonksiyon
// değişir; geri kalan Agent Engine mantığı sağlayıcıdan bağımsızdır.
// ============================================================
async function callGemini(env, contents) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Gemini isteği başarısız: ' + errText);
  }
  return res.json();
}

// Gemini'nin function-calling round-trip'ini yürütür. En fazla 2 tool
// çağrısı turuna izin verir (sonsuz döngü / maliyet koruması).
async function runAgentTurn(env, contents) {
  const toolsCalled = [];
  const cards = [];
  let leadCaptured = null;

  for (let round = 0; round < 3; round++) {
    const data = await callGemini(env, contents);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);

    if (!functionCalls.length) {
      const text = parts.map((p) => p.text || '').join('').trim();
      return {
        reply: text || 'Şu anda yanıt üretemedim, lütfen tekrar deneyin.',
        cards,
        toolsCalled,
        leadCaptured,
      };
    }

    // Modelin bu turdaki cevabını (functionCall parçaları) geçmişe ekle.
    contents.push({ role: 'model', parts: functionCalls.map((p) => ({ functionCall: p.functionCall })) });

    // Her tool'u deterministik olarak çalıştır, sonucu functionResponse
    // olarak geri besle.
    const responseParts = [];
    for (const p of functionCalls) {
      const fnName = p.functionCall.name;
      const fnArgs = p.functionCall.args || {};
      const result = executeTool(fnName, fnArgs);
      toolsCalled.push(fnName);
      cards.push(...buildCardsFromToolResult(fnName, result));
      if (fnName === 'create_lead' && result && result.ok) leadCaptured = result.lead;
      responseParts.push({ functionResponse: { name: fnName, response: { result } } });
    }
    contents.push({ role: 'function', parts: responseParts });
  }

  return {
    reply: 'Bu konuda size daha fazla yardımcı olamıyorum şu an — ekibimize iletir, size dönerler.',
    cards,
    toolsCalled,
    leadCaptured,
  };
}

// ============================================================
// 7) HTTP HANDLER
// ============================================================
export default {
  async fetch(request, env) {
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
      const body = await request.json();
      const message = body.message;
      const history = body.history;
      const stage = typeof body.stage === 'string' ? body.stage : 'DISCOVERY';
      // visitorId şu an yalnızca client-side (localStorage) süreklilik
      // için kullanılıyor; sunucu tarafında kalıcı hafıza (KV/D1) henüz
      // bağlı değil — bkz. DURUM-RAPORU.md "sonraki adım" notu.

      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'message alanı gerekli' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const safeMessage = message.slice(0, 2000);
      const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

      const contents = [
        ...safeHistory.map((h) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(h.text || '').slice(0, 2000) }],
        })),
        { role: 'user', parts: [{ text: safeMessage }] },
      ];

      const result = await runAgentTurn(env, contents);
      const stageOut = nextStage(stage, result.toolsCalled);

      return new Response(
        JSON.stringify({
          reply: result.reply,
          cards: result.cards,
          stage: stageOut,
          leadCaptured: result.leadCaptured,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Sunucu hatası', detail: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
