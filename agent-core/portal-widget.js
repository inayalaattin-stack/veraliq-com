// agent-core/portal-widget.js
//
// portal.html'in (Şirket Portalı) canlı, görüntülü "Şirket Yönetim Asistanı"
// ajanı — index.html'deki "Elif Kaya"yla AYNI window-chrome runtime'ını
// (widget-runtime.js) kullanır, yalnızca persona ve "beyin" (LLM provider)
// farklıdır. Eklendi 2026-08-27, İmparator'ın "şirket portalı içinde canlı
// asistan baglayacaksın onuda unutma" isteği üzerine.
//
// NOT: Bu widget portal.html'in #app kabuğunun DIŞINDA yaşar (login
// ekranında da DOM'da mevcuttur) — yani otomatik olarak login ekranında da
// görünür (index.html'deki gibi "otomatik çıkma" davranışı korunuyor).
// Login olmadan sorulan bir soruya CompanyAssistantBrainProvider nazikçe
// "önce giriş yapın" der; hiçbir şirket verisi login olmadan asla ifşa
// edilmez (Zero Trust AI + tenant izolasyon, JWT sunucu tarafında zorunlu).

import { initAgentWidget } from './widget-runtime.js';

const AGENT_IDENTITY = {
  first_name: 'Şirket',
  last_name: 'Asistanı',
  display_name: 'Şirket Yönetim Asistanı',
  company_name: 'VERALIQ',
  role: 'Company Management Assistant',
};

initAgentWidget({
  agentIdentity: AGENT_IDENTITY,
  // Avatar/TTS/STT config.js'teki varsayılanla AYNI (spatius/googleTranslate/
  // webspeech) — yalnızca "beyin" değişiyor: şirkete özel, tenant-izole
  // worker-portal sorguları (bkz. llm-providers/company-assistant-brain-provider.js).
  providerOverrides: { llmProvider: 'companyAssistant' },
  // Şirket portalı bir login/dashboard ekranıdır — geniş "corner" pencere
  // mobilde formu/menüyü bloklar (bkz. widget-runtime.js'teki not). Küçük
  // bir bubble olarak otomatik başlar, tıklayınca genişler.
  startMinimized: true,
  // 2026-08-27: bu widget artık her görüşmeyi (start/mesaj/end) worker-portal
  // /api/conversations* uçlarına GERÇEKTEN yazıyor (bkz. conversation-logger.js).
  // Bu, portal.html'in company_owner/company_staff JWT'si zaten backend'in
  // beklediği role+company_id ile birebir eşleştiği için doğru şekilde
  // çalışıyor (admin.html'in veraliq_admin rolü İSE bu uca yazamıyor — bkz.
  // admin-widget.js'teki not, orası bilinçli olarak HENÜZ bağlanmadı).
  conversationLogging: { tokenKey: 'veraliq_company_jwt', channel: 'portal' },
});
