// worker-portal/expert-assist.js
//
// Silent Expert Assist — bkz. repo kökündeki SILENT-EXPERT-ASSIST-DESIGN.md
// (kullanıcı onaylı tasarım). Bu dosya o tasarımın 1. uygulama turu:
// veri modeli + durum makinesi + atomik "ilk geçerli cevap" kabulü + audit.
// WebSocket/DO canlı push VE portal notification UI/PWA/push BİLEREK bu
// turun DIŞINDA (tasarımın kendi kademeli rollout planı — §13).
//
// TASARIM İLKELERİ (tasarım dokümanından):
// 1. Bir yetkili cevabı OTOMATİK olarak şirket-geneli bilgiye dönüşmez —
//    varsayılan scope 'this_conversation', company_wide ayrı bir yayın
//    adımı gerektirir (handleKnowledgeCandidatePublish).
// 2. Bilgi cevabı (category='info') ile ticari onay (category=
//    'commercial_approval') AYRI akışlardır — bu dosya ticari onayı ASLA
//    execute etmez, yalnızca bilgiyi kaydeder. Gerçek yetkilendirme hâlâ
//    mevcut approval_requests sisteminden geçer (portal-api-worker.js'deki
//    POST /api/approvals/:id/decide, approval_limit kontrolü eklenmiş hâli).
// 3. Zero Trust AI: bu dosya SQL üretmez/almaz — sabit, parametreli sorgular.
// 4. Tenant izolasyonu: HER sorgu company_id ile filtrelenir, istemciden
//    gelen company_id'ye asla güvenilmez (auth.company_id kullanılır).

import { generateId } from './auth.js';

const MAX_ACTIVE_EXPERTS_PER_GROUP = 3;
const DEFAULT_QUERY_TIMEOUT_MINUTES = 30;
const MEMORY_KEY_TYPES = new Set([
  'preference', 'interested_unit', 'interested_project', 'objection',
  'document_sent', 'open_question', 'follow_up_preference', 'consent_snapshot',
]);

// ---------------------------------------------------------------------
// EXPERT GROUPS + MEMBERS
// ---------------------------------------------------------------------

