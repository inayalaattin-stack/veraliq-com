// agent-core/llm-providers/admin-assistant-brain-provider.js
//
// AdminAssistantBrainProvider — "VERALIQ Admin AI"'nin beyni (admin.html'e
// canlı görüntülü asistan olarak eklendi, 2026-08-27, İmparator'ın "admin
// içinde asistan tanımlaması yap ... aynı sistemi ... canlı asistanlarıda
// ekle" isteği üzerine). Zero Trust AI ilkesine tam uyar (bkz.
// agent-core/providers.js'deki LLMProvider doc-comment): bu sınıf SQL
// üretmez, veritabanına DOĞRUDAN erişmez — yalnızca zaten var olan,
// deterministik POST /api/admin/assistant/query ucunu
// (worker-portal/portal-api-worker.js → answerAdminAssistantQuery()) çağırır
// ve sunucunun ürettiği GERÇEK cevabı olduğu gibi avatara söyletir.
//
// Kimlik doğrulama: admin.html oturum açtığında sessionStorage'a yazdığı JWT
// (veraliq_admin_jwt) burada okunur. Bu widget KENDİ BAŞINA bir admin
// oturumu asla açmaz — admin.html'de zaten insan tarafından doğrulanmış bir
// oturum olmalıdır (aksi halde avatar nazikçe "önce giriş yapın" der).
//
// SECURITY: respond() intent alanını HER ZAMAN null döndürür — bu ajan hiçbir
// state-changing aksiyonu (plan değişikliği, şirket silme, kullanıcı silme
// vb.) tetikleyemez, yalnızca salt-okunur platform istatistiklerini okur.

import { LLMProvider } from '../providers.js';

const API_BASE = 'https://veraliq-portal-api.veraliq-com.workers.dev';
const TOKEN_KEY = 'veraliq_admin_jwt';

const GREETING = 'Merhaba, ben VERALIQ Admin Asistanı. Platform genelinde şirketler, kullanıcılar, satışlar ve sistem durumu hakkında soru sorabilirsiniz — örneğin "kaç şirket var" ya da "toplam satış ve ciro nedir".';
const NOT_LOGGED_IN = 'Bu soruyu yanıtlamak için önce admin panelinde oturum açmanız gerekiyor.';
const GENERIC_ERROR = 'Şu anda platform verilerine ulaşamıyorum — worker-portal API bağlantısında bir sorun olabilir.';

function getAdminToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

export class AdminAssistantBrainProvider extends LLMProvider {
  async respond(userText) {
    const token = getAdminToken();
    if (!token) return { replyText: NOT_LOGGED_IN, emotion: 'concerned', intent: null };

    try {
      const resp = await fetch(API_BASE + '/api/admin/assistant/query', {
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
    if (!getAdminToken()) return { replyText: NOT_LOGGED_IN, emotion: 'concerned' };
    return { replyText: GREETING, emotion: 'greeting' };
  }
}
