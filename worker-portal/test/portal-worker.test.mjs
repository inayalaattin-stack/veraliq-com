// worker-portal/test/portal-worker.test.mjs
//
// portal-api-worker.js'i GERÇEK wrangler/miniflare olmadan test etmek için
// yazılmış hafif bir D1 + Durable Object "shim" (taklit) katmanı. Bu sandbox
// ortamında `npx wrangler`/miniflare npm registry'ye erişemediği için
// (403 proxy hatası) kurulamadı — bu dosya, worker'ın GERÇEK kaynak kodunu
// (portal-api-worker.js, presentation-lock-do.js, auth.js) Node'un deneysel
// yerleşik `node:sqlite` modülü üzerinde GERÇEK SQL semantiğiyle çalıştırarak
// doğrular. Wrangler.toml binding'lerini veya Cloudflare'ın gerçek Durable
// Object eşzamanlılık garantilerini test ETMEZ — yalnızca uygulama mantığını
// (tenant izolasyonu, state machine, race-condition, auth) doğrular.
//
// Çalıştırma:  cd worker-portal/test && node --experimental-sqlite portal-worker.test.mjs
//
// Cloudflare'a gerçek deploy sonrası ek olarak GERÇEK ortamda da (wrangler
// dev veya canlı) manuel/entegrasyon testi yapılması önerilir — bkz.
// worker-portal/README.md.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { PresentationLock } from '../portal-api-worker.js';

// ---- D1 shim over node:sqlite ---------------------------------------------
class BoundStmt {
  constructor(db, sql, params) { this.db = db; this.sql = sql; this.params = params; }
  async run() {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.params);
    return { success: true, meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
  }
  async all() {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...this.params);
    return { results: rows };
  }
  async first() {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params);
    return row === undefined ? null : row;
  }
}
class PrepStmt {
  constructor(db, sql) { this.db = db; this.sql = sql; }
  bind(...params) { return new BoundStmt(this.db, this.sql, params); }
  // allow .run() with no bind (no params)
  async run() { return new BoundStmt(this.db, this.sql, []).run(); }
}
class D1Shim {
  constructor(db) { this.db = db; }
  prepare(sql) { return new PrepStmt(this.db, sql); }
  async batch(stmts) {
    const results = [];
    for (const s of stmts) results.push(await s.run());
    return results;
  }
}

// ---- Durable Object shim ----------------------------------------------------
class MemStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k); }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
}
class DOStub {
  constructor(instance) { this.instance = instance; }
  async fetch(url, init) {
    const req = new Request(url, init);
    return this.instance.fetch(req);
  }
}
class DONamespaceShim {
  constructor() { this.instances = new Map(); }
  idFromName(name) { return name; }
  get(id) {
    if (!this.instances.has(id)) {
      const state = { storage: new MemStorage() };
      this.instances.set(id, new DOStub(new PresentationLock(state, {})));
    }
    return this.instances.get(id);
  }
}

// ---- Setup DB ----------------------------------------------------------------
const db = new DatabaseSync(':memory:');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
db.exec(schema);
const seed = readFileSync(new URL('../seed.sql', import.meta.url), 'utf8');
db.exec(seed);

const env = {
  DB: new D1Shim(db),
  PRESENTATION_LOCK: new DONamespaceShim(),
  JWT_SECRET: 'test-jwt-secret',
  AGENT_SHARED_SECRET: 'test-agent-secret',
};

