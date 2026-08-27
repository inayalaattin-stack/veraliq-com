// worker-portal/portal-api-worker.js
//
// VERALIQ Company Portal API — Cloudflare Worker + D1 + Durable Object.
//
// Bu worker, docs/MASTER_PLATFORM_ANALYSIS_AND_ROADMAP.md'de tarif edilen
// "gerçek backend" katmanıdır: admin.html ve portal.html artık localStorage
// yerine bu API'yi çağırır. AYRI ve BAĞIMSIZ deploy edilir — worker/ (Anam,
// canlı) ve worker-spatius/ (Spatius+TTS, canlı) worker'larına DOKUNULMADI.
//
// GÜVENLİK MİMARİSİ (Master Platform Prompt madde 55-57):
//   - Her /api/* endpoint (auth hariç) Authorization: Bearer <JWT> ister.
//   - JWT'nin içindeki company_id, İSTEMCİNİN gönderdiği hiçbir company_id
//     parametresine GÜVENİLMEDEN, her sorguya sunucu tarafında eklenir —
//     bu, "Company A'nın Company B verisine erişememesi" kuralının kod
//     seviyesindeki uygulamasıdır (bkz. requireAuth() + her route'taki
//     `.bind(auth.company_id, ...)` kullanımı).
//   - LLM/agent bu API'yi DOĞRUDAN çağırmaz (Zero Trust AI, madde 56) —
//     agent-core hiçbir zaman bu worker'a bir JWT taşımaz; yalnızca insan
//     tarafından doğrulanmış bir portal oturumu bu uçları kullanabilir.
//     (Presentation Lock uçları bunun tek istisnasıdır ve KASITLIDIR: bkz.
//     aşağıdaki /units/:id/lock route'unun başındaki not.)

import { hashPassword, verifyPassword, signJWT, verifyJWT, generateId } from './auth.js';

export { PresentationLock } from './presentation-lock-do.js';

const ALLOWED_ORIGINS = new Set([
  'https://veraliq.com',
  'https://www.veraliq.com',
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://veraliq.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

async function writeAudit(env, { company_id, user_id, action, entity_type, entity_id, old_value, new_value, request }) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, company_id, user_id, action, entity_type, entity_id, old_value, new_value, ip, device, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      generateId('log'), company_id || null, user_id || null, action, entity_type, entity_id || null,
      old_value ? JSON.stringify(old_value) : null, new_value ? JSON.stringify(new_value) : null,
      request ? (request.headers.get('CF-Connecting-IP') || '') : '',
      request ? (request.headers.get('User-Agent') || '').slice(0, 200) : ''
    ).run();
  } catch (e) { /* audit log yazımı başarısız olsa bile ana işlemi engelleme */ }
}

// Verilen isteğin JWT'sini doğrular. allowedRoles boşsa herhangi bir
// oturum açmış kullanıcı geçer. Döner: {sub, company_id, role} ya da null.
async function requireAuth(request, env, allowedRoles) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return null;
  if (allowedRoles && allowedRoles.length && !allowedRoles.includes(payload.role)) return null;
  return payload;
}

// unit.status geçiş kuralları (madde 36) — LLM/UI doğrudan status yazamaz,
// yalnızca bu fonksiyonun izin verdiği geçişler kabul edilir.
const ALLOWED_TRANSITIONS = {
  AVAILABLE: ['PRESENTATION', 'HOLD'],
  PRESENTATION: ['AVAILABLE', 'HOLD'],
  HOLD: ['RESERVED', 'AVAILABLE'],
  RESERVED: ['DEPOSIT_PAID', 'AVAILABLE'],
  DEPOSIT_PAID: ['CONTRACT'],
  CONTRACT: ['SOLD'],
  SOLD: [],
};
function canTransition(from, to) {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

async function getUnitLockStub(env, unitId) {
  const id = env.PRESENTATION_LOCK.idFromName(unitId);
  return env.PRESENTATION_LOCK.get(id);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    try {
      const resp = await route(request, url, env);
      const body = await resp.text();
      return new Response(body, { status: resp.status, headers: { ...headers, ...Object.fromEntries(resp.headers) } });
    } catch (err) {
      return json({ error: 'internal_error', detail: String(err && err.message || err) }, 500, headers);
    }
  },
};

