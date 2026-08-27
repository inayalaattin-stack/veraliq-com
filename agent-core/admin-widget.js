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
});