function req(method, path, body, headers) {
  return new Request('https://portal-api.test' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'https://veraliq.com', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('PASS:', label); }
  else { fail++; console.log('FAIL:', label, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const run = async () => {
  // 1. Admin login
  let r = await worker.fetch(req('POST', '/api/auth/admin/login', { email: 'admin@veraliq.com', password: 'Veraliq!Admin2026' }), env);
  let data = await r.json();
  check('admin login succeeds', r.status === 200 && !!data.token, data);
  const adminToken = data.token;

  r = await worker.fetch(req('POST', '/api/auth/admin/login', { email: 'admin@veraliq.com', password: 'wrong' }), env);
  check('admin login wrong password rejected', r.status === 401);

  // 2. Company login (seeded ABC İnşaat)
  r = await worker.fetch(req('POST', '/api/auth/company/login', { email: 'abcinsaat@veraliq.com', password: 'Abc12345!' }), env);
  data = await r.json();
  check('company login succeeds', r.status === 200 && !!data.token && data.company.name === 'ABC İnşaat', data);
  const ownerToken = data.token;

  // 3. Tenant isolation: create a SECOND company via admin, verify its owner can't see ABC's projects
  r = await worker.fetch(req('POST', '/api/companies', {
    name: 'XYZ Gayrimenkul', slug: 'xyz-gayrimenkul', owner_email: 'xyz@veraliq.com', owner_password: 'Xyz12345!'
  }, { Authorization: 'Bearer ' + adminToken }), env);
  data = await r.json();
  check('admin can create second company', r.status === 201 && !!data.id, data);

  r = await worker.fetch(req('POST', '/api/auth/company/login', { email: 'xyz@veraliq.com', password: 'Xyz12345!' }), env);
  data = await r.json();
  const xyzToken = data.token;
  check('second company login succeeds', r.status === 200 && !!xyzToken);

  r = await worker.fetch(req('POST', '/api/companies', {
    name: 'Duplicate Co', slug: 'duplicate-co', owner_email: 'xyz@veraliq.com', owner_password: 'Whatever1!'
  }, { Authorization: 'Bearer ' + adminToken }), env);
  check('EMAIL UNIQUENESS: duplicate owner_email across companies rejected (409)', r.status === 409);

  r = await worker.fetch(req('GET', '/api/projects', null, { Authorization: 'Bearer ' + xyzToken }), env);
  data = await r.json();
  check('TENANT ISOLATION: XYZ sees zero projects (not ABC\'s)', r.status === 200 && Array.isArray(data.projects) && data.projects.length === 0, data);

  r = await worker.fetch(req('GET', '/api/projects', null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('ABC owner sees its own seeded project', r.status === 200 && data.projects.length === 1 && data.projects[0].name === 'ABC Vadi Konutları', data);
  const projectId = data.projects[0].id;

  // 4. Cross-tenant access attempt: XYZ tries to read ABC's project directly by id
  r = await worker.fetch(req('GET', `/api/projects/${projectId}`, null, { Authorization: 'Bearer ' + xyzToken }), env);
  check('CROSS-TENANT BLOCK: XYZ cannot read ABC project by id (403)', r.status === 403);

  // 5. Units listing + invalid status transition rejected
  r = await worker.fetch(req('GET', `/api/projects/${projectId}/units`, null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('ABC owner sees 5 seeded units', r.status === 200 && data.units.length === 5, data);
  const availableUnit = data.units.find(u => u.status === 'AVAILABLE');
  const soldUnit = data.units.find(u => u.status === 'SOLD');

  r = await worker.fetch(req('PATCH', `/api/units/${soldUnit.id}`, { status: 'AVAILABLE' }, { Authorization: 'Bearer ' + ownerToken }), env);
  check('STATE MACHINE: SOLD -> AVAILABLE transition rejected', r.status === 400);

  r = await worker.fetch(req('PATCH', `/api/units/${availableUnit.id}`, { status: 'HOLD' }, { Authorization: 'Bearer ' + ownerToken }), env);
  check('STATE MACHINE: AVAILABLE -> HOLD transition allowed', r.status === 200);
  // revert for lock test below
  await worker.fetch(req('PATCH', `/api/units/${availableUnit.id}`, { status: 'AVAILABLE' }, { Authorization: 'Bearer ' + ownerToken }), env);

  // 6. PRESENTATION LOCK — race condition test (the most critical spec requirement)
  const lockUrl = `/api/units/${availableUnit.id}/lock`;
  const [lockA, lockB] = await Promise.all([
    worker.fetch(req('POST', lockUrl, { session_id: 'sess-A', agent_id: 'agentA', agent_type: 'AI', customer_id: 'cust1' }, { 'X-Agent-Key': 'test-agent-secret' }), env),
    worker.fetch(req('POST', lockUrl, { session_id: 'sess-B', agent_id: 'agentB', agent_type: 'AI', customer_id: 'cust2' }, { 'X-Agent-Key': 'test-agent-secret' }), env),
  ]);
  const dataA = await lockA.json();
  const dataB = await lockB.json();
  const winners = [lockA.status === 200, lockB.status === 200].filter(Boolean).length;
  check('RACE CONDITION: exactly ONE of two concurrent lock requests wins', winners === 1, { statusA: lockA.status, statusB: lockB.status, dataA, dataB });

  // Verify unit status actually flipped to PRESENTATION in D1
  r = await worker.fetch(req('GET', `/api/units/${availableUnit.id}`, null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('unit status updated to PRESENTATION after lock', data.unit.status === 'PRESENTATION', data.unit);

  // Agent key required for lock endpoint
  r = await worker.fetch(req('POST', lockUrl, { session_id: 'sess-C' }, { 'X-Agent-Key': 'WRONG-KEY' }), env);
  check('lock endpoint rejects wrong agent key', r.status === 401);

  // Unlock by the winning session
  const winnerSession = dataA.ok ? 'sess-A' : 'sess-B';
  r = await worker.fetch(req('POST', `/api/units/${availableUnit.id}/unlock`, { session_id: winnerSession }, { 'X-Agent-Key': 'test-agent-secret' }), env);
  data = await r.json();
  check('unlock by lock owner succeeds', r.status === 200 && data.ok === true, data);

  r = await worker.fetch(req('GET', `/api/units/${availableUnit.id}`, null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('unit status reverted to AVAILABLE after unlock', data.unit.status === 'AVAILABLE', data.unit);

  // 7. Approval engine: AI agent requests, only company_owner can decide
  r = await worker.fetch(req('POST', '/api/approvals', { company_id: 'co_swo61xr4midp', type: 'discount', related_id: availableUnit.id, amount: 50000, notes: 'Müşteri özel indirim istiyor' }, { 'X-Agent-Key': 'test-agent-secret' }), env);
  data = await r.json();
  check('AI agent can create approval request', r.status === 201 && !!data.id, data);
  const approvalId = data.id;

  r = await worker.fetch(req('POST', `/api/approvals/${approvalId}/decide`, { decision: 'approved' }, { Authorization: 'Bearer ' + xyzToken }), env);
  check('SECURITY: XYZ owner cannot decide ABC\'s approval (cross-tenant)', r.status === 404);

  r = await worker.fetch(req('POST', `/api/approvals/${approvalId}/decide`, { decision: 'approved' }, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('ABC owner can approve its own approval request', r.status === 200 && data.status === 'approved', data);

  r = await worker.fetch(req('POST', `/api/approvals/${approvalId}/decide`, { decision: 'rejected' }, { Authorization: 'Bearer ' + ownerToken }), env);
  check('cannot re-decide an already-decided approval', r.status === 409);

  // 8. Audit log recorded key actions
  r = await worker.fetch(req('GET', '/api/audit-log', null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  const actions = data.entries.map(e => e.action);
  check('audit log recorded presentation_lock', actions.includes('unit.presentation_lock'), actions);
  check('audit log recorded approval.approved', actions.includes('approval.approved'), actions);

  // 9. Unauthenticated access rejected
  r = await worker.fetch(req('GET', '/api/projects', null, {}), env);
  check('no token -> 401', r.status === 401);

  // 10. Admin can create a project on behalf of a company (admin.html use case)
  r = await worker.fetch(req('POST', '/api/projects', { company_id: 'co_swo61xr4midp', name: 'Admin Eklenen Proje' }, { Authorization: 'Bearer ' + adminToken }), env);
  data = await r.json();
  check('admin can create project for a company via company_id', r.status === 201 && !!data.id, data);

  r = await worker.fetch(req('POST', '/api/projects', { name: 'No Company Id' }, { Authorization: 'Bearer ' + adminToken }), env);
  check('admin creating project WITHOUT company_id is rejected', r.status === 400);

  // 11. Company-wide units listing (Inventory/Sales/Presentations/Reservations menus)
  r = await worker.fetch(req('GET', '/api/units', null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('GET /api/units returns all company units across projects', r.status === 200 && data.units.length === 5, data);

  r = await worker.fetch(req('GET', '/api/units?status=SOLD', null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('GET /api/units?status=SOLD filters correctly', r.status === 200 && data.units.length === 2 && data.units.every(u => u.status === 'SOLD'), data);

  r = await worker.fetch(req('GET', '/api/units', null, { Authorization: 'Bearer ' + xyzToken }), env);
  data = await r.json();
  check('TENANT ISOLATION: XYZ sees zero units via /api/units', r.status === 200 && data.units.length === 0, data);

  // 12. Dashboard — real aggregate numbers
  r = await worker.fetch(req('GET', '/api/dashboard', null, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('dashboard reports 2 sales (SOLD units)', r.status === 200 && data.sales === 2, data);
  check('dashboard reports correct revenue (5200000 + 5250000)', data.revenue === 10450000, data);
  check('dashboard reports active_stock (AVAILABLE units)', data.active_stock === 2, data);

  // 13. Company AI Assistant — deterministic real-data query engine
  r = await worker.fetch(req('POST', '/api/assistant/query', { question: 'Bugün kaç satış yaptık?' }, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('assistant answers sales question with real numbers', r.status === 200 && /2 birim satıldı/.test(data.answer), data);

  r = await worker.fetch(req('POST', '/api/assistant/query', { question: 'ABC Vadi Konutları kaç daire kaldı?' }, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('assistant resolves project name and answers with real stock count', r.status === 200 && /2 adet/.test(data.answer), data);

  // 14. Team management (company_owner invites company_staff, scoped to own company)
  r = await worker.fetch(req('POST', '/api/team', { email: 'staff1@veraliq.com', password: 'Staff123!', name: 'Ayşe Yılmaz' }, { Authorization: 'Bearer ' + ownerToken }), env);
  data = await r.json();
  check('company_owner can invite team member', r.status === 201 && !!data.id, data);
  const staffUserId = data.id;

  r = await worker.fetch(req('POST', '/api/auth/company/login', { email: 'staff1@veraliq.com', password: 'Staff123!' }), env);
  check('newly invited staff can log in', r.status === 200);

  r = await worker.fetch(req('GET', '/api/team', null, { Authorization: 'Bearer ' + xyzToken }), env);
  data = await r.json();
  check('TENANT ISOLATION: XYZ team list does not include ABC staff', r.status === 200 && !data.team.some(u => u.id === staffUserId), data);

  r = await worker.fetch(req('DELETE', `/api/team/${staffUserId}`, null, { Authorization: 'Bearer ' + ownerToken }), env);
  check('company_owner can remove a team member', r.status === 200);

  // 15. Self-service password change
  r = await worker.fetch(req('POST', '/api/auth/change-password', { current_password: 'Abc12345!', new_password: 'NewPass123!' }, { Authorization: 'Bearer ' + ownerToken }), env);
  check('user can change own password with correct current password', r.status === 200);

  r = await worker.fetch(req('POST', '/api/auth/company/login', { email: 'abcinsaat@veraliq.com', password: 'NewPass123!' }), env);
  check('login works with new password after change', r.status === 200);

  r = await worker.fetch(req('POST', '/api/auth/company/login', { email: 'abcinsaat@veraliq.com', password: 'Abc12345!' }), env);
  check('login rejected with OLD password after change', r.status === 401);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
};

run().catch(e => { console.error('TEST HARNESS CRASHED:', e); process.exit(1); });