async function route(request, url, env) {
  const path = url.pathname;
  const method = request.method;

  // ---- AUTH ----------------------------------------------------------
  if (path === '/api/auth/admin/login' && method === 'POST') {
    const { email, password } = await request.json();
    if (!email || !password) return json({ error: 'missing_fields' }, 400);
    const user = await env.DB.prepare(
      `SELECT * FROM users WHERE company_id IS NULL AND role = 'veraliq_admin' AND email = ?`
    ).bind(email.toLowerCase().trim()).first();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ error: 'invalid_credentials' }, 401);
    }
    const token = await signJWT({ sub: user.id, company_id: null, role: user.role }, env.JWT_SECRET, 3600 * 12);
    return json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }

  if (path === '/api/auth/company/login' && method === 'POST') {
    const { email, password } = await request.json();
    if (!email || !password) return json({ error: 'missing_fields' }, 400);
    const user = await env.DB.prepare(
      `SELECT * FROM users WHERE company_id IS NOT NULL AND email = ?`
    ).bind(email.toLowerCase().trim()).first();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return json({ error: 'invalid_credentials' }, 401);
    }
    const company = await env.DB.prepare(`SELECT * FROM companies WHERE id = ?`).bind(user.company_id).first();
    if (!company || company.status !== 'active') return json({ error: 'company_inactive' }, 403);
    const token = await signJWT({ sub: user.id, company_id: user.company_id, role: user.role }, env.JWT_SECRET, 3600 * 12);
    return json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      company: { id: company.id, name: company.name, slug: company.slug, remove_branding: !!company.remove_branding },
    });
  }

  // ---- COMPANIES (admin only) -----------------------------------------
  if (path === '/api/companies' && method === 'GET') {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(`SELECT id, name, slug, plan, status, remove_branding, created_at FROM companies ORDER BY created_at DESC`).all();
    return json({ companies: results });
  }

  if (path === '/api/companies' && method === 'POST') {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    if (!body.name || !body.slug || !body.owner_email || !body.owner_password) {
      return json({ error: 'missing_fields', required: ['name', 'slug', 'owner_email', 'owner_password'] }, 400);
    }
    const existing = await env.DB.prepare(`SELECT id FROM companies WHERE slug = ?`).bind(body.slug).first();
    if (existing) return json({ error: 'slug_taken' }, 409);
    const existingEmail = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(body.owner_email.toLowerCase().trim()).first();
    if (existingEmail) return json({ error: 'email_taken' }, 409);

    const companyId = generateId('co');
    const userId = generateId('usr');
    const passwordHash = await hashPassword(body.owner_password);

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO companies (id, name, slug, plan, status, created_at) VALUES (?, ?, ?, ?, 'active', datetime('now'))`)
        .bind(companyId, body.name, body.slug, body.plan || 'trial'),
      env.DB.prepare(`INSERT INTO users (id, company_id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, 'company_owner', ?, datetime('now'))`)
        .bind(userId, companyId, body.owner_email.toLowerCase().trim(), passwordHash, body.owner_name || body.name),
    ]);

    await writeAudit(env, { company_id: companyId, user_id: auth.sub, action: 'company.create', entity_type: 'company', entity_id: companyId, new_value: { name: body.name, slug: body.slug }, request });
    return json({ id: companyId, owner_user_id: userId }, 201);
  }

  let m;
  if ((m = path.match(/^\/api\/companies\/([^/]+)$/))) {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const companyId = m[1];
    if (method === 'GET') {
      const company = await env.DB.prepare(`SELECT * FROM companies WHERE id = ?`).bind(companyId).first();
      if (!company) return json({ error: 'not_found' }, 404);
      const projects = await env.DB.prepare(`SELECT id, name, status FROM projects WHERE company_id = ?`).bind(companyId).all();
      return json({ company, projects: projects.results });
    }
    if (method === 'PATCH') {
      const body = await request.json();
      const fields = ['name', 'plan', 'status', 'remove_branding'];
      const sets = [], vals = [];
      for (const f of fields) if (f in body) { sets.push(`${f} = ?`); vals.push(body[f]); }
      if (!sets.length) return json({ error: 'no_fields' }, 400);
      vals.push(companyId);
      await env.DB.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      await writeAudit(env, { company_id: companyId, user_id: auth.sub, action: 'company.update', entity_type: 'company', entity_id: companyId, new_value: body, request });
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM companies WHERE id = ?`).bind(companyId).run();
      await writeAudit(env, { company_id: companyId, user_id: auth.sub, action: 'company.delete', entity_type: 'company', entity_id: companyId, request });
      return json({ ok: true });
    }
  }

  // ---- PROJECTS ---------------------------------------------------------
  if (path === '/api/projects' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const companyId = auth.role === 'veraliq_admin' ? url.searchParams.get('company_id') : auth.company_id;
    if (!companyId) return json({ error: 'company_id_required' }, 400);
    const { results } = await env.DB.prepare(`SELECT * FROM projects WHERE company_id = ? ORDER BY created_at DESC`).bind(companyId).all();
    return json({ projects: results });
  }

  if (path === '/api/projects' && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    // veraliq_admin, test/demo amaçlı olarak (admin.html'in "Proje Ekle"
    // özelliği) herhangi bir şirket adına body.company_id vererek proje
    // oluşturabilir — normal şirket kullanıcıları için company_id her zaman
    // kendi JWT'sinden gelir, İSTEMCİDEN gelen company_id'ye asla güvenilmez.
    const companyId = auth.role === 'veraliq_admin' ? body.company_id : auth.company_id;
    if (!companyId) return json({ error: 'company_id_required' }, 400);
    if (!body.name) return json({ error: 'missing_fields', required: ['name'] }, 400);
    const id = generateId('proj');
    await env.DB.prepare(
      `INSERT INTO projects (id, company_id, name, location, description, delivery_date, lat, lng, ada, parsel, pafta, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      id, companyId, body.name, body.location || '', body.description || '', body.delivery_date || null,
      body.lat ?? null, body.lng ?? null, body.ada || null, body.parsel || null, body.pafta || null,
      body.status || 'planning'
    ).run();
    await writeAudit(env, { company_id: companyId, user_id: auth.sub, action: 'project.create', entity_type: 'project', entity_id: id, new_value: body, request });
    return json({ id }, 201);
  }

  if ((m = path.match(/^\/api\/projects\/([^/]+)$/))) {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const projectId = m[1];
    const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
    if (!project) return json({ error: 'not_found' }, 404);
    if (auth.role !== 'veraliq_admin' && project.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);

    if (method === 'GET') return json({ project });
    if (method === 'PATCH') {
      const body = await request.json();
      const fields = ['name', 'location', 'description', 'delivery_date', 'lat', 'lng', 'ada', 'parsel', 'pafta', 'status'];
      const sets = [], vals = [];
      for (const f of fields) if (f in body) { sets.push(`${f} = ?`); vals.push(body[f]); }
      if (!sets.length) return json({ error: 'no_fields' }, 400);
      sets.push(`updated_at = datetime('now')`);
      vals.push(projectId);
      await env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      await writeAudit(env, { company_id: project.company_id, user_id: auth.sub, action: 'project.update', entity_type: 'project', entity_id: projectId, old_value: project, new_value: body, request });
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();
      await writeAudit(env, { company_id: project.company_id, user_id: auth.sub, action: 'project.delete', entity_type: 'project', entity_id: projectId, request });
      return json({ ok: true });
    }
  }

  // ---- UNITS (envanter) ---------------------------------------------------
  if ((m = path.match(/^\/api\/projects\/([^/]+)\/units$/))) {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const projectId = m[1];
    const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
    if (!project) return json({ error: 'not_found' }, 404);
    if (auth.role !== 'veraliq_admin' && project.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);

    if (method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT * FROM units WHERE project_id = ? ORDER BY block, floor, unit_no`).bind(projectId).all();
      return json({ units: results });
    }
    if (method === 'POST') {
      const body = await request.json();
      const items = Array.isArray(body) ? body : [body];
      const stmts = items.map((u) => {
        const id = generateId('unit');
        return env.DB.prepare(
          `INSERT INTO units (id, project_id, company_id, block, floor, unit_no, unit_type, gross_area, net_area, price, currency, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', datetime('now'), datetime('now'))`
        ).bind(
          id, projectId, project.company_id, u.block || '', u.floor ?? null, u.unit_no, u.unit_type || '',
          u.gross_area ?? null, u.net_area ?? null, u.price ?? null, u.currency || 'TRY'
        );
      });
      await env.DB.batch(stmts);
      await writeAudit(env, { company_id: project.company_id, user_id: auth.sub, action: 'unit.bulk_create', entity_type: 'project', entity_id: projectId, new_value: { count: items.length }, request });
      return json({ ok: true, count: items.length }, 201);
    }
  }

  if ((m = path.match(/^\/api\/units\/([^/]+)$/)) && (method === 'GET' || method === 'PATCH')) {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const unitId = m[1];
    const unit = await env.DB.prepare(`SELECT * FROM units WHERE id = ?`).bind(unitId).first();
    if (!unit) return json({ error: 'not_found' }, 404);
    if (auth.role !== 'veraliq_admin' && unit.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);

    if (method === 'GET') return json({ unit });

    const body = await request.json();
    const sets = [], vals = [];
    const safeFields = ['block', 'floor', 'unit_no', 'unit_type', 'gross_area', 'net_area', 'price', 'currency'];
    for (const f of safeFields) if (f in body) { sets.push(`${f} = ?`); vals.push(body[f]); }
    if ('status' in body) {
      if (!canTransition(unit.status, body.status)) {
        return json({ error: 'invalid_status_transition', from: unit.status, to: body.status }, 400);
      }
      sets.push('status = ?'); vals.push(body.status);
    }
    if (!sets.length) return json({ error: 'no_fields' }, 400);
    sets.push(`updated_at = datetime('now')`);
    vals.push(unitId);
    await env.DB.prepare(`UPDATE units SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    await writeAudit(env, { company_id: unit.company_id, user_id: auth.sub, action: 'unit.update', entity_type: 'unit', entity_id: unitId, old_value: unit, new_value: body, request });
    return json({ ok: true });
  }

  // ---- PRESENTATION LOCK (madde 33-35) ------------------------------------
  // NOT: Bu üç uç, portal JWT'si YERİNE hafif bir "agent session" doğrulaması
  // kabul eder (agent_key = env.AGENT_SHARED_SECRET) — çünkü bu uçları
  // ÇAĞIRAN taraf, müşteriyle konuşan AI agent'ın kendisidir (widget.js),
  // portal oturumu açmış bir insan değil. Zero Trust AI ilkesi (madde 56)
   // burada da korunuyor: agent bu uç üzerinden yalnızca "lock/unlock/heartbeat"
  // yapabilir — units tablosunun price/status gibi diğer alanlarını
  // DEĞİŞTİREMEZ (o yalnızca yukarıdaki PATCH /api/units/:id ile, portal JWT'si
  // ile mümkündür). agent_key, widget.js'e GÖMÜLMEZ — bkz. worker-portal/README.md
  // "Agent embed güvenliği" notu: gerçek üretimde bu, şirkete özel, düşük
  // yetkili bir "public embed key" olmalı (JWT_SECRET'tan ayrı), Faz 19b.
  function checkAgentKey(request, env) {
    const key = request.headers.get('X-Agent-Key') || '';
    return !!env.AGENT_SHARED_SECRET && key === env.AGENT_SHARED_SECRET;
  }

  if ((m = path.match(/^\/api\/units\/([^/]+)\/(lock|unlock|heartbeat)$/))) {
    if (!checkAgentKey(request, env)) return json({ error: 'unauthorized' }, 401);
    const unitId = m[1];
    const action = m[2];
    const unit = await env.DB.prepare(`SELECT * FROM units WHERE id = ?`).bind(unitId).first();
    if (!unit) return json({ error: 'not_found' }, 404);

    const stub = await getUnitLockStub(env, unitId);
    const body = await request.text();
    const doResp = await stub.fetch(`https://do/${action}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    const doResult = await doResp.json();

    if (action === 'lock' && doResp.ok && doResult.ok) {
      if (canTransition(unit.status, 'PRESENTATION')) {
        await env.DB.prepare(`UPDATE units SET status = 'PRESENTATION', presentation_session_id = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(doResult.lock.session_id, unitId).run();
        await writeAudit(env, { company_id: unit.company_id, user_id: doResult.lock.agent_id, action: 'unit.presentation_lock', entity_type: 'unit', entity_id: unitId, new_value: doResult.lock, request });
      }
    }
    if (action === 'unlock' && doResp.ok && doResult.ok) {
      if (unit.status === 'PRESENTATION') {
        await env.DB.prepare(`UPDATE units SET status = 'AVAILABLE', presentation_session_id = NULL, updated_at = datetime('now') WHERE id = ?`)
          .bind(unitId).run();
        await writeAudit(env, { company_id: unit.company_id, action: 'unit.presentation_unlock', entity_type: 'unit', entity_id: unitId, request });
      }
    }
    return json(doResult, doResp.status);
  }

  // ---- LEADS ---------------------------------------------------------------
  if (path === '/api/leads' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(`SELECT * FROM leads WHERE company_id = ? ORDER BY created_at DESC LIMIT 200`).bind(auth.company_id).all();
    return json({ leads: results });
  }
  if (path === '/api/leads' && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    const id = generateId('lead');
    await env.DB.prepare(
      `INSERT INTO leads (id, company_id, project_id, name, phone, email, budget, interest, source, assigned_type, status, notes, ai_summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      id, auth.company_id, body.project_id || null, body.name || '', body.phone || null, body.email || null,
      body.budget ?? null, body.interest || '', body.source || 'manual', body.assigned_type || 'HUMAN',
      body.notes || '', body.ai_summary || ''
    ).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'lead.create', entity_type: 'lead', entity_id: id, new_value: body, request });
    return json({ id }, 201);
  }
  if ((m = path.match(/^\/api\/leads\/([^/]+)$/))) {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const leadId = m[1];
    const lead = await env.DB.prepare(`SELECT * FROM leads WHERE id = ? AND company_id = ?`).bind(leadId, auth.company_id).first();
    if (!lead) return json({ error: 'not_found' }, 404);
    if (method === 'GET') return json({ lead });
    if (method === 'PATCH') {
      const body = await request.json();
      const fields = ['name', 'phone', 'email', 'budget', 'interest', 'assigned_to', 'assigned_type', 'status', 'notes', 'ai_summary'];
      const sets = [], vals = [];
      for (const f of fields) if (f in body) { sets.push(`${f} = ?`); vals.push(body[f]); }
      if (!sets.length) return json({ error: 'no_fields' }, 400);
      sets.push(`updated_at = datetime('now')`);
      vals.push(leadId);
      await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'lead.update', entity_type: 'lead', entity_id: leadId, old_value: lead, new_value: body, request });
      return json({ ok: true });
    }
  }

  // ---- APPROVALS (madde 42-43) ----------------------------------------------
  if (path === '/api/approvals' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(`SELECT * FROM approval_requests WHERE company_id = ? ORDER BY created_at DESC LIMIT 200`).bind(auth.company_id).all();
    return json({ approvals: results });
  }
  if (path === '/api/approvals' && method === 'POST') {
    // company portal kullanıcısı VEYA agent (X-Agent-Key) oluşturabilir.
    let companyId, requestedBy;
    const auth = await requireAuth(request, env, null);
    if (auth && ['company_owner', 'company_staff'].includes(auth.role)) {
      companyId = auth.company_id; requestedBy = auth.sub;
    } else if (checkAgentKey(request, env)) {
      const body0 = await request.clone().json();
      companyId = body0.company_id; requestedBy = 'AI';
      if (!companyId) return json({ error: 'company_id_required' }, 400);
    } else {
      return json({ error: 'unauthorized' }, 401);
    }
    const body = await request.json();
    const id = generateId('appr');
    await env.DB.prepare(
      `INSERT INTO approval_requests (id, company_id, type, related_id, requested_by, amount, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
    ).bind(id, companyId, body.type || 'other', body.related_id || null, requestedBy, body.amount ?? null, body.notes || '').run();
    await writeAudit(env, { company_id: companyId, user_id: requestedBy, action: 'approval.request', entity_type: 'approval_request', entity_id: id, new_value: body, request });
    return json({ id }, 201);
  }
  if ((m = path.match(/^\/api\/approvals\/([^/]+)\/decide$/)) && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner']); // yalnız yetkili (owner) onaylayabilir — madde 43
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const approvalId = m[1];
    const approval = await env.DB.prepare(`SELECT * FROM approval_requests WHERE id = ? AND company_id = ?`).bind(approvalId, auth.company_id).first();
    if (!approval) return json({ error: 'not_found' }, 404);
    if (approval.status !== 'pending') return json({ error: 'already_decided' }, 409);
    const body = await request.json();
    const decision = body.decision === 'approved' ? 'approved' : 'rejected';
    await env.DB.prepare(`UPDATE approval_requests SET status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?`)
      .bind(decision, auth.sub, approvalId).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'approval.' + decision, entity_type: 'approval_request', entity_id: approvalId, request });
    return json({ ok: true, status: decision });
  }

  // ---- AUDIT LOG (read-only) -------------------------------------------------
  if (path === '/api/audit-log' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    let query, params;
    if (auth.role === 'veraliq_admin') {
      query = `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`; params = [];
    } else {
      query = `SELECT * FROM audit_log WHERE company_id = ? ORDER BY created_at DESC LIMIT 200`; params = [auth.company_id];
    }
    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ entries: results });
  }

  return json({ error: 'not_found' }, 404);
}
