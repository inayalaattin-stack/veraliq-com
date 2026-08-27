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

import { LLMProvider } from '../providers.js';

const API_BASE = 'https://veraliq-portal-api.veraliq-com.workers.dev';
const TOKEN_KEY = 'veraliq_company_jwt';
const COMPANY_KEY = 'veraliq_company_info';

const NOT_LOGGED_IN = 'Bu soruyu yanıtlamak için önce şirket portalında oturum açmanız gerekiyor.';
const GENERIC_ERROR = 'Şu anda şirket verilerinize ulaşamıyorum — API bağlantısında bir sorun olabilir.';

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
    const token = getCompanyToken();
    if (!token) return { replyText: NOT_LOGGED_IN, emotion: 'concerned', intent: null };

    try {
      const resp = await fetch(API_BASE + '/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ question: userText }),
      });
      let data = null;
      try { data = await resp.json(); } catch (e) {}
      if (!resp.ok) {
        if (resp.status === 401) return { replyText: NOT_LOGGED_IN, emotion: 'concerned', intent: null };
        return { replyText: GENERIC_ERROR, emotion: 'concerned', intent: null };
      }
      return { replyText: (data && data.answer) || GENERIC_ERROR, emotion: 'professional', intent: null };
    } catch (e) {
      return { replyText: GENERIC_ERROR, emotion: 'concerned', intent: null };
    }
  }

  /** Short opening line — spec section 11: greeting must stay brief. */
  async greet() {
    if (!getCompanyToken()) return { replyText: NOT_LOGGED_IN, emotion: 'concerned' };
    const companyName = getCompanyName();
    const replyText = companyName
      ? 'Merhaba, ben ' + companyName + ' şirket yönetim asistanınızım. Satış, stok, lead veya onaylar hakkında soru sorabilirsiniz.'
      : 'Merhaba, ben şirket yönetim asistanınızım. Satış, stok, lead veya onaylar hakkında soru sorabilirsiniz.';
    return { replyText, emotion: 'greeting' };
  }
}
