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
const KB = [
  {
    id: 'what_is_veraliq',
    keywords: ['veraliq nedir', 'ne yapıyorsunuz', 'ürününüz', 'what is veraliq', 'what do you do', 'product'],
    tr: 'VERALIQ, inşaat ve gayrimenkul şirketlerinin kendi web sitesine gömülen, şirketin gerçek proje/fiyat/stok verisiyle çalışan bir yapay zekâ satış asistanı platformu. Amaç, ziyaretçiyle daha ilk saniyede canlı bir görüşme deneyimi başlatmak.',
    en: 'VERALIQ is an AI sales-agent platform that embeds directly into a construction/real-estate company\'s own website, working from that company\'s real project, price and stock data — so visitors get a live conversation experience from the moment they land.',
    emotion: 'professional',
  },
  {
    id: 'how_it_works',
    keywords: ['nasıl çalışıyor', 'nasıl entegre', 'crm bağlan', 'stok senkron', 'how does it work', 'integration', 'sync'],
    tr: 'Sitenize tek satır kodla eklenir, sizin CRM/stok sisteminizle entegre olur ve fiyat/stok bilgisini her zaman canlı veriden çeker — asla uydurmaz. İsterseniz tam ekran proje sunumu da yapabilir.',
    en: 'It embeds with a single script tag, integrates with your CRM/stock system, and always pulls live price/stock data rather than guessing. It can also give a full-screen project presentation on request.',
    emotion: 'professional',
  },
  {
    id: 'pricing',
    keywords: ['fiyat', 'ücret', 'ne kadar', 'paket', 'price', 'cost', 'pricing', 'how much'],
    tr: 'Fiyatlandırma, şirketinizin proje sayısına ve kullanım hacmine göre değişiyor — size özel bir teklif için kısa bir demo görüşmesi ayarlayalım mı?',
    en: 'Pricing depends on your project count and usage volume — would you like to set up a short demo call so we can put together a tailored quote?',
    emotion: 'professional',
  },
  {
    id: 'demo',
    keywords: ['demo', 'görüşme', 'iletişim', 'başlamak istiyorum', 'contact', 'get started', 'talk to someone'],
    tr: 'Elbette — sayfanın altındaki "Demo Talebi" formunu doldurmanız yeterli, ekibimiz kısa süre içinde sizinle iletişime geçer.',
    en: 'Of course — just fill in the "Request a Demo" form further down the page and our team will reach out shortly.',
    emotion: 'happy',
  },
  {
    id: 'security',
    keywords: ['güvenlik', 'kvkk', 'gdpr', 'veri', 'security', 'privacy', 'data protection'],
    tr: 'Müşteri verileri KVKK/GDPR ilkelerine uygun, açık rızaya dayalı olarak işlenir; tenant izolasyonu sayesinde bir şirketin verisi bir başkasına asla karışmaz. Detaylar için /kvkk.html ve /privacy.html sayfalarımıza bakabilirsiniz.',
    en: 'Customer data is processed under KVKK/GDPR principles with explicit consent, and tenant isolation means one company\'s data never mixes with another\'s. See /kvkk.html and /privacy.html for details.',
    emotion: 'professional',
  },
  {
    id: 'whatsapp',
    keywords: ['whatsapp'],
    tr: 'WhatsApp, desteklediğimiz kanallardan sadece biri — asıl deneyim şirketinizin kendi sitesinde canlı görüntülü görüşme. WhatsApp Business API üzerinden resmi ve izne dayalı şekilde çalışır.',
    en: 'WhatsApp is just one of the channels we support — the primary experience is the live video conversation on your own site. It runs through the official WhatsApp Business API, consent-based.',
    emotion: 'professional',
  },
  {
    id: 'languages',
    keywords: ['dil', 'çok dilli', 'language', 'multilingual', 'languages'],
    tr: 'Sitemiz şu an 8 dilde: Türkçe, İngilizce, Arapça, Rusça, Almanca, Farsça, Fransızca, İspanyolca. Ajan da bu dillere göre uyarlanabilir.',
    en: 'The site currently supports 8 languages: Turkish, English, Arabic, Russian, German, Persian, French, Spanish — and the agent adapts to them too.',
    emotion: 'professional',
  },
];

const FALLBACK = {
  tr: 'Bu konuda size en doğru bilgiyi ekibimizin vermesini isterim — dilerseniz aşağıdaki demo formundan bize ulaşabilirsiniz, ya da başka nasıl yardımcı olabilirim?',
  en: 'I\'d rather have our team give you the most accurate answer on that — feel free to reach us through the demo form below, or is there something else I can help with?',
};

const GREETING = {
  tr: 'Merhaba, ben Elif Kaya. VERALIQ dijital satış asistanıyım. Size nasıl yardımcı olabilirim?',
  en: 'Hi, I\'m Elif Kaya, VERALIQ\'s digital sales assistant. How can I help you?',
};

function pickLangBucket(lang) {
  return (lang || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export class FaqSalesBrainProvider extends LLMProvider {
  async respond(userText, context) {
    const bucket = pickLangBucket(context && context.lang);
    const lower = (userText || '').toLowerCase();

    const hit = KB.find((entry) => entry.keywords.some((k) => lower.includes(k)));
    const replyText = hit ? hit[bucket] : FALLBACK[bucket];
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
