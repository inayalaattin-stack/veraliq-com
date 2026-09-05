// agent-core/llm-providers/faq-sales-brain-provider.js
//
// FaqSalesBrainProvider — the DEFAULT "Sales Brain" today. Deterministic,
// keyword-matched answers about VERALIQ ITSELF (this is the veraliq.com
// agent talking to a prospective client company, not a client's own
// customer-facing agent — see PRD.md §1.1 "İki Farklı Ajan" for that
// distinction). No API key, no external call, no inference cost, and —
// critically — no prompt-injection surface, since there is no LLM here to
// manipulate: every reply comes from this file's own knowledge base.
//
// This is intentionally NOT trying to be a full conversational LLM. It is
// the honest MVP tier described in spec section 30 (Mock/dev mode should
// let the whole pipeline — STT/LLM/TTS/avatar/state machine/barge-in — be
// exercised end-to-end without paid infrastructure). Swap in
// openai-provider.js or anthropic-provider.js (add your own API key) for a
// genuinely open-ended conversational agent once you're ready to pay for
// one — see agent-core/config.js.
//
// SECURITY: this provider NEVER returns a non-null `intent` — it has no
// mechanism for taking any action, by design. It only ever produces
// {replyText, emotion, intent: null}.

import { LLMProvider } from '../providers.js';
import { classifyCustomerText } from '../emotion-engine.js';

