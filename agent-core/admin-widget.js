// agent-core/admin-widget.js
//
// admin.html'in canlı, görüntülü "VERALIQ Admin AI" ajanı — index.html'deki
// "Elif Kaya"yla AYNI window-chrome runtime'ını (widget-runtime.js) kullanır,
// yalnızca persona ve "beyin" (LLM provider) farklıdır. Eklendi 2026-08-27,
// İmparator'ın "admin içinde asistan tanımlaması yap ... ana web sayfamızdaki
// gibi sag alt köşede asistan otomatik olarak çıkmalı elif kaya gibi aynı
// sistemi tam" isteği üzerine.

import { initAgentWidget } from './widget-runtime.js';

const AGENT_IDENTITY = {
  first_name: 'VERALIQ',
  last_name: 'Admin AI',
  display_name: 'VERALIQ Admin AI',
  company_name: 'VERALIQ',
  role: 'Platform Yönetim Asistanı',
};

initAgentWidget({
  agentIdentity: AGENT_IDENTITY,
  // Avatar/TTS/STT config.js'teki varsayılanla AYNI (spatius/googleTranslate/
  // webspeech) — yalnızca "beyin" değişiyor: platform-genelinde, salt-okunur
  // worker-portal sorguları (bkz. llm-providers/admin-assistant-brain-provider.js).
  providerOverrides: { llmProvider: 'adminAssistant' },
  // Admin paneli bir login/dashboard ekranıdır — geniş "corner" pencere
  // mobilde formu bloklar (bkz. widget-runtime.js'teki not). Küçük bir
  // bubble olarak otomatik başlar, tıklayınca genişler.
  startMinimized: true,
  // NOT (2026-08-27): conversationLogging BİLİNÇLİ OLARAK BAĞLANMADI.
  // worker-portal'daki /api/conversations POST ucu yalnızca 'company_owner'/
  // 'company_staff' rolünü ve NOT NULL bir company_id'yi kabul ediyor (bkz.
  // requireAuth çağrısı + conversations.company_id NOT NULL, schema.sql).
  // veraliq_admin oturumunun (bu sayfanın JWT'si) NE o rolü NE de bir
  // company_id'si var (platform-geneli, şirket-bağımsız) — yani bu widget'a
  // portal-widget.js'teki gibi bir tokenKey verilse bile backend her seferinde
  // 401 dönerdi (conversation-logger.js zaten bunu sessizce/non-blocking
  // yutar, ama gerçek bir kayıt hiç oluşmaz). Bu şema/tasarım uyuşmazlığı
  // dürüstçe işaretlidir — bkz. docs/DATABASE_SCHEMA.md ve PROJECT_ARCHITECTURE.md
  // §4. Gerçek çözüm: ya conversations.company_id'yi nullable yapıp
  // requireAuth'a 'veraliq_admin'i de eklemek (ayrı bir migration + backend
  // değişikliği gerektirir), ya da VERALIQ Admin AI için tamamen ayrı, platform-
  // geneli bir "admin_ai_sessions" tablosu açmak. İkisi de bu commit'in
  // kapsamı DIŞINDA — bilerek ertelendi, planlama olmadan sessizce atlanmadı.
});
