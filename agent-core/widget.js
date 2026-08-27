// agent-core/widget.js
//
// index.html'in canlı, görüntülü satış ajanı ("Elif Kaya") — bu dosya artık
// TÜM window-chrome mantığını (corner/half/fullscreen/minimize/reconnect/
// barge-in/altyazı) barındıran widget-runtime.js'e ince bir SARMALAYICI
// (2026-08-27, İmparator'ın "aynı sistemi ... canlı asistanlarıda ekle"
// isteği üzerine — bkz. admin-widget.js ve portal-widget.js, bu ikisi de
// AYNI runtime'ı FARKLI bir persona + FARKLI bir "beyin" (LLM provider) ile
// kullanıyor). DAVRANIŞ DEĞİŞMEDİ: aynı AGENT_IDENTITY, aynı varsayılan
// AGENT_PROVIDER_CONFIG (override YOK) — index.html'deki mevcut ajan
// bire bir aynı şekilde çalışmaya devam ediyor.
//
// Loaded as `<script type="module" src="agent-core/widget.js">` from
// index.html — module scripts defer automatically, so this always runs
// after script.js (which defines window.VeraliqI18N) has executed.

import { initAgentWidget } from './widget-runtime.js';

// The agent's identity on veraliq.com itself (spec section 11 — this is the
// "VERALIQ Digital Sales Assistant" persona, distinct from any client
// company's own portal instance, which would supply its own
// company_name/display_name here instead — see PRD.md §1.1).
const AGENT_IDENTITY = {
  first_name: 'Elif',
  last_name: 'Kaya',
  display_name: 'Elif Kaya',
  company_name: 'VERALIQ',
  role: 'Digital Sales Assistant',
};

initAgentWidget({ agentIdentity: AGENT_IDENTITY });
