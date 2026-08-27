// agent-core/llm-providers/company-assistant-brain-provider.js
//
// CompanyAssistantBrainProvider — Şirket Portalı'nın canlı, görüntülü "Şirket
// Yönetim Asistanı"nın beyni (portal.html'e eklendi, 2026-08-27, İmparator'ın
// "şirket portalı içinde canlı asistan baglayacaksın onuda unutma" isteği
// üzerine). Bu, index.html'deki "Elif Kaya" MÜŞTERİ SATIŞ ajanından tamamen
// FARKLI bir roldür (bkz. PRD.md §1.1 "İki/Üç Farklı Ajan"): burada muhatap
// şirketin KENDİ ekibi, amaç satış değil, kendi verilerini konuşarak sorgulayabilmek.
//
// Zero Trust AI ilkesine tam uyar: SQL üretmez, veritabanına DOĞRUDAN erişmez
// — yalnızca portal.html'in metin-tabanlı "AI Assistant" görünümünün ZATEN
// kullandığı aynı deterministik uca (POST /api/assistant/query →
// worker-portal/portal-api-worker.js'deki answerAssistantQuery()) gider ve
// sunucunun ürettiği GERÇEK, şirkete özel cevabı olduğu gibi avatara söyletir.
//
// Kimlik doğrulama: portal.html oturum açtığında sessionStorage'a yazdığı JWT
// (veraliq_company_jwt) burada okunur — bu JWT'nin içindeki company_id sunucu
// tarafında zorunlu kılınır (requireAuth), yani bu ajan asla başka bir
// şirketin verisini göremez (multi-tenant izolasyon, madde 55-57).
//
// SECURITY: respond() intent alanını HER ZAMAN null döndürür.
//
// ÇOK DİLLİ DESTEK (2026-08-27 eklendi — İmparator: "şirket yetkilisi
// ingilizce veya rusça konuşursa mantıken asistanının o dili konuşması
// gerekir"). portal.html'in kendi dil seçici sistemi (bkz. portal-i18n.js)
// tercih edilen dili localStorage'a `veraliq_portal_lang` anahtarıyla yazıyor
// — bu sağlayıcı AYNI anahtarı okuyarak (portal-i18n.js'e bağımlı olmadan,
// bağımsız bir sabit sözlükle) hem kendi sabit cümlelerini (giriş yapılmadı /
// genel hata / karşılama) hem backend'e gönderdiği `lang` parametresini o
// dile göre seçiyor. Backend (answerAssistantQuery) zaten hangi dilde
// yazıldığına bakılmaksızın niyeti tanıyor — bu yalnızca CEVABIN dilini seçer.
import { LLMProvider } from '../providers.js';

const API_BASE = 'https://veraliq-portal-api.veraliq-com.workers.dev';
const TOKEN_KEY = 'veraliq_company_jwt';
const COMPANY_KEY = 'veraliq_company_info';
const LANG_KEY = 'veraliq_portal_lang'; // portal.html'in dil sistemiyle AYNI anahtar

const STRINGS = {
  notLoggedIn: {
    tr: 'Bu soruyu yanıtlamak için önce şirket portalında oturum açmanız gerekiyor.',
    en: 'You need to log in to the company portal before I can answer that.',
    ru: 'Чтобы ответить на этот вопрос, сначала войдите в портал компании.',
  },
  genericError: {
    tr: 'Şu anda şirket verilerinize ulaşamıyorum — API bağlantısında bir sorun olabilir.',
    en: "I can't reach your company data right now — there may be an issue with the API connection.",
    ru: 'Сейчас не удаётся получить доступ к данным вашей компании — возможно, проблема с подключением к API.',
  },
  greetWithCompany: {
    tr: (name) => `Merhaba, ben ${name} şirket yönetim asistanınızım. Satış, stok, lead veya onaylar hakkında soru sorabilirsiniz.`,
    en: (name) => `Hello, I'm ${name}'s company management assistant. You can ask about sales, stock, leads, or approvals.`,
    ru: (name) => `Здравствуйте, я ассистент управления компанией ${name}. Вы можете спросить о продажах, складе, лидах или одобрениях.`,
  },
  greetGeneric: {
    tr: 'Merhaba, ben şirket yönetim asistanınızım. Satış, stok, lead veya onaylar hakkında soru sorabilirsiniz.',
    en: "Hello, I'm your company management assistant. You can ask about sales, stock, leads, or approvals.",
    ru: 'Здравствуйте, я ваш ассистент управления компанией. Вы можете спросить о продажах, складе, лидах или одобрениях.',
  },
};

function getLang() {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return (l === 'en' || l === 'ru') ? l : 'tr';
  } catch (e) { return 'tr'; }
}
function getCompanyToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function getCompanyName() {
  try {
    const raw = sessionStorage.getItem(COMPANY_KEY);
    const c = raw ? JSON.parse(raw) : null;
    return (c && c.name) || null;
  } catch (e) { return null; }
}

export class CompanyAssistantBrainProvider extends LLMProvider {
  async respond(userText) {
    const lang = getLang();
    const token = getCompanyToken();
    if (!token) return { replyText: STRINGS.notLoggedIn[lang], emotion: 'concerned', intent: null };

    try {
      const resp = await fetch(API_BASE + '/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ question: userText, lang }),
      });
      let data = null;
      try { data = await resp.json(); } catch (e) {}
      if (!resp.ok) {
        if (resp.status === 401) return { replyText: STRINGS.notLoggedIn[lang], emotion: 'concerned', intent: null };
        return { replyText: STRINGS.genericError[lang], emotion: 'concerned', intent: null };
      }
      return { replyText: (data && data.answer) || STRINGS.genericError[lang], emotion: 'professional', intent: null };
    } catch (e) {
      return { replyText: STRINGS.genericError[lang], emotion: 'concerned', intent: null };
    }
  }

  /** Short opening line — spec section 11: greeting must stay brief. */
  async greet() {
    const lang = getLang();
    if (!getCompanyToken()) return { replyText: STRINGS.notLoggedIn[lang], emotion: 'concerned' };
    const companyName = getCompanyName();
    const replyText = companyName ? STRINGS.greetWithCompany[lang](companyName) : STRINGS.greetGeneric[lang];
    return { replyText, emotion: 'greeting' };
  }
}