async function activeMemberCount(env, expertGroupId) {
  const { n } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM expert_group_members WHERE expert_group_id = ? AND active = 1`
  ).bind(expertGroupId).first();
  return n;
}

export async function handleExpertGroupCreate(request, env, { json, writeAudit, auth }) {
  const body = await request.json();
  if (!body.name) return json({ error: 'missing_fields', required: ['name'] }, 400);
  const id = generateId('expgrp');
  await env.DB.prepare(
    `INSERT INTO expert_groups (id, company_id, name, active, created_at) VALUES (?, ?, ?, 1, datetime('now'))`
  ).bind(id, auth.company_id, body.name).run();
  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'expert_group.create', entity_type: 'expert_group', entity_id: id, new_value: body, request });
  return json({ id }, 201);
}

export async function handleExpertGroupsList(request, env, { json, auth }) {
  const { results: groups } = await env.DB.prepare(
    `SELECT * FROM expert_groups WHERE company_id = ? ORDER BY created_at DESC`
  ).bind(auth.company_id).all();
  const { results: counts } = await env.DB.prepare(
    `SELECT expert_group_id, COUNT(*) AS n FROM expert_group_members WHERE active = 1 GROUP BY expert_group_id`
  ).all();
  const countMap = {};
  for (const row of counts) countMap[row.expert_group_id] = row.n;
  return json({ groups: groups.map((g) => ({ ...g, active_member_count: countMap[g.id] || 0 })) });
}

export async function handleExpertGroupDetail(request, env, { json, auth, id }) {
  const group = await env.DB.prepare(`SELECT * FROM expert_groups WHERE id = ? AND company_id = ?`).bind(id, auth.company_id).first();
  if (!group) return json({ error: 'not_found' }, 404);
  const { results: members } = await env.DB.prepare(
    `SELECT egm.*, u.name AS user_name, u.email AS user_email FROM expert_group_members egm
     JOIN users u ON u.id = egm.user_id WHERE egm.expert_group_id = ? ORDER BY egm.created_at ASC`
  ).bind(id).all();
  return json({ group, members });
}

export async function handleExpertGroupMemberAdd(request, env, { json, writeAudit, auth, id }) {
  const group = await env.DB.prepare(`SELECT id FROM expert_groups WHERE id = ? AND company_id = ?`).bind(id, auth.company_id).first();
  if (!group) return json({ error: 'not_found' }, 404);
  const body = await request.json();
  if (!body.user_id) return json({ error: 'missing_fields', required: ['user_id'] }, 400);
  // Eklenecek kullanıcı GERÇEKTEN bu şirkete ait mi? İstemciden gelen
  // user_id'ye körü körüne güvenilmez (leads.customer_id doğrulama deseniyle
  // AYNI ilke).
  const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND company_id = ?`).bind(body.user_id, auth.company_id).first();
  if (!user) return json({ error: 'invalid_user_id' }, 400);
  const n = await activeMemberCount(env, id);
  if (n >= MAX_ACTIVE_EXPERTS_PER_GROUP) {
    return json({ error: 'max_active_experts_reached', limit: MAX_ACTIVE_EXPERTS_PER_GROUP }, 400);
  }
  const scopeType = ['company', 'project', 'topic'].includes(body.scope_type) ? body.scope_type : 'company';
  const memberId = generateId('expmem');
  try {
    await env.DB.prepare(
      `INSERT INTO expert_group_members (id, expert_group_id, user_id, scope_type, scope_project_id, scope_topic, approval_limit, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
    ).bind(memberId, id, body.user_id, scopeType, body.scope_project_id || null, body.scope_topic || null, body.approval_limit ?? null).run();
  } catch (e) {
    // UNIQUE(expert_group_id, user_id) — aynı kullanıcı iki kez eklenemez.
    return json({ error: 'already_member' }, 409);
  }
  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'expert_group_member.add', entity_type: 'expert_group', entity_id: id, new_value: body, request });
  return json({ id: memberId }, 201);
}

export async function handleExpertGroupMemberUpdate(request, env, { json, writeAudit, auth, id, memberId }) {
  const group = await env.DB.prepare(`SELECT id FROM expert_groups WHERE id = ? AND company_id = ?`).bind(id, auth.company_id).first();
  if (!group) return json({ error: 'not_found' }, 404);
  const member = await env.DB.prepare(`SELECT * FROM expert_group_members WHERE id = ? AND expert_group_id = ?`).bind(memberId, id).first();
  if (!member) return json({ error: 'not_found' }, 404);
  const body = await request.json();
  if (body.active === true && !member.active) {
    const n = await activeMemberCount(env, id);
    if (n >= MAX_ACTIVE_EXPERTS_PER_GROUP) {
      return json({ error: 'max_active_experts_reached', limit: MAX_ACTIVE_EXPERTS_PER_GROUP }, 400);
    }
  }
  const fields = ['scope_type', 'scope_project_id', 'scope_topic', 'approval_limit', 'active'];
  const sets = [], vals = [];
  for (const f of fields) if (f in body) { sets.push(`${f} = ?`); vals.push(f === 'active' ? (body.active ? 1 : 0) : body[f]); }
  if (!sets.length) return json({ error: 'no_fields' }, 400);
  vals.push(memberId);
  await env.DB.prepare(`UPDATE expert_group_members SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'expert_group_member.update', entity_type: 'expert_group', entity_id: id, old_value: member, new_value: body, request });
  return json({ ok: true });
}

// ---------------------------------------------------------------------
// EXPERT QUERIES + ANSWERS
// ---------------------------------------------------------------------

function eligibleMember(member, query) {
  if (!member.active) return false;
  if (member.scope_type === 'company') return true;
  if (member.scope_type === 'project') return !!query.project_id && member.scope_project_id === query.project_id;
  if (member.scope_type === 'topic') return !!query.topic && member.scope_topic === query.topic;
  return false;
}

