// worker-portal/demo-requests.js
//
// Faz 4 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md) — gerçek demo talebi
// akışı. Ayrı bir modülde tutuluyor ki portal-api-worker.js (zaten 800 satır
// yumuşak tavanının üstünde) daha da büyümesin — route dispatch orada kalır,
// iş mantığı burada.
//
// TASARIM İLKELERİ:
// 1. Önce KALICI kayıt, SONRA bildirim. Bildirim (e-posta/webhook) başarısız
//    olsa bile kayıt asla kaybolmaz. Bugün gerçek bir bildirim sağlayıcısı
//    (SMTP/webhook secret'ı) YOK — sendNotification() bunu dürüstçe no-op
//    bırakır (notified_at NULL kalır), sahte bir "gönderildi" iddia etmez.
// 2. İstemciye başarı YALNIZCA D1 kaydı gerçekten başarılıysa dönülür.
// 3. Honeypot + sunucu tarafı doğrulama/normalize + formül-injection koruması
//    (bu alanlar ileride bir CSV export'a girebilir — Faz 6/8 kapsamı).
// 4. Aynı e-posta+telefon çifti kısa bir pencerede zaten kayıt açtıysa YENİ
//    bir satır açmak yerine MEVCUT kaydı döner (idempotency — çift tıklama/
//    ağ yeniden denemesi çift kayıt oluşturmaz).

import { generateId } from './auth.js';

const HONEYPOT_FIELD = 'website'; // formda CSS ile GİZLİ tutulması gereken alan adı
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_WINDOW_MINUTES = 5;
// privacy.html/kvkk.html'in bu fazda güncellendiği tarih (bkz. Faz 3 commit)
// — hangi rıza metnine göre onay alındığını sonradan izleyebilmek için.
const CONSENT_VERSION = '2026-09-09';

// Excel/Sheets'te açıldığında formül olarak yorumlanabilecek baştaki
// karakterleri zararsız hale getirir (CSV/formula injection koruması).
function neutralizeFormula(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function clean(value, maxLen) {
  return neutralizeFormula(String(value == null ? '' : value).trim().slice(0, maxLen || 300));
}

async function checkRateLimit(binding, key) {
  // Faz 2'deki worker-spatius ile AYNI ilke: binding yoksa/bozuksa KAPALI
  // başarısız ol (isteği reddet), "korumasız ama korumalı görünüyor"
  // durumuna düşme.
  if (!binding || typeof binding.limit !== 'function') return false;
  try { return (await binding.limit({ key })).success; } catch (e) { return false; }
}

export async function handleDemoRequestSubmit(request, env, { json, writeAudit }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env.DEMO_REQUEST_RATE_LIMITER, ip);
  if (!allowed) return json({ error: 'rate_limited' }, 429);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_json' }, 400);

  // Honeypot: gerçek ziyaretçiler bu alanı hiç görmez/dolduramaz (CSS ile
  // gizli). Doluysa bot kabul edilir — istemciye "başarılı" görünen ama
  // hiçbir şey kaydetmeyen bir yanıt dönülür (bot formun "işe yaramadığını"
  // fark edip farklı bir yol denemeye başlamasın diye) — gerçek ziyaretçileri
  // ETKİLEMEZ, onlar bu alanı hiç görmüyor.
  if (body[HONEYPOT_FIELD]) return json({ ok: true, id: 'ignored' }, 201);

  const name = clean(body.name);
  const company = clean(body.company);
  const phone = clean(body.phone);
  const email = clean(body.email).toLowerCase();
  const companyType = clean(body.type);
  const volume = clean(body.volume);

  if (!name || !company || !phone || !email) {
    return json({ error: 'missing_fields', required: ['name', 'company', 'phone', 'email'] }, 400);
  }
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);

  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 200);

  const existing = await env.DB.prepare(
    `SELECT id FROM demo_requests WHERE email = ? AND phone = ?
     AND created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT 1`
  ).bind(email, phone, `-${DUPLICATE_WINDOW_MINUTES} minutes`).first();
  if (existing) return json({ ok: true, id: existing.id, duplicate: true }, 200);

  const id = generateId('demo');
  await env.DB.prepare(
    `INSERT INTO demo_requests (id, name, company, phone, email, company_type, volume, source, status, consent_version, consent_timestamp, ip, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'website', 'new', ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`
  ).bind(id, name, company, phone, email, companyType, volume, CONSENT_VERSION, ip, userAgent).run();

  // Best-effort, sonuca göre başarı/başarısızlık istemciye YANSITILMAZ —
  // kayıt zaten yukarıda kalıcı oldu, bildirim ayrı ve ikincil bir adımdır.
  await sendNotification(env, { id, name, company, email });

  return json({ ok: true, id }, 201);
}

// Gerçek bir e-posta/webhook sağlayıcısı yapılandırıldığında (env.DEMO_NOTIFY_WEBHOOK_URL)
// devreye girer. Bugün kasıtlı olarak no-op: sahte "gönderildi" iddiası YOK,
// ama kayıt asla bu adıma bağımlı değil — bildirim hatası/gecikmesi talebi
// KAYBETMEZ (yukarıda zaten yazıldı).
async function sendNotification(env, demoRequest) {
  if (!env.DEMO_NOTIFY_WEBHOOK_URL) return;
  try {
    await fetch(env.DEMO_NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demoRequest),
      signal: AbortSignal.timeout(5000),
    });
    await env.DB.prepare(`UPDATE demo_requests SET notified_at = datetime('now') WHERE id = ?`).bind(demoRequest.id).run();
  } catch (e) { /* best-effort — bildirim hatası kaydı ASLA kaybetmez, notified_at NULL kalır */ }
}

export async function handleDemoRequestsList(request, env, { json }) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, company, phone, email, company_type, volume, source, status, owner_user_id, notes, created_at, updated_at, notified_at
     FROM demo_requests ORDER BY created_at DESC LIMIT 500`
  ).all();
  return json({ demo_requests: results });
}

export async function handleDemoRequestUpdate(request, env, { json, writeAudit, auth, id }) {
  const before = await env.DB.prepare(`SELECT * FROM demo_requests WHERE id = ?`).bind(id).first();
  if (!before) return json({ error: 'not_found' }, 404);

  const body = await request.json().catch(() => ({}));
  const fields = [];
  const values = [];
  if (typeof body.status === 'string') { fields.push('status = ?'); values.push(clean(body.status, 30)); }
  if (typeof body.notes === 'string') { fields.push('notes = ?'); values.push(clean(body.notes, 2000)); }
  if (typeof body.owner_user_id === 'string' || body.owner_user_id === null) {
    fields.push('owner_user_id = ?'); values.push(body.owner_user_id || null);
  }
  if (!fields.length) return json({ error: 'no_fields' }, 400);
  fields.push("updated_at = datetime('now')");

  await env.DB.prepare(`UPDATE demo_requests SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();

  await writeAudit(env, {
    company_id: null, user_id: auth.sub, action: 'demo_request.update', entity_type: 'demo_request', entity_id: id,
    old_value: { status: before.status, notes: before.notes, owner_user_id: before.owner_user_id },
    new_value: body, request,
  });

  const after = await env.DB.prepare(`SELECT * FROM demo_requests WHERE id = ?`).bind(id).first();
  return json({ demo_request: after });
}
