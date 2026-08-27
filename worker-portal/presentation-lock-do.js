// worker-portal/presentation-lock-do.js
//
// PRESENTATION LOCK — Master Platform Prompt madde 33-35: "İki agent aynı
// anda aynı daireyi seçerse yalnızca biri başarılı olmalı. Bu sistemi
// frontend state ile yapma. Server-side lock oluştur. Redis / transaction /
// distributed lock gibi güvenilir yöntem kullan."
//
// NEDEN REDIS DEĞİL, DURABLE OBJECT: Bu proje zaten Cloudflare Workers
// üzerinde çalışıyor (madde 81: "gereksiz framework/teknoloji değişikliği
// yapma"). Redis eklemek ayrı bir servis, ayrı bir hesap, ayrı bir ağ
// bağlantısı demek. Cloudflare Durable Objects tam olarak bu problem için
// var: HER unit_id için TEK BİR Durable Object instance'ı oluşturulur
// (idFromName(unitId) ile) ve Cloudflare, o instance'a gelen tüm istekleri
// KESİN OLARAK TEK İPLİKLİ (single-threaded) sırayla işler — yani iki
// eşzamanlı `lock()` isteği asla aynı anda çalışmaz, biri diğerinden önce
// biter ve state'i günceller, ikincisi güncellenmiş state'i görür. Bu,
// Redis'teki `SETNX` + TTL mantığının Cloudflare-native karşılığıdır ve
// gerçek bir race-condition testi ile doğrulanabilir (bkz.
// docs/MASTER_PLATFORM_ANALYSIS_AND_ROADMAP.md madde 80 test listesi).
//
// HEARTBEAT: Madde 34 "Bağlantı kesildiğinde lock kontrollü şekilde serbest
// bırakılmalı" gereği, her lock bir `expires_at` taşır (varsayılan 90 sn).
// widget.js/orchestrator.js periyodik olarak /heartbeat çağırmalı; çağırmazsa
// lock kendiliğinden süresi dolar ve bir sonraki lock/status isteğinde
// otomatik temizlenir (aşağıdaki `_isExpired` kontrolü).

const DEFAULT_TTL_SECONDS = 90;

export class PresentationLock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.lock = null; // { session_id, agent_id, agent_type, customer_id, created_at, expires_at }
  }

  async _load() {
    if (this.lock === null) {
      const stored = await this.state.storage.get('lock');
      this.lock = stored || undefined;
    }
  }

  _isExpired(lock) {
    if (!lock) return true;
    return Date.now() > new Date(lock.expires_at).getTime();
  }

  async fetch(request) {
    await this._load();
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    if (this.lock && this._isExpired(this.lock)) {
      // Sessiz süre dolumu — bir önceki oturumun temizlik yapmadan
      // koptuğu, en sık karşılaşılacak durum.
      this.lock = undefined;
      await this.state.storage.delete('lock');
    }

    if (action === 'status') {
      return Response.json({ locked: !!this.lock, lock: this.lock || null });
    }

    if (action === 'lock') {
      const body = await request.json();
      if (this.lock && this.lock.session_id !== body.session_id) {
        // BAŞKA bir oturum zaten kilitli — bu istek KAYBEDER.
        // (Aynı, ihlalsiz senaryo: madde 35 "ONLY ONE REQUEST CAN WIN".)
        return Response.json(
          { ok: false, error: 'already_locked', lock: this.lock },
          { status: 409 }
        );
      }
      // Kilit yok, ya da AYNI oturumun kendi kilidini yeniliyor (idempotent).
      const now = Date.now();
      const ttl = (body.ttl_seconds && Number(body.ttl_seconds) > 0) ? Number(body.ttl_seconds) : DEFAULT_TTL_SECONDS;
      this.lock = {
        session_id: body.session_id,
        agent_id: body.agent_id || null,
        agent_type: body.agent_type || 'AI',
        customer_id: body.customer_id || null,
        created_at: this.lock ? this.lock.created_at : new Date(now).toISOString(),
        expires_at: new Date(now + ttl * 1000).toISOString(),
      };
      await this.state.storage.put('lock', this.lock);
      return Response.json({ ok: true, lock: this.lock });
    }

    if (action === 'heartbeat') {
      const body = await request.json();
      if (!this.lock || this.lock.session_id !== body.session_id) {
        return Response.json({ ok: false, error: 'no_such_lock' }, { status: 404 });
      }
      const ttl = (body.ttl_seconds && Number(body.ttl_seconds) > 0) ? Number(body.ttl_seconds) : DEFAULT_TTL_SECONDS;
      this.lock.expires_at = new Date(Date.now() + ttl * 1000).toISOString();
      await this.state.storage.put('lock', this.lock);
      return Response.json({ ok: true, lock: this.lock });
    }

    if (action === 'unlock') {
      const body = await request.json().catch(() => ({}));
      if (this.lock && body.session_id && this.lock.session_id !== body.session_id) {
        // Başkasının kilidini serbest bırakmaya çalışıyor — reddet.
        return Response.json({ ok: false, error: 'not_lock_owner' }, { status: 403 });
      }
      this.lock = undefined;
      await this.state.storage.delete('lock');
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'unknown_action' }, { status: 400 });
  }
}