export async function handleExpertQueryCreate(request, env, { json, writeAudit, companyId, requestedByUserId }) {
  const body = await request.json();
  if (!body.conversation_id || !body.expert_group_id || !body.question_text) {
    return json({ error: 'missing_fields', required: ['conversation_id', 'expert_group_id', 'question_text'] }, 400);
  }
  const group = await env.DB.prepare(`SELECT id FROM expert_groups WHERE id = ? AND company_id = ?`).bind(body.expert_group_id, companyId).first();
  if (!group) return json({ error: 'invalid_expert_group_id' }, 400);
  const conversation = await env.DB.prepare(`SELECT id FROM conversations WHERE id = ? AND company_id = ?`).bind(body.conversation_id, companyId).first();
  if (!conversation) return json({ error: 'invalid_conversation_id' }, 400);
  // Review bulgusu: customer_id/project_id/unit_id de, expert_group_id/
  // conversation_id ile AYNI ilkeyle (leads.customer_id deseni) bu şirkete
  // ait olduğu doğrulanmadan yazılıyordu — sessizce null'a düşürülüyor,
  // isteği REDDETMİYOR (lead oluşturmayı engellememesi gibi).
  let customerId = null;
  if (body.customer_id) {
    const c = await env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND company_id = ?`).bind(body.customer_id, companyId).first();
    if (c) customerId = c.id;
  }
  let projectId = null;
  if (body.project_id) {
    const p = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND company_id = ?`).bind(body.project_id, companyId).first();
    if (p) projectId = p.id;
  }
  let unitId = null;
  if (body.unit_id) {
    const u = await env.DB.prepare(`SELECT id FROM units WHERE id = ? AND company_id = ?`).bind(body.unit_id, companyId).first();
    if (u) unitId = u.id;
  }

  const category = body.category === 'commercial_approval' ? 'commercial_approval' : 'info';
  const queryContext = { project_id: projectId, topic: body.topic || null };
  const { results: members } = await env.DB.prepare(
    `SELECT * FROM expert_group_members WHERE expert_group_id = ?`
  ).bind(body.expert_group_id).all();
  const eligible = members.filter((m) => eligibleMember(m, queryContext)).slice(0, MAX_ACTIVE_EXPERTS_PER_GROUP);
  if (!eligible.length) return json({ error: 'no_eligible_experts' }, 422);

  const timeoutMinutes = Number(body.timeout_minutes) > 0 ? Number(body.timeout_minutes) : DEFAULT_QUERY_TIMEOUT_MINUTES;
  const timeoutAt = new Date(Date.now() + timeoutMinutes * 60000).toISOString();
  const id = generateId('expq');
  // required_valid_answers şu an kabul edilip saklanıyor ama 1. turda
  // DAVRANIŞSAL bir etkisi YOK — atomik kabul her zaman İLK cevapta durur
  // (tasarımın §13 kademeli planına göre "N geçerli cevap" mantığı ileride
  // eklenecek şema alanı, bilerek şimdiden hazırlandı).
  await env.DB.prepare(
    `INSERT INTO expert_queries (id, company_id, conversation_id, customer_id, project_id, unit_id, expert_group_id, question_text, category, topic, required_valid_answers, sent_to, status, timeout_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
  ).bind(
    id, companyId, body.conversation_id, customerId, projectId, unitId,
    body.expert_group_id, body.question_text, category, body.topic || null,
    Number(body.required_valid_answers) > 0 ? Number(body.required_valid_answers) : 1,
    JSON.stringify(eligible.map((m) => m.user_id)), timeoutAt
  ).run();
  await writeAudit(env, { company_id: companyId, user_id: requestedByUserId, action: 'expert_query.create', entity_type: 'expert_query', entity_id: id, new_value: { ...body, sent_to: eligible.map((m) => m.user_id) }, request });
  return json({ id, sent_to: eligible.map((m) => m.user_id), timeout_at: timeoutAt }, 201);
}

// Lazy timeout: DO/alarm bu turda YOK (§13 — kademeli rollout, 1. tur
// polling ile çalışır). Bir kayda her erişimde süresi dolmuş 'pending'
// sorgular burada 'unresolved'e çekilir — PresentationLock'un `_isExpired`
// deseniyle AYNI ilke (erişim anında sessiz temizlik).
async function resolveTimeouts(env, rows) {
  const expired = rows.filter((r) => r.status === 'pending' && new Date(r.timeout_at).getTime() < Date.now());
  for (const r of expired) {
    await env.DB.prepare(`UPDATE expert_queries SET status = 'unresolved', resolved_at = datetime('now') WHERE id = ? AND status = 'pending'`).bind(r.id).run();
    r.status = 'unresolved';
  }
  return rows;
}

export async function handleExpertQueriesList(request, env, { json, auth }, url) {
  const assignedToMe = url.searchParams.get('assigned_to_me') === '1';
  if (!assignedToMe) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM expert_queries WHERE company_id = ? ORDER BY created_at DESC LIMIT 200`
    ).bind(auth.company_id).all();
    await resolveTimeouts(env, results);
    return json({ expert_queries: results });
  }
  // Review bulgusu: SADECE expert_group üyeliğine (JOIN) bakmak yetmiyordu
  // — scope_type='project'/'topic' olan bir üye, KENDİ scope'u DIŞINDAKİ
  // sorguları da (soru metni + müşteri bağlantısı dahil) görebiliyordu.
  // handleExpertAnswerSubmit'teki AYNI eligibleMember() ile filtreleniyor —
  // okuma ve yazma yolu artık AYNI tek kaynağa dayanıyor, birbirinden
  // sapamaz.
  const { results: candidates } = await env.DB.prepare(
    `SELECT eq.* FROM expert_queries eq
     JOIN expert_group_members egm ON egm.expert_group_id = eq.expert_group_id
     WHERE eq.company_id = ? AND egm.user_id = ? AND egm.active = 1 AND eq.status = 'pending'
     ORDER BY eq.created_at DESC LIMIT 200`
  ).bind(auth.company_id, auth.sub).all();
  const member = await env.DB.prepare(
    // Bir kullanıcı AYNI grupta yalnızca tek satır olabilir (UNIQUE constraint) —
    // ama farklı gruplarda birden fazla scope'a sahip olabilir, bu yüzden
    // her adayı KENDİ grubundaki üyelik satırına göre ayrı ayrı kontrol ediyoruz.
    `SELECT * FROM expert_group_members WHERE user_id = ? AND active = 1`
  ).bind(auth.sub).all();
  const membersByGroup = {};
  for (const m of member.results) membersByGroup[m.expert_group_id] = m;
  const results = candidates.filter((q) => {
    const m = membersByGroup[q.expert_group_id];
    return !!m && eligibleMember(m, q);
  });
  await resolveTimeouts(env, results);
  return json({ expert_queries: results });
}

