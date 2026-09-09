// worker-portal/tenant-widget.js
//
// Faz 10 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md) — gerçek tenant
// son-müşteri ajanının MİNİMUM dikey dilimi. Şu ana kadarki tüm canlı
// asistanlar (index.html'deki Elif Kaya, admin.html'deki VERALIQ Admin AI,
// portal.html'deki Şirket Yönetim Asistanı) VERALIQ'in KENDİ yüzeyleri
// içindi — hiçbiri bir TENANT ŞİRKETİN kendi web sitesine gömülüp o
// şirketin GERÇEK, kimliği doğrulanmamış müşterileriyle (emlak alıcıları)
// konuşmuyordu. Bu dosya o eksik parçayı, dar ve dikkatli bir kapsamda
// kapatır.
//
// TASARIM İLKELERİ:
// 1. AYRI FEATURE FLAG (companies.tenant_widget_enabled, bkz. migrations/
//    0006) — varsayılan KAPALI. Bir şirket için bu flag açık olmadıkça
//    hiçbir uç o şirket için veri döndürmez (tenant resolve 404 döner —
//    "yetkisiz" değil "bulunamadı", bir slug'ın var olup olmadığını bile
//    dışarı sızdırmamak için).
// 2. YALNIZCA YAYINLANMIŞ ALANLAR. Projeler: yalnızca status='selling'.
//    Birimler: yalnızca status='AVAILABLE'. ada/parsel/pafta, sold_price,
//    assigned_agent_*, presentation_session_id, hold/reservation
//    süreleri gibi İÇ operasyon alanları HİÇBİR ZAMAN dönülmez.
// 3. ORIGIN KONTROLÜ YOK (dürüstçe belirtilmeli): Faz 2/4'teki gibi bir
//    ALLOWED_ORIGINS listesi burada ÇALIŞMAZ çünkü bu uçlar TENANT
//    ŞİRKETİN KENDİ domain'ine gömülecek — o domain'i veritabanında
//    saklamıyoruz (companies tablosunda bir "domain" sütunu yok). Gerçek
//    savunma katmanı rate limiting ve kısa ömürlü visitor token'dır.
// 4. Visitor token'ın company_id claim'i, URL'deki :slug'ın çözüldüğü
//    company.id ile HER İSTEKTE karşılaştırılır — bir tenant'ın ziyaretçi
//    token'ı başka bir tenant'ın leads'ine YAZAMAZ (tenant-negatif testi).
// 5. Zero Trust AI: bu dosya SQL üretmez/almaz — sabit, parametreli
//    sorgular. Gerçek "beyin" (agent-core companyPublicAssistant, ayrı
//    dosya) yalnızca bu uçları çağırır.
// 6. Randevu/otomatik follow-up/WhatsApp/doküman ingestion/gerçek CRM
//    connector'ları bu dilimin KAPSAMI DIŞINDA — yalnızca lead oluşturma +
//    insan-devri işareti var.

import { generateId, signJWT, verifyJWT } from './auth.js';

const VISITOR_TOKEN_TTL_SECONDS = 30 * 60; // kısa ömürlü — tek bir ziyaret oturumu için yeterli
const LEAD_HONEYPOT_FIELD = 'website';

async function checkRateLimit(binding, key) {
  // Faz 2/4/5 ile AYNI fail-closed ilkesi.
  if (!binding || typeof binding.limit !== 'function') return false;
  try { return (await binding.limit({ key })).success; } catch (e) { return false; }
}

function cleanText(value, maxLen) {
  const str = String(value == null ? '' : value).trim().slice(0, maxLen || 300);
  // Faz 4'teki AYNI CSV/formula-injection koruması — bu alanlar da ileride
  // admin.html'de bir export'a girebilir.
  return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
}

// Faz 4 review bulgusuyla AYNI sebep (demo-requests.js'deki cleanPhone): "+90..."
// gibi gerçek telefon numaraları formül-nötrleştirmeyle bozulmasın diye telefon
// alanı yalnızca trim + uzunluk sınırı görür, cleanText() ÇAĞRILMAZ.
function cleanPhone(value, maxLen) {
  return String(value == null ? '' : value).trim().slice(0, maxLen || 300);
}