// Knowledge entries: each has keyword triggers (checked against the lowercased
// customer message) and TR/EN answers. Other UI languages fall back to EN —
// see file header for why this isn't attempted in all 8 site languages yet.
//
// tr/en are ARRAYS of equivalent phrasings, not single strings. When the same
// topic is asked more than once in a conversation (visitors re-asking, or
// re-confirming), respond() rotates through these instead of repeating the
// exact same sentence — this is what was reported as the agent feeling
// "beyinsiz gibi tekrarlıyor" (mindlessly repeating itself). The underlying
// facts never change, only the wording — this stays 100% deterministic data,
// not LLM generation (see file header SECURITY note).
const KB = [
  {
    id: 'what_is_veraliq',
    keywords: ['veraliq nedir', 'ne yapıyorsunuz', 'ürününüz', 'what is veraliq', 'what do you do', 'product'],
    tr: [
      'VERALIQ, inşaat ve gayrimenkul şirketlerinin kendi web sitesine gömülen, şirketin gerçek proje/fiyat/stok verisiyle çalışan bir yapay zekâ satış asistanı platformu. Amaç, ziyaretçiyle daha ilk saniyede canlı bir görüşme deneyimi başlatmak.',
      'Kısaca: şirketinizin sitesine yerleşen, gerçek proje/fiyat/stok verinizle konuşan bir yapay zekâ satış görevlisi. Ziyaretçi siteye girer girmez canlı bir temsilciyle konuşuyormuş gibi hisseder.',
      'VERALIQ bir yazılım değil, sitenizde 7/24 çalışan dijital bir satış temsilcisi — verileriniz üzerinden gerçek zamanlı, canlı görüntülü/yazılı olarak ziyaretçilerle konuşur.',
    ],
    en: [
      'VERALIQ is an AI sales-agent platform that embeds directly into a construction/real-estate company\'s own website, working from that company\'s real project, price and stock data — so visitors get a live conversation experience from the moment they land.',
      'In short: a digital sales rep embedded on your site that talks from your real project, price, and stock data — visitors feel like they\'re talking to a live person the moment they arrive.',
      'Think of VERALIQ as a 24/7 digital sales colleague living on your website, having real-time video/text conversations grounded in your actual data.',
    ],
    emotion: 'professional',
  },
  {
    id: 'how_it_works',
    keywords: ['nasıl çalışıyor', 'nasıl entegre', 'crm bağlan', 'stok senkron', 'how does it work', 'integration', 'sync'],
    tr: [
      'Sitenize tek satır kodla eklenir, sizin CRM/stok sisteminizle entegre olur ve fiyat/stok bilgisini her zaman canlı veriden çeker — asla uydurmaz. İsterseniz tam ekran proje sunumu da yapabilir.',
      'Kurulum tek satır kod: CRM/stok sisteminize bağlanır, tüm fiyat ve stok cevaplarını her zaman canlı veriden verir — hiçbir zaman tahmin yürütmez. Talep halinde tam ekran proje sunumuna da geçebilir.',
      'Entegrasyon basit — tek script etiketi. Arkasında sizin gerçek CRM/stok verinize bağlı çalışır, böylece söylediği her fiyat/stok bilgisi güncel ve doğrudur.',
    ],
    en: [
      'It embeds with a single script tag, integrates with your CRM/stock system, and always pulls live price/stock data rather than guessing. It can also give a full-screen project presentation on request.',
      'Setup is a single script tag. It connects to your CRM/stock system so every price and availability answer comes from live data, never a guess. It can also switch into a full-screen project walkthrough on request.',
      'Integration is lightweight — one line of code — and it stays wired to your actual CRM/stock data, so nothing it says is ever fabricated.',
    ],
    emotion: 'professional',
  },
  {
    id: 'pricing',
    keywords: ['fiyat', 'ücret', 'ne kadar', 'paket', 'price', 'cost', 'pricing', 'how much'],
    tr: [
      'Fiyatlandırma, şirketinizin proje sayısına ve kullanım hacmine göre değişiyor — size özel bir teklif için kısa bir demo görüşmesi ayarlayalım mı?',
      'Paketler proje sayınıza ve kullanım hacminize göre şekilleniyor, tek bir sabit fiyat yok — isterseniz demo görüşmesinde size özel bir teklif çıkaralım.',
      'Bu, şirketinize göre değişen bir soru aslında — proje sayınızı ve hacminizi öğrendikten sonra net bir rakam verebiliriz. Kısa bir demo ayarlayalım mı?',
    ],
    en: [
      'Pricing depends on your project count and usage volume — would you like to set up a short demo call so we can put together a tailored quote?',
      'There\'s no one-size-fits-all number — packages scale with your project count and usage. A short demo call would let us give you an exact quote.',
      'That really depends on your scale, so let\'s figure it out together — shall we set up a quick demo to put together a tailored quote?',
    ],
    emotion: 'professional',
  },
  {
    id: 'demo',
    keywords: ['demo', 'görüşme', 'iletişim', 'başlamak istiyorum', 'contact', 'get started', 'talk to someone'],
    tr: [
      'Elbette — sayfanın altındaki "Demo Talebi" formunu doldurmanız yeterli, ekibimiz kısa süre içinde sizinle iletişime geçer.',
      'Hemen başlayabiliriz — aşağıdaki "Demo Talebi" formunu doldurun, ekibimiz en kısa sürede sizi arar.',
      'Tabii ki! Sayfanın altındaki demo formunu doldurmanız yeterli, gerisini ekibimiz halleder.',
    ],
    en: [
      'Of course — just fill in the "Request a Demo" form further down the page and our team will reach out shortly.',
      'Happy to help — fill out the "Request a Demo" form below and our team will contact you shortly.',
      'Sure thing! The demo form further down the page is the fastest way — our team picks it up right away.',
    ],
    emotion: 'happy',
  },
  {
    id: 'security',
    keywords: ['güvenlik', 'kvkk', 'gdpr', 'veri', 'security', 'privacy', 'data protection'],
    tr: [
      'Müşteri verileri KVKK/GDPR ilkelerine uygun, açık rızaya dayalı olarak işlenir; tenant izolasyonu sayesinde bir şirketin verisi bir başkasına asla karışmaz. Detaylar için /kvkk.html ve /privacy.html sayfalarımıza bakabilirsiniz.',
      'Veri güvenliği konusunda KVKK/GDPR\'a tam uyumluyuz ve her şirketin verisi izole tutulur — birbirine asla karışmaz. Detaylar /kvkk.html ve /privacy.html sayfalarımızda.',
    ],
    en: [
      'Customer data is processed under KVKK/GDPR principles with explicit consent, and tenant isolation means one company\'s data never mixes with another\'s. See /kvkk.html and /privacy.html for details.',
      'We follow KVKK/GDPR with explicit consent, and strict tenant isolation keeps every company\'s data separate. Full details live at /kvkk.html and /privacy.html.',
    ],
    emotion: 'professional',
  },
  {
    id: 'whatsapp',
    keywords: ['whatsapp'],
    tr: [
      'WhatsApp, desteklediğimiz kanallardan sadece biri — asıl deneyim şirketinizin kendi sitesinde canlı görüntülü görüşme. WhatsApp Business API üzerinden resmi ve izne dayalı şekilde çalışır.',
      'Evet, WhatsApp\'ı da destekliyoruz — resmi WhatsApp Business API üzerinden. Ama asıl deneyim sitenizdeki canlı görüntülü görüşme.',
    ],
    en: [
      'WhatsApp is just one of the channels we support — the primary experience is the live video conversation on your own site. It runs through the official WhatsApp Business API, consent-based.',
      'Yes, WhatsApp is supported via the official Business API — though the main experience is still the live video conversation on your own site.',
    ],
    emotion: 'professional',
  },
  {
    id: 'languages',
    keywords: ['dil', 'çok dilli', 'language', 'multilingual', 'languages'],
    tr: [
      'Sitemiz şu an 8 dilde: Türkçe, İngilizce, Arapça, Rusça, Almanca, Farsça, Fransızca, İspanyolca. Ajan da bu dillere göre uyarlanabilir.',
      '8 dil destekliyoruz — Türkçe, İngilizce, Arapça, Rusça, Almanca, Farsça, Fransızca ve İspanyolca — ajan da konuştuğunuz dile uyum sağlar.',
    ],
    en: [
      'The site currently supports 8 languages: Turkish, English, Arabic, Russian, German, Persian, French, Spanish — and the agent adapts to them too.',
      'We support 8 languages — Turkish, English, Arabic, Russian, German, Persian, French, Spanish — and the agent switches to match whichever one you speak.',
    ],
    emotion: 'professional',
  },
];