export async function handleExpertQueryDetail(request, env, { json, companyId, id }) {
  const q = await env.DB.prepare(`SELECT * FROM expert_queries WHERE id = ? AND company_id = ?`).bind(id, companyId).first();
  if (!q) return json({ error: 'not_found' }, 404);
  await resolveTimeouts(env, [q]);
  const { results: answers } = await env.DB.prepare(`SELECT * FROM expert_answers WHERE expert_query_id = ? ORDER BY created_at ASC`).bind(id).all();
  return json({ expert_query: q, answers });
}

export async function handleExpertAnswerSubmit(request, env, { json, writeAudit, auth }) {
  const body = await request.json();
  if (!body.expert_query_id || !body.answer_text) {
    return json({ error: 'missing_fields', required: ['expert_query_id', 'answer_text'] }, 400);
  }
  const q = await env.DB.prepare(`SELECT * FROM expert_queries WHERE id = ? AND company_id = ?`).bind(body.expert_query_id, auth.company_id).first();
  if (!q) return json({ error: 'not_found' }, 404);
  await resolveTimeouts(env, [q]);
  if (q.status !== 'pending') return json({ error: 'already_resolved', status: q.status }, 409);

  // Yetki kontrolü — SUNUCU tarafında, ASLA istemci beyanına güvenilmez:
  // cevaplayan kişi bu expert_group'un AKTİF üyesi mi VE scope'u sorunun
  // bağlamıyla eşleşiyor mu?
  const member = await env.DB.prepare(
    `SELECT * FROM expert_group_members WHERE expert_group_id = ? AND user_id = ? AND active = 1`
  ).bind(q.expert_group_id, auth.sub).first();
  if (!member || !eligibleMember(member, q)) {
    return json({ error: 'unauthorized_expert' }, 403);
  }

  const answerId = generateId('expans');
  // Atomik kabul: UPDATE'in KENDİSİ 'pending' şartına bağlı — approval_requests/
  // units ile AYNI desen. İki eşzamanlı cevaptan yalnızca biri satırı etkiler.
  const result = await env.DB.prepare(
    `UPDATE expert_queries SET status = 'answered', accepted_answer_id = ?, resolved_at = datetime('now') WHERE id = ? AND status = 'pending'`
  ).bind(answerId, q.id).run();
  const won = !!(result.meta && result.meta.changes > 0);
  await env.DB.prepare(
    `INSERT INTO expert_answers (id, expert_query_id, answered_by, answer_text, attachment_doc_id, result, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(answerId, q.id, auth.sub, body.answer_text, body.attachment_doc_id || null, won ? 'accepted' : 'already_answered').run();
  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: won ? 'expert_query.answered' : 'expert_query.answer_lost_race', entity_type: 'expert_query', entity_id: q.id, new_value: { answer_id: answerId, category: q.category }, request });
  return json({ id: answerId, result: won ? 'accepted' : 'already_answered' }, won ? 201 : 200);
}

// ---------------------------------------------------------------------
// CONVERSATION MEMORIES — rıza kapılı okuma/yazma (tek geçit fonksiyonu)
// ---------------------------------------------------------------------

async function memoryAllowed(env, companyId, customerId) {
  const customer = await env.DB.prepare(`SELECT consent_status FROM customers WHERE id = ? AND company_id = ?`).bind(customerId, companyId).first();
  if (!customer) return false;
  return customer.consent_status !== 'declined';
}

export async function handleCustomerMemoryGet(request, env, { json, companyId, customerId }) {
  const allowed = await memoryAllowed(env, companyId, customerId);
  if (!allowed) return json({ error: 'memory_disabled', reason: 'consent_declined_or_not_found' }, 403);
  const { results } = await env.DB.prepare(
    `SELECT * FROM conversation_memories WHERE company_id = ? AND customer_id = ?
     AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY key_type, updated_at DESC`
  ).bind(companyId, customerId).all();
  return json({ memories: results });
}

export async function handleCustomerMemoryUpsert(request, env, { json, writeAudit, companyId, customerId, actorUserId }) {
  const allowed = await memoryAllowed(env, companyId, customerId);
  if (!allowed) return json({ error: 'memory_disabled', reason: 'consent_declined_or_not_found' }, 403);
  const body = await request.json();
  if (!MEMORY_KEY_TYPES.has(body.key_type) || !body.key || body.value === undefined) {
    return json({ error: 'invalid_fields', required: ['key_type (bilinen tür)', 'key', 'value'] }, 400);
  }
  const id = generateId('convmem');
  await env.DB.prepare(
    `INSERT INTO conversation_memories (id, company_id, customer_id, key_type, key, value, source_conversation_id, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`
  ).bind(id, companyId, customerId, body.key_type, body.key, JSON.stringify(body.value), body.source_conversation_id || null, body.expires_at || null).run();
  await writeAudit(env, { company_id: companyId, user_id: actorUserId, action: 'conversation_memory.create', entity_type: 'customer', entity_id: customerId, new_value: { key_type: body.key_type, key: body.key }, request });
  return json({ id }, 201);
}

// ---------------------------------------------------------------------
// COMPANY KNOWLEDGE CANDIDATES — otomatik yayın YOK, ayrı onay gerekir
// ---------------------------------------------------------------------

export async function handleKnowledgeCandidateCreate(request, env, { json, writeAudit, companyId, actorUserId }) {
  const body = await request.json();
  if (!body.expert_answer_id) return json({ error: 'missing_fields', required: ['expert_answer_id'] }, 400);
  const answer = await env.DB.prepare(
    `SELECT ea.*, eq.company_id AS q_company_id, eq.question_text FROM expert_answers ea
     JOIN expert_queries eq ON eq.id = ea.expert_query_id WHERE ea.id = ? AND ea.result = 'accepted'`
  ).bind(body.expert_answer_id).first();
  if (!answer || answer.q_company_id !== companyId) return json({ error: 'invalid_expert_answer_id' }, 400);
  const scope = ['this_conversation', 'this_customer', 'this_unit', 'this_project', 'company_wide'].includes(body.scope) ? body.scope : 'this_conversation';
  const id = generateId('kc');
  await env.DB.prepare(
    `INSERT INTO company_knowledge_candidates (id, company_id, source_expert_answer_id, question_text, answer_text, scope, source_reference, valid_until, status, answered_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, datetime('now'))`
  ).bind(id, companyId, answer.id, answer.question_text, answer.answer_text, scope, body.source_reference || null, body.valid_until || null, answer.answered_by).run();
  await writeAudit(env, { company_id: companyId, user_id: actorUserId, action: 'knowledge_candidate.create', entity_type: 'company_knowledge_candidate', entity_id: id, new_value: { scope }, request });
  return json({ id }, 201);
}

export async function handleKnowledgeCandidatePublish(request, env, { json, writeAudit, auth, id }) {
  const candidate = await env.DB.prepare(`SELECT * FROM company_knowledge_candidates WHERE id = ? AND company_id = ?`).bind(id, auth.company_id).first();
  if (!candidate) return json({ error: 'not_found' }, 404);
  if (candidate.status !== 'pending_review') return json({ error: 'already_decided', status: candidate.status }, 409);
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'reject' ? 'rejected' : 'published';
  const result = await env.DB.prepare(
    `UPDATE company_knowledge_candidates SET status = ?, approved_by = ? WHERE id = ? AND status = 'pending_review'`
  ).bind(decision, auth.sub, id).run();
  if (!result.meta || result.meta.changes === 0) return json({ error: 'already_decided' }, 409);
  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'knowledge_candidate.' + decision, entity_type: 'company_knowledge_candidate', entity_id: id, request });
  return json({ ok: true, status: decision });
}

export async function handleKnowledgeCandidatesList(request, env, { json, auth }, url) {
  const scope = url.searchParams.get('scope');
  let query = `SELECT * FROM company_knowledge_candidates WHERE company_id = ?`;
  const params = [auth.company_id];
  if (scope) { query += ` AND scope = ?`; params.push(scope); }
  query += ` ORDER BY created_at DESC LIMIT 200`;
  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ knowledge_candidates: results });
}
