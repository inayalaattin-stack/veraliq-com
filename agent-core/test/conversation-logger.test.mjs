// agent-core/test/conversation-logger.test.mjs
//
// ConversationLogger, gerçek bir tarayıcı/worker olmadan test edilir: global
// `fetch` ve `sessionStorage` burada elle sahtelenir (mock). Amaç: HTTP
// çağrılarının doğru URL/method/header/body ile yapıldığını, kimlik doğrulama
// yoksa hiç çağrı yapılmadığını, ve bir ağ hatasının ASLA fırlatılmadığını
// (best-effort, non-blocking tasarım ilkesi) doğrulamak.
//
// Çalıştırma: node agent-core/test/conversation-logger.test.mjs

import assert from 'node:assert/strict';
import { ConversationLogger } from '../conversation-logger.js';

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('PASS:', name); })
    .catch((err) => { fail++; console.error('FAIL:', name, '\n   ', err && err.stack || err); });
}

// ---- fetch/sessionStorage sahtecileri ----
let calls = [];
let sessionStore = {};
let nextResponse = null; // {ok, status, json: () => Promise<any>} | function returning that | 'throw'

global.sessionStorage = {
  getItem: (k) => (k in sessionStore ? sessionStore[k] : null),
  setItem: (k, v) => { sessionStore[k] = v; },
  clear: () => { sessionStore = {}; },
};

global.fetch = async (url, options) => {
  calls.push({ url, options });
  if (nextResponse === 'throw') throw new Error('network_down');
  if (typeof nextResponse === 'function') return nextResponse();
  return nextResponse;
};

function resetMocks() {
  calls = [];
  sessionStore = {};
  nextResponse = { ok: true, status: 200, json: async () => ({}) };
}

await test('start(): JWT yoksa hiçbir ağ çağrısı yapılmaz (401 spam engellenir)', async () => {
  resetMocks();
  const logger = new ConversationLogger({ tokenKey: 'veraliq_company_jwt', channel: 'portal' });
  await logger.start();
  assert.equal(calls.length, 0);
  assert.equal(logger.conversationId, null);
});

await test('start(): JWT varsa doğru URL/method/Authorization header/body ile POST atar ve conversationId set eder', async () => {
  resetMocks();
  sessionStore['veraliq_company_jwt'] = 'FAKE.JWT.TOKEN';
  nextResponse = { ok: true, status: 201, json: async () => ({ id: 'conv_abc123' }) };
  const logger = new ConversationLogger({ tokenKey: 'veraliq_company_jwt', agentPersona: 'Şirket Yönetim Asistanı', provider: 'companyAssistant', channel: 'portal' });
  await logger.start();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://veraliq-portal-api.veraliq-com.workers.dev/api/conversations');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer FAKE.JWT.TOKEN');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.agent_persona, 'Şirket Yönetim Asistanı');
  assert.equal(body.provider, 'companyAssistant');
  assert.equal(body.channel, 'portal');
  assert.equal(logger.conversationId, 'conv_abc123');
});

await test('start(): agentKey (JWT yokken) X-Agent-Key header ile dener', async () => {
  resetMocks();
  nextResponse = { ok: true, status: 201, json: async () => ({ id: 'conv_xyz' }) };
  const logger = new ConversationLogger({ agentKey: 'shared-secret-123' });
  await logger.start();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['X-Agent-Key'], 'shared-secret-123');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

await test('appendMessage(): conversationId yoksa (start hiç çağrılmadı/başarısız oldu) hiçbir çağrı yapmaz', async () => {
  resetMocks();
  const logger = new ConversationLogger({ tokenKey: 'veraliq_company_jwt' });
  await logger.appendMessage('customer', 'merhaba');
  assert.equal(calls.length, 0);
});

await test('appendMessage(): conversationId varsa doğru path + role/text body ile POST atar', async () => {
  resetMocks();
  sessionStore['veraliq_company_jwt'] = 'TOK';
  nextResponse = { ok: true, status: 201, json: async () => ({ id: 'conv_1' }) };
  const logger = new ConversationLogger({ tokenKey: 'veraliq_company_jwt' });
  await logger.start();
  await logger.appendMessage('customer', '3+1 daire arıyorum');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://veraliq-portal-api.veraliq-com.workers.dev/api/conversations/conv_1/messages');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.role, 'customer');
  assert.equal(body.text, '3+1 daire arıyorum');
});

await test('end(): yalnızca bir kez çağrılır (idempotent) — ikinci çağrı ağ isteği yapmaz', async () => {
  resetMocks();
  sessionStore['veraliq_company_jwt'] = 'TOK';
  nextResponse = { ok: true, status: 201, json: async () => ({ id: 'conv_2' }) };
  const logger = new ConversationLogger({ tokenKey: 'veraliq_company_jwt' });
  await logger.start();
  await logger.end();
  await logger.end();
  const endCalls = calls.filter((c) => c.url.endsWith('/end'));
  assert.equal(endCalls.length, 1);
});

await test('ağ hatası (fetch throw) HİÇBİR YÖNTEMDE dışarı fırlamaz — best-effort tasarım', async () => {
  resetMocks();
  sessionStore['veraliq_company_jwt'] = 'TOK';
  nextResponse = 'throw';
  const logger = new ConversationLogger({ tokenKey: 'veraliq_company_jwt' });
  await logger.start(); // throw etmemeli
  assert.equal(logger.conversationId, null); // response hiç gelmedi
  await logger.appendMessage('agent', 'merhaba'); // conversationId yok, zaten no-op
  await logger.end(); // conversationId yok, zaten no-op
});

await test('401 dönerse (JWT geçersiz/rol uyuşmuyor) conversationId set edilmez, fırlatmaz', async () => {
  resetMocks();
  sessionStore['veraliq_admin_jwt'] = 'ADMIN.TOK'; // admin.html'in tam senaryosu: yanlış rol
  nextResponse = { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
  const logger = new ConversationLogger({ tokenKey: 'veraliq_admin_jwt', channel: 'admin' });
  await logger.start();
  assert.equal(logger.conversationId, null);
});

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