const FALLBACK = {
  tr: [
    'Bu konuda size en doğru bilgiyi ekibimizin vermesini isterim — dilerseniz aşağıdaki demo formundan bize ulaşabilirsiniz, ya da başka nasıl yardımcı olabilirim?',
    'Bu soruyu ekibimize iletmem daha doğru olur — aşağıdaki demo formunu doldurabilirsiniz. Bu arada başka bir konuda yardımcı olabilir miyim?',
    'Doğrusunu söylemek gerekirse bu, ekibimizin cevaplaması gereken bir soru — demo formundan ulaşabilirsiniz. Başka merak ettiğiniz bir şey var mı?',
  ],
  en: [
    'I\'d rather have our team give you the most accurate answer on that — feel free to reach us through the demo form below, or is there something else I can help with?',
    'That one\'s best answered by our team directly — you can reach them via the demo form below. Anything else I can help with in the meantime?',
    'Honestly, that\'s a question for our team to answer properly — the demo form below gets you to them. Is there something else on your mind?',
  ],
};

const GREETING = {
  tr: 'Merhaba, ben Elif Kaya. VERALIQ dijital satış asistanıyım. Size nasıl yardımcı olabilirim?',
  en: 'Hi, I\'m Elif Kaya, VERALIQ\'s digital sales assistant. How can I help you?',
};

function pickLangBucket(lang) {
  return (lang || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export class FaqSalesBrainProvider extends LLMProvider {
  constructor(...args) {
    super(...args);
    // Per-session usage counters so a repeated question (or a run of
    // unmatched questions) rotates through the phrasings above instead of
    // repeating the exact same sentence — see the KB/FALLBACK comment above.
    this._usageCount = Object.create(null);
    this._fallbackCount = 0;
  }

  /** Picks the next phrasing for `key` out of `variants`, cycling forward each call. */
  _nextVariant(key, variants) {
    const i = this._usageCount[key] || 0;
    this._usageCount[key] = i + 1;
    return variants[i % variants.length];
  }

  async respond(userText, context) {
    const bucket = pickLangBucket(context && context.lang);
    const lower = (userText || '').toLowerCase();

    const hit = KB.find((entry) => entry.keywords.some((k) => lower.includes(k)));
    let replyText;
    if (hit) {
      replyText = this._nextVariant(hit.id + ':' + bucket, hit[bucket]);
    } else {
      const i = this._fallbackCount++;
      replyText = FALLBACK[bucket][i % FALLBACK[bucket].length];
    }
    const emotion = hit ? hit.emotion : classifyCustomerText(userText);

    return { replyText, emotion, intent: null };
  }

  /** Short opening line — spec section 11: greeting must stay brief. */
  async greet(context) {
    const bucket = pickLangBucket(context && context.lang);
    const identity = context && context.agentIdentity;
    const displayName = (identity && identity.display_name) || 'Elif Kaya';
    const companyName = identity && identity.company_name;

    let replyText = GREETING[bucket];
    if (companyName && companyName !== 'VERALIQ') {
      replyText = bucket === 'tr'
        ? 'Merhaba, ben ' + displayName + '. ' + companyName + ' dijital satış asistanıyım. Size nasıl yardımcı olabilirim?'
        : 'Hi, I\'m ' + displayName + ', ' + companyName + '\'s digital sales assistant. How can I help you?';
    }
    return { replyText, emotion: 'greeting' };
  }
}
