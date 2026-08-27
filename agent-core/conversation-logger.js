// agent-core/conversation-logger.js
//
// ConversationLogger — orchestrator.js'i somut bir REST endpoint'ine
// BAĞLAMADAN, canlı bir görüşmenin (start → her mesaj → end) VERALIQ Core'a
// (worker-portal D1) kalıcı olarak yazılmasını sağlayan ince bir köprü.
// 65 maddelik master promptun 3-5, 38-39. maddelerinin "orchestrator.js bu
// uçları henüz otomatik çağırmıyor" eksikliğini kapatan ilk somut adım
// (bkz. docs/PROJECT_ARCHITECTURE.md §4, DATABASE_SCHEMA.md — customers/
// conversations tabloları ve /api/conversations* uçları zaten yazılmış ve
// test edilmişti, yalnızca frontend tarafında hiçbir şey bunları ÇAĞIRMIYORDU).
//
// TASARIM İLKELERİ:
// 1. orchestrator.js bu sınıfın DIŞINDA hiçbir REST/HTTP detayı bilmez —
//    yalnızca start()/appendMessage()/end() arayüzünü çağırır. Yarın backend
//    değişirse (ör. REST yerine bir kuyruk) yalnızca BU dosya değişir.
// 2. LOGLAMA ASLA GÖRÜŞMEYİ KESMEZ / YAVAŞLATMAZ. Her ağ çağrısı kısa bir
//    timeout ile korunur (bkz. fetchWithTimeout) ve HER ZAMAN try/catch
//    içindedir — bir kayıt hatası (400/401/timeout/offline) müşterinin veya
//    personelin ajanla konuşmasını ASLA engellemez, yalnızca console.warn.
// 3. Kimlik doğrulama presentation-lock (units/:id/lock) ile AYNI dual-auth
//    deseni: önce sessionStorage'daki bir insan JWT'si denenir (varsa),
//    yoksa X-Agent-Key ile devam edilebilir (bugün admin/portal widget'ları
//    için gerekli değil, ikisi de zaten login gerektiriyor — ama yarın
//    index.html'e taşınırsa, ANONİM bir ziyaretçi için bu ikinci yol
//    kullanılacak).
// 4. Hiçbir JWT/agent-key yoksa (ör. henüz giriş yapılmadı) start() SESSİZCE
//    HİÇBİR AĞ ÇAĞRISI YAPMAZ — "önce giriş yapın" durumunu tekrar tekrar
//    401'e çarpıp log kirletmek yerine, en baştan atlar.

const API_BASE = 'https://veraliq-portal-api.veraliq-com.workers.dev';
const START_TIMEOUT_MS = 4000;
const WRITE_TIMEOUT_MS = 4000;

function warn(context, err) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[ConversationLogger] ' + context + ' failed (non-blocking):', err);
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  let controller = null;
  let timer = null;
  try {
    controller = new AbortController();
    timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  } catch (e) {
    controller = null; // AbortController unavailable in some very old envs — proceed without it
  }
  try {
    const merged = controller ? Object.assign({}, options, { signal: controller.signal }) : options;
    return await fetch(url, merged);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class ConversationLogger {
  /**
   * @param {{
   *   tokenKey?: string,   // sessionStorage key holding a portal/admin JWT (e.g. 'veraliq_company_jwt')
   *   agentKey?: string,   // fallback X-Agent-Key value — used only when tokenKey is absent/empty
   *   agentType?: string,  // 'AI' | 'HUMAN' — default 'AI'
   *   agentPersona?: string,
   *   provider?: string,   // agent-core/config.js provider name, informational only
   *   channel?: string,    // 'web' | 'portal' | 'admin' | 'whatsapp' — free text, not enforced server-side
   * }} opts
   */
  constructor(opts) {
    opts = opts || {};
    this.tokenKey = opts.tokenKey || null;
    this.agentKey = opts.agentKey || null;
    this.agentType = opts.agentType || 'AI';
    this.agentPersona = opts.agentPersona || '';
    this.provider = opts.provider || '';
    this.channel = opts.channel || 'web';
    this.conversationId = null;
    this._ended = false;
  }

  _authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    let token = null;
    if (this.tokenKey) {
      try { token = sessionStorage.getItem(this.tokenKey); } catch (e) { token = null; }
    }
    let authenticated = false;
    if (token) {
      headers.Authorization = 'Bearer ' + token;
      authenticated = true;
    } else if (this.agentKey) {
      headers['X-Agent-Key'] = this.agentKey;
      authenticated = true;
    }
    return { headers: headers, authenticated: authenticated };
  }

  /** Starts a conversation row. No-op (no network call) if there is no session/agent-key yet. */
  async start(meta) {
    meta = meta || {};
    const auth = this._authHeaders();
    if (!auth.authenticated) return; // not logged in yet — never spam 401s
    try {
      const resp = await fetchWithTimeout(API_BASE + '/api/conversations', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify({
          agent_type: this.agentType,
          agent_persona: this.agentPersona,
          provider: this.provider,
          channel: this.channel,
          customer_id: meta.customerId || null,
          lead_id: meta.leadId || null,
        }),
      }, START_TIMEOUT_MS);
      if (resp && resp.ok) {
        const data = await resp.json();
        this.conversationId = data && data.id ? data.id : null;
      }
    } catch (e) {
      warn('start', e);
    }
  }

  /** Appends one transcript line. Silently skipped if start() never produced a conversation id. */
  async appendMessage(role, text) {
    if (!this.conversationId || !text) return;
    const auth = this._authHeaders();
    if (!auth.authenticated) return;
    try {
      await fetchWithTimeout(API_BASE + '/api/conversations/' + this.conversationId + '/messages', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify({ role: role, text: text }),
      }, WRITE_TIMEOUT_MS);
    } catch (e) {
      warn('appendMessage', e);
    }
  }

  /** Attaches a structured summary (customer_need/budget/interest/objection/next_step). Optional — callers may never invoke this today. */
  async attachSummary(summary) {
    if (!this.conversationId || !summary) return;
    const auth = this._authHeaders();
    if (!auth.authenticated) return;
    try {
      await fetchWithTimeout(API_BASE + '/api/conversations/' + this.conversationId + '/summary', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify(summary),
      }, WRITE_TIMEOUT_MS);
    } catch (e) {
      warn('attachSummary', e);
    }
  }

  /** Marks the conversation as ended. Idempotent — safe to call more than once (e.g. stop() + reconnect). */
  async end() {
    if (!this.conversationId || this._ended) return;
    this._ended = true;
    const auth = this._authHeaders();
    if (!auth.authenticated) return;
    try {
      await fetchWithTimeout(API_BASE + '/api/conversations/' + this.conversationId + '/end', {
        method: 'POST',
        headers: auth.headers,
      }, WRITE_TIMEOUT_MS);
    } catch (e) {
      warn('end', e);
    }
  }
}