/** Tenant'ı slug'a göre çözer; widget kapalıysa veya şirket yoksa/askıdaysa null döner. */
async function resolveTenant(env, slug) {
  if (!slug || typeof slug !== 'string') return null;
  const company = await env.DB.prepare(
    `SELECT id, name, slug, remove_branding, tenant_widget_enabled FROM companies WHERE slug = ? AND status = 'active'`
  ).bind(slug).first();
  if (!company || !company.tenant_widget_enabled) return null;
  return company;
}

/** GET /api/public/tenant/:slug — tenant resolution. */
export async function handleTenantResolve(request, env, { json }, slug) {
  const rateOk = await checkRateLimit(env.TENANT_PUBLIC_READ_RATE_LIMITER, (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + slug);
  if (!rateOk) return json({ error: 'rate_limited' }, 429);
  const company = await resolveTenant(env, slug);
  // Bilerek 404 (401/403 değil) — bir slug'ın var olup olmadığını veya
  // widget'ının kapalı olduğunu dışarıya sızdırmamak için aynı yanıt.
  if (!company) return json({ error: 'not_found' }, 404);
  return json({ id: company.id, name: company.name, slug: company.slug, remove_branding: !!company.remove_branding });
}

/** GET /api/public/tenant/:slug/projects — yalnızca YAYINLANMIŞ (satışta) projeler. */
export async function handleTenantProjects(request, env, { json }, slug) {
  const rateOk = await checkRateLimit(env.TENANT_PUBLIC_READ_RATE_LIMITER, (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + slug);
  if (!rateOk) return json({ error: 'rate_limited' }, 429);
  const company = await resolveTenant(env, slug);
  if (!company) return json({ error: 'not_found' }, 404);
  const { results } = await env.DB.prepare(
    `SELECT id, name, location, description, delivery_date FROM projects
     WHERE company_id = ? AND status = 'selling' ORDER BY created_at DESC`
  ).bind(company.id).all();
  return json({ projects: results });
}

/** GET /api/public/tenant/:slug/units?project_id=X — yalnızca MEVCUT (AVAILABLE) birimler. */
export async function handleTenantUnits(request, env, { json }, slug, url) {
  const rateOk = await checkRateLimit(env.TENANT_PUBLIC_READ_RATE_LIMITER, (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + slug);
  if (!rateOk) return json({ error: 'rate_limited' }, 429);
  const company = await resolveTenant(env, slug);
  if (!company) return json({ error: 'not_found' }, 404);
  const projectId = url.searchParams.get('project_id');
  const query = projectId
    ? env.DB.prepare(
        `SELECT id, project_id, block, floor, unit_no, unit_type, gross_area, net_area, price, currency, updated_at
         FROM units WHERE company_id = ? AND project_id = ? AND status = 'AVAILABLE' ORDER BY unit_no`
      ).bind(company.id, projectId)
    : env.DB.prepare(
        `SELECT id, project_id, block, floor, unit_no, unit_type, gross_area, net_area, price, currency, updated_at
         FROM units WHERE company_id = ? AND status = 'AVAILABLE' ORDER BY unit_no`
      ).bind(company.id);
  const { results } = await query.all();
  // source-timestamp ilkesi (Faz 10): her birimin fiyat/stok bilgisinin NE
  // ZAMAN güncellendiği ayrıca dönüyor — agent-core companyPublicAssistant
  // bunu yanıtına ekleyip "bu bilgi X tarihli" diyebiliyor.
  return json({ units: results, as_of: new Date().toISOString() });
}

/** POST /api/public/tenant/:slug/visitor-session — kısa ömürlü ziyaretçi oturumu. */
export async function handleTenantVisitorSession(request, env, { json }, slug) {
  const company = await resolveTenant(env, slug);
  if (!company) return json({ error: 'not_found' }, 404);
  const rateOk = await checkRateLimit(env.TENANT_VISITOR_RATE_LIMITER, (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + slug);
  if (!rateOk) return json({ error: 'rate_limited' }, 429);
  if (!env.JWT_SECRET) return json({ error: 'server_not_configured' }, 500);
  const { token, exp } = await (async () => {
    const t = await signJWT({ sub: 'visitor', company_id: company.id, role: 'tenant_visitor', tenant_slug: slug }, env.JWT_SECRET, VISITOR_TOKEN_TTL_SECONDS);
    return { token: t, exp: Math.floor(Date.now() / 1000) + VISITOR_TOKEN_TTL_SECONDS };
  })();
  return json({ visitorToken: token, expiresAt: exp });
}

async function requireTenantVisitor(request, env, slug, company) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return null;
  const payload = await verifyJWT(match[1], env.JWT_SECRET);
  if (!payload) return null;
  // TENANT-NEGATİF kontrolü: token'ın rolü VE tenant_slug'ı VE company_id'si
  // HER ÜÇÜ de bu isteğin hedeflediği tenant ile eşleşmeli — bir şirketin
  // ziyaretçi token'ı başka bir şirketin slug'ında KULLANILAMAZ.
  if (payload.role !== 'tenant_visitor') return null;
  if (payload.tenant_slug !== slug) return null;
  if (payload.company_id !== company.id) return null;
  return payload;
}

/** POST /api/public/tenant/:slug/leads — rıza tabanlı, visitor-token korumalı lead oluşturma. */
export async function handleTenantLeadCreate(request, env, { json, writeAudit }, slug) {
  const company = await resolveTenant(env, slug);
  if (!company) return json({ error: 'not_found' }, 404);

  const rateOk = await checkRateLimit(env.TENANT_LEAD_RATE_LIMITER, (request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + slug);
  if (!rateOk) return json({ error: 'rate_limited' }, 429);

  const visitor = await requireTenantVisitor(request, env, slug, company);
  if (!visitor) return json({ error: 'visitor_token_required' }, 401);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_json' }, 400);

  // Honeypot — Faz 4 ile AYNI desen: gerçek bir id gibi görünen ama hiçbir
  // şey kaydetmeyen bir yanıt (bot honeypot'a takıldığını anlayamasın).
  if (body[LEAD_HONEYPOT_FIELD]) return json({ ok: true, id: generateId('lead') }, 201);

  const name = cleanText(body.name);
  const phone = cleanPhone(body.phone); // telefon formül-nötrleştirmeye tabi DEĞİL (Faz 4 review bulgusu — "+90..." bozulmasın)
  const email = typeof body.email === 'string' ? cleanText(body.email).toLowerCase() : '';
  const interest = cleanText(body.interest, 500);
  if (!name || !phone) return json({ error: 'missing_fields', required: ['name', 'phone'] }, 400);

  // Faz 10 review bulgusu: /api/leads'teki customer_id doğrulamasıyla AYNI
  // ilke — istemciden gelen project_id'ye KÖRÜ KÖRÜNE güvenilmez, bu tenant'a
  // GERÇEKTEN ait mi diye kontrol edilir (yoksa/başka şirketinse null kalır).
  let projectId = null;
  if (typeof body.project_id === 'string' && body.project_id) {
    const p = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND company_id = ?`).bind(body.project_id, company.id).first();
    if (p) projectId = p.id;
  }

  let notes = 'VERALIQ tenant widget üzerinden AI ajanıyla görüşme sonucu oluşturuldu.';
  if (body.requestHuman === true) notes += ' İNSAN TEMSİLCİ TALEP EDİLDİ.';

  const id = generateId('lead');
  await env.DB.prepare(
    `INSERT INTO leads (id, company_id, project_id, name, phone, email, interest, source, assigned_type, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'tenant_widget_ai', 'AI', 'new', ?, datetime('now'), datetime('now'))`
  ).bind(id, company.id, projectId, name, phone, email, interest, notes).run();

  await writeAudit(env, { company_id: company.id, user_id: null, action: 'lead.create_from_tenant_widget', entity_type: 'lead', entity_id: id, request });

  return json({ ok: true, id }, 201);
}
