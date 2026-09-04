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

// RBAC GENİŞLEMESİ (2026-08-27, 65 maddelik master promptun RBAC maddesi —
// Owner/Admin/Manager/Sales Manager/Sales Agent/Viewer). Mevcut üç rol
// (veraliq_admin/company_owner/company_staff) HİÇBİR ŞEKİLDE DEĞİŞMEDİ —
// tamamen geriye uyumlu, aşağıdaki dört rol YENİ ve EK.
//
// "Tier" (temel erişim katmanı) mantığı: bir route'un allowedRoles listesi
// 'company_staff' içeriyorsa, bu dört yeni rol de (bugün için) company_staff
// ile AYNI temel erişimi görür — company_manager/sales_manager/sales_agent
// için satır-seviyesi (yalnızca kendi lead'i vb.) bir kısıtlama HENÜZ YOK,
// bu dürüstçe SECURITY.md'de işaretlendi. Bir route'un allowedRoles listesi
// yalnızca 'company_owner' içeriyorsa (ör. takım/şirket ayarları yönetimi),
// bu dört yeni rol OTOMATİK OLARAK ERİŞEMEZ — genişletilmiş erişim yalnızca
// KOD İÇİNDE AÇIKÇA eklendiği yerlerde var (ör. company_manager'ın onay
// verebilmesi, aşağıda /api/approvals/:id/decide'a elle eklendi).
//
// company_viewer İSTİSNA: bu tek rol için GERÇEKTEN ENFORCE EDİLEN bir
// kısıtlama var — GET dışındaki hiçbir metod kabul edilmez, allowedRoles ne
// olursa olsun (route kendi içinde auth.role'ü ayrıca kontrol etse bile,
// buradan zaten null dönüp 401 alır).
const COMPANY_ROLE_BASE_TIER = {
  company_manager: 'company_staff',
  company_sales_manager: 'company_staff',
  company_sales_agent: 'company_staff',
  company_viewer: 'company_staff',
};
const COMPANY_EXTENDED_ROLES = ['company_manager', 'company_sales_manager', 'company_sales_agent', 'company_viewer'];

// Verilen isteğin JWT'sini doğrular. allowedRoles boşsa herhangi bir
// oturum açmış kullanıcı geçer. Döner: {sub, company_id, role} ya da null.
async function requireAuth(request, env, allowedRoles) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return null;
  if (payload.role === 'company_viewer' && request.method !== 'GET') return null;
  if (allowedRoles && allowedRoles.length) {
    const tier = COMPANY_ROLE_BASE_TIER[payload.role];
    if (!allowedRoles.includes(payload.role) && !(tier && allowedRoles.includes(tier))) return null;
  }
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

// Company AI Assistant v1 — deterministik niyet eşleştirme (bkz. yukarıdaki
// /api/assistant/query route'undaki mimari not). Her intent, GERÇEK bir D1
// sorgusu çalıştırır ve cevabı gerçek sayılarla üretir.
function tryMatchProjectName(text) {
  // "ABC Residence'da kaç daire kaldı" gibi cümlelerden proje adını çıkarmaya
  // çalışan basit bir sezgisel: cümledeki büyük harfle başlayan kelime
  // öbeklerini adayı olarak alır, aşağıda gerçek proje listesiyle karşılaştırılır.
  // GÜNCELLEME (2026-08-27, çok dilli asistan): proje adları Rusça arayüzde de
  // Latin harfli marka isimleri olabileceği için Kiril büyük harfler de EKLENDİ
  // (yalnızca ekleme — mevcut [A-ZÇĞİÖŞÜ] davranışı DEĞİŞMEDİ).
  const m = text.match(/([A-ZÇĞİÖŞÜА-Я][\wçğıöşüа-яё]*(?:\s+[A-ZÇĞİÖŞÜА-Я][\wçğıöşüа-яё]*)*)/);
  return m ? m[1] : null;
}

// ÇOK DİLLİ CEVAP ŞABLONLARI (2026-08-27 eklendi — İmparator: "şirket
// yetkilisi ingilizce veya rusça konuşursa mantıken asistanının o dili
// konuşması gerekir"). ZERO TRUST AI HİÇ DEĞİŞMEDİ: aşağıdaki hâlâ sabit
// metin şablonları + GERÇEK D1 sorgu sonuçları — hiçbir LLM/SQL üretimi yok.
// Mevcut Türkçe cevap metinleri (aşağıdaki `tr` alanları) BİREBİR AYNI
// kaldı — bu tamamen EKLEME, davranış değişikliği değil.
const ASSISTANT_ANSWERS = {
  pendingApprovals: {
    tr: (n) => (n > 0 ? `Şu anda ${n} bekleyen onay talebiniz var.` : 'Bekleyen onay talebiniz yok.'),
    en: (n) => (n > 0 ? `You currently have ${n} pending approval request(s).` : 'You have no pending approval requests.'),
    ru: (n) => (n > 0 ? `У вас сейчас ${n} запрос(ов) на одобрение, ожидающих решения.` : 'У вас нет запросов на одобрение, ожидающих решения.'),
  },
  leadsToday: {
    tr: (n) => `Bugün ${n} yeni lead geldi.`,
    en: (n) => `${n} new lead(s) came in today.`,
    ru: (n) => `Сегодня поступило новых лидов: ${n}.`,
  },
  leadsTotal: {
    tr: (n) => `Toplam ${n} lead kayıtlı.`,
    en: (n) => `A total of ${n} leads are recorded.`,
    ru: (n) => `Всего зарегистрировано лидов: ${n}.`,
  },
  salesSummary: {
    tr: (n, total) => `Toplam ${n} birim satıldı, toplam ciro ${Number(total).toLocaleString('tr-TR')} TL.`,
    en: (n, total) => `A total of ${n} unit(s) sold, total revenue ${Number(total).toLocaleString('en-US')} TL.`,
    ru: (n, total) => `Всего продано юнитов: ${n}, общая выручка: ${Number(total).toLocaleString('ru-RU')} TL.`,
  },
  presentationsSome: {
    tr: (n) => `Şu anda ${n} birim sunum halinde.`,
    en: (n) => `${n} unit(s) currently in presentation.`,
    ru: (n) => `Сейчас на показе юнитов: ${n}.`,
  },
  presentationsNone: {
    tr: () => 'Şu anda sunumda olan birim yok.',
    en: () => 'No units are currently in presentation.',
    ru: () => 'Сейчас нет юнитов на показе.',
  },
  stockProject: {
    tr: (name, n) => `${name} projesinde ${n} adet boşta (satılabilir) daire var.`,
    en: (name, n) => `Project ${name} has ${n} available (sellable) unit(s).`,
    ru: (name, n) => `В проекте ${name} свободных (доступных для продажи) юнитов: ${n}.`,
  },
  stockTotal: {
    tr: (n) => `Tüm projelerde toplam ${n} adet boşta (satılabilir) birim var.`,
    en: (n) => `Across all projects, there are ${n} available (sellable) unit(s) in total.`,
    ru: (n) => `Во всех проектах свободных (доступных) юнитов: ${n}.`,
  },
  reservations: {
    tr: (n) => `Şu anda ${n} birim rezerve durumda.`,
    en: (n) => `${n} unit(s) are currently reserved.`,
    ru: (n) => `Сейчас забронировано юнитов: ${n}.`,
  },
  fallback: {
    tr: () => 'Bu soruyu şu an anlayamadım. Şunları sorabilirsiniz: "bugün kaç lead geldi", "bekleyen onaylar", "bugünkü satışlar", "<proje adı> kaç daire kaldı", "sunumda kaç birim var", "kaç birim rezerve".',
    en: () => 'I couldn\'t understand that question. You can ask things like: "how many leads today", "pending approvals", "today\'s sales", "how many units left in <project name>", "how many units in presentation", "how many units reserved".',
    ru: () => 'Не удалось понять этот вопрос. Можно спросить, например: "сколько лидов сегодня", "ожидающие одобрения", "сегодняшние продажи", "сколько юнитов осталось в <название проекта>", "сколько юнитов на показе", "сколько юнитов забронировано".',
  },
};
function A(key, lang) {
  const bucket = ASSISTANT_ANSWERS[key];
  return (bucket && (bucket[lang] || bucket.tr)) || (() => '');
}

async function answerAssistantQuery(env, companyId, questionRaw, langRaw) {
  const lang = (langRaw === 'en' || langRaw === 'ru') ? langRaw : 'tr';
  // qTr: orijinal Türkçe davranış İÇİN DOKUNULMADI (tr-TR locale, dotless-I
  // doğru işlensin diye). qStd: İngilizce/Rusça anahtar kelime eşleştirmesi
  // için standart (locale'siz) küçük harfe çevirme — tr-TR locale'i
  // "PRESENTATION" gibi İngilizce kelimelerdeki I harfini yanlış (dotless ı)
  // çevirip eşleşmeyi bozar, bu yüzden ayrı tutuluyor.
  const qTr = questionRaw.toLocaleLowerCase('tr-TR');
  const qStd = questionRaw.toLowerCase();

  const isPendingApprovals = /bekleyen onay/.test(qTr) || /pending approval/.test(qStd) || /ожида\S*\s*(одобрен|утвержд)/.test(qStd);
  if (isPendingApprovals) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM approval_requests WHERE company_id = ? AND status = 'pending'`).bind(companyId).first();
    return A('pendingApprovals', lang)(n);
  }

  const isLeadsQuery =
    /(kaç|bugün).*(lead|müşteri)/.test(qTr) || /(lead|müşteri).*kaç/.test(qTr) ||
    /(how many|today).*(lead|customer)/.test(qStd) || /(lead|customer).*(how many)/.test(qStd) ||
    /(сколько|сегодня).*(лид|клиент)/.test(qStd) || /(лид|клиент).*сколько/.test(qStd);
  if (isLeadsQuery) {
    const today = /bugün/.test(qTr) || /today/.test(qStd) || /сегодня/.test(qStd);
    const row = today
      ? await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ? AND date(created_at) = date('now')`).bind(companyId).first()
      : await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ?`).bind(companyId).first();
    return today ? A('leadsToday', lang)(row.n) : A('leadsTotal', lang)(row.n);
  }

  const isSalesQuery =
    /(kaç|bugün|bu ay).*(satış|satıldı)/.test(qTr) || /satış.*(kaç|özet)/.test(qTr) ||
    /(how many|today|this month).*(sale|sold)/.test(qStd) || /sale.*(how many|summary)/.test(qStd) ||
    /(сколько|сегодня|в этом месяце).*(продаж|продан)/.test(qStd) || /продаж.*(сколько|итог)/.test(qStd);
  if (isSalesQuery) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE company_id = ? AND status = 'SOLD'`).bind(companyId).first();
    const { total } = await env.DB.prepare(`SELECT COALESCE(SUM(price), 0) AS total FROM units WHERE company_id = ? AND status = 'SOLD'`).bind(companyId).first();
    return A('salesSummary', lang)(n, total);
  }

  const isPresentationQuery = /sunum/.test(qTr) || /presentation/.test(qStd) || /презентац|показ/.test(qStd);
  if (isPresentationQuery) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE company_id = ? AND status = 'PRESENTATION'`).bind(companyId).first();
    return n > 0 ? A('presentationsSome', lang)(n) : A('presentationsNone', lang)();
  }

  const isStockQuery = /(stok|kaç daire|kaldı)/.test(qTr) || /(stock|how many (units|apartments)|available)/.test(qStd) || /(склад|сколько (юнитов|квартир)|доступн)/.test(qStd);
  if (isStockQuery) {
    const candidate = tryMatchProjectName(questionRaw);
    if (candidate) {
      const project = await env.DB.prepare(`SELECT id, name FROM projects WHERE company_id = ? AND name LIKE ?`).bind(companyId, `%${candidate}%`).first();
      if (project) {
        const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE project_id = ? AND status = 'AVAILABLE'`).bind(project.id).first();
        return A('stockProject', lang)(project.name, n);
      }
    }
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE company_id = ? AND status = 'AVAILABLE'`).bind(companyId).first();
    return A('stockTotal', lang)(n);
  }

  const isReservationQuery = /rezerv/.test(qTr) || /reserv/.test(qStd) || /бронир|резерв/.test(qStd);
  if (isReservationQuery) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE company_id = ? AND status = 'RESERVED'`).bind(companyId).first();
    return A('reservations', lang)(n);
  }

  return A('fallback', lang)();
}

// VERALIQ Admin AI — platform-genelinde (tüm şirketler, company_id filtresi
// YOK) deterministik niyet eşleştirme. Aynı Zero Trust AI ilkesi: hiçbir LLM
// burada SQL üretmiyor, yalnızca bu sabit fonksiyonun eşleştirdiği GERÇEK
// sorgular çalışıyor. Yalnızca veraliq_admin rolü bu uca erişebilir (bkz.
// /api/admin/assistant/query route'u).
async function answerAdminAssistantQuery(env, questionRaw) {
  const q = questionRaw.toLocaleLowerCase('tr-TR');

  if (/kaç şirket|şirket sayısı|toplam şirket/.test(q)) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM companies`).first();
    const { a } = await env.DB.prepare(`SELECT COUNT(*) AS a FROM companies WHERE status = 'active'`).first();
    return `Platformda toplam ${n} şirket kayıtlı, bunlardan ${a} tanesi aktif.`;
  }
  if (/bekleyen onay/.test(q)) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM approval_requests WHERE status = 'pending'`).first();
    return n > 0 ? `Platform genelinde ${n} bekleyen onay talebi var.` : 'Platform genelinde bekleyen onay talebi yok.';
  }
  if (/(kaç|toplam).*(kullanıcı)/.test(q)) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
    return `Platformda toplam ${n} kullanıcı kayıtlı.`;
  }
  if (/(kaç|toplam).*(lead|müşteri)/.test(q)) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads`).first();
    return `Platform genelinde toplam ${n} lead kayıtlı.`;
  }
  if (/(kaç|toplam).*(satış|satıldı|ciro)/.test(q)) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE status = 'SOLD'`).first();
    const { total } = await env.DB.prepare(`SELECT COALESCE(SUM(price), 0) AS total FROM units WHERE status = 'SOLD'`).first();
    return `Platform genelinde toplam ${n} birim satıldı, toplam ciro ${Number(total).toLocaleString('tr-TR')} TL.`;
  }
  if (/(proje sayısı|kaç proje)/.test(q)) {
    const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM projects`).first();
    return `Platformda toplam ${n} proje kayıtlı.`;
  }
  if (/(ai|yapay zeka).*(sunum|görüşme)/.test(q) || /insan.*(sunum|görüşme)/.test(q)) {
    const { n: ai } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'unit.presentation_lock' AND json_extract(new_value, '$.agent_type') = 'ai'`).first();
    const { n: hu } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'unit.presentation_lock' AND json_extract(new_value, '$.agent_type') = 'human'`).first();
    return `Şu ana kadar ${ai} sunum yapay zekâ ajanı tarafından, ${hu} sunum insan temsilci tarafından yapıldı.`;
  }
  if (/sistem sağlığı|health|çalışıyor mu/.test(q)) {
    try {
      await env.DB.prepare('SELECT 1').first();
      return 'Sistem sağlıklı: veritabanı bağlantısı ve API normal çalışıyor.';
    } catch (e) {
      return 'Dikkat: veritabanı bağlantısında bir sorun tespit edildi.';
    }
  }
  return 'Bu soruyu şu an anlayamadım. Şunları sorabilirsiniz: "kaç şirket var", "bekleyen onaylar", "toplam kullanıcı sayısı", "toplam lead sayısı", "toplam satış/ciro", "kaç proje var", "AI mi insan mı daha çok sunum yaptı", "sistem sağlığı nasıl".';
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
      // GÜVENLİK DÜZELTMESİ (2026-08-27, gerçek testle bulundu): bozuk/geçersiz
      // JSON body gönderen bir istemci (ör. `{not valid json`) `request.json()`
      // içinde bir SyntaxError'a çarpıyordu ve bu buraya kadar yükselip
      // "internal_error" (500) olarak dönüyordu — hâlbuki bu SUNUCU hatası
      // değil, tamamen normal bir İSTEMCİ hatası (400). Ayrıca eski davranış
      // ham JSON.parse hata mesajını (`detail`) istemciye sızdırıyordu.
      if (err instanceof SyntaxError) {
        return json({ error: 'invalid_json' }, 400, headers);
      }
      return json({ error: 'internal_error', detail: String(err && err.message || err) }, 500, headers);
    }
  },
};

async function route(request, url, env) {
  const path = url.pathname;
  const method = request.method;
  let m;

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

  // Kullanıcı kendi şifresini değiştirir (madde: canlıya geçmeden önce seed
  // şifrelerinin değiştirilmesi gerekiyor — bunu wrangler CLI'a muhtaç
  // bırakmadan portal içinden yapılabilir kılıyor).
  if (path === '/api/auth/change-password' && method === 'POST') {
    const auth = await requireAuth(request, env, null);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { current_password, new_password } = await request.json();
    if (!current_password || !new_password) return json({ error: 'missing_fields' }, 400);
    if (new_password.length < 8) return json({ error: 'password_too_short' }, 400);
    const user = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(auth.sub).first();
    if (!user || !(await verifyPassword(current_password, user.password_hash))) {
      return json({ error: 'invalid_credentials' }, 401);
    }
    const newHash = await hashPassword(new_password);
    await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(newHash, user.id).run();
    await writeAudit(env, { company_id: user.company_id, user_id: user.id, action: 'user.change_password', entity_type: 'user', entity_id: user.id, request });
    return json({ ok: true });
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

  // Şirket yetkilisinin KENDİ şirketini yönetmesi (madde 18 "Settings") —
  // /api/companies/:id (yukarıda) yalnızca veraliq_admin içindir; bu uç
  // company_owner'ın kendi company_id'sine (JWT'den, asla body'den) scope'lu
  // self-servis ayar ekranı içindir.
  if (path === '/api/companies/me' && (method === 'GET' || method === 'PATCH')) {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    if (method === 'GET') {
      const company = await env.DB.prepare(`SELECT id, name, slug, plan, status, remove_branding, created_at FROM companies WHERE id = ?`).bind(auth.company_id).first();
      if (!company) return json({ error: 'not_found' }, 404);
      return json({ company });
    }
    if (auth.role !== 'company_owner') return json({ error: 'forbidden' }, 403);
    const body = await request.json();
    const fields = ['name']; // company_owner yalnızca görünen adı değiştirebilir — plan/status/remove_branding SADECE veraliq_admin yetkisinde (billing/abonelik alanları).
    const sets = [], vals = [];
    for (const f of fields) if (f in body) { sets.push(`${f} = ?`); vals.push(body[f]); }
    if (!sets.length) return json({ error: 'no_fields' }, 400);
    vals.push(auth.company_id);
    await env.DB.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'company.self_update', entity_type: 'company', entity_id: auth.company_id, new_value: body, request });
    return json({ ok: true });
  }

  // Şirket-başına TAM veri export'u (65 maddelik master promptun 61-62.
  // maddesi: "her şirket kendi verisini istediği an dışa aktarabilmeli,
  // VERALIQ'a veya herhangi bir provider'a kilitlenmemeli"). Yalnızca
  // company_owner (company_staff DEĞİL — bu, tüm şirketin ham verisini tek
  // seferde dışa aktaran hassas bir işlem, ekip üyesi değil şirket sahibinin
  // yetkisinde olmalı). company_id JWT'den geliyor, hiçbir cross-tenant
  // sızıntı riski yok (her sorgu WHERE company_id = ? ile scope'lu).
  // password_hash gibi hassas alanlar KASITLI OLARAK export'a DAHİL EDİLMİYOR.
  if (path === '/api/companies/me/export' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const cid = auth.company_id;
    const all = async (sql) => (await env.DB.prepare(sql).bind(cid).all()).results;
    const [
      companyRow, users, projects, units, leads, customers, interests,
      conversations, messages, summaries, approvals, documents, auditLog,
    ] = await Promise.all([
      env.DB.prepare(`SELECT id, name, slug, plan, status, remove_branding, created_at FROM companies WHERE id = ?`).bind(cid).first(),
      all(`SELECT id, email, name, role, created_at FROM users WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT * FROM projects WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT * FROM units WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT * FROM leads WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT * FROM customers WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT ci.* FROM customer_interests ci JOIN customers c ON c.id = ci.customer_id WHERE c.company_id = ? ORDER BY ci.created_at ASC`),
      all(`SELECT * FROM conversations WHERE company_id = ? ORDER BY started_at ASC`),
      all(`SELECT cm.* FROM conversation_messages cm JOIN conversations co ON co.id = cm.conversation_id WHERE co.company_id = ? ORDER BY cm.created_at ASC`),
      all(`SELECT cs.* FROM conversation_summaries cs JOIN conversations co ON co.id = cs.conversation_id WHERE co.company_id = ? ORDER BY cs.created_at ASC`),
      all(`SELECT * FROM approval_requests WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT id, project_id, filename, file_type, category, created_at FROM documents WHERE company_id = ? ORDER BY created_at ASC`),
      all(`SELECT * FROM audit_log WHERE company_id = ? ORDER BY created_at DESC LIMIT 5000`),
    ]);
    if (!companyRow) return json({ error: 'not_found' }, 404);
    await writeAudit(env, { company_id: cid, user_id: auth.sub, action: 'company.data_export', entity_type: 'company', entity_id: cid, request });
    return json({
      exported_at: new Date().toISOString(),
      export_version: 1,
      company: companyRow,
      users, projects, units, leads, customers,
      customer_interests: interests,
      conversations,
      conversation_messages: messages,
      conversation_summaries: summaries,
      approval_requests: approvals,
      documents,
      audit_log: auditLog,
    });
  }

  // ---- TEAM (madde 18 "Team") — company_owner kendi şirketinin kullanıcılarını yönetir ----
  if (path === '/api/team' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(`SELECT id, email, name, role, created_at FROM users WHERE company_id = ? ORDER BY created_at ASC`).bind(auth.company_id).all();
    return json({ team: results });
  }
  if (path === '/api/team' && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    if (!body.email || !body.password || !body.name) return json({ error: 'missing_fields', required: ['email', 'password', 'name'] }, 400);
    // RBAC genişlemesi (2026-08-27): owner artık davet ederken daha
    // granüler bir rol seçebilir (Manager/Sales Manager/Sales Agent/Viewer).
    // GEÇERSİZ/eksik bir role değeri (veya 'company_owner'/'veraliq_admin'
    // gibi davet yoluyla ASLA verilmemesi gereken bir rol) sessizce
    // 'company_staff'a düşer — DAVRANIŞ DEĞİŞMEDİ (varsayılan hep buydu).
    const invitableRoles = ['company_staff', ...COMPANY_EXTENDED_ROLES];
    const role = invitableRoles.includes(body.role) ? body.role : 'company_staff';
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(body.email.toLowerCase().trim()).first();
    if (existing) return json({ error: 'email_taken' }, 409);
    const id = generateId('usr');
    const passwordHash = await hashPassword(body.password);
    await env.DB.prepare(
      `INSERT INTO users (id, company_id, email, password_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, auth.company_id, body.email.toLowerCase().trim(), passwordHash, role, body.name).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'team.invite', entity_type: 'user', entity_id: id, new_value: { email: body.email, name: body.name, role }, request });
    return json({ id, role }, 201);
  }
  if ((m = path.match(/^\/api\/team\/([^/]+)$/)) && method === 'DELETE') {
    const auth = await requireAuth(request, env, ['company_owner']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const targetId = m[1];
    const target = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND company_id = ?`).bind(targetId, auth.company_id).first();
    if (!target) return json({ error: 'not_found' }, 404);
    if (target.role === 'company_owner') return json({ error: 'cannot_remove_owner' }, 400);
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(targetId).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'team.remove', entity_type: 'user', entity_id: targetId, request });
    return json({ ok: true });
  }

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

  // Şirket geneli envanter sorgusu (proje ayırt etmeden) — portal.html'in
  // Inventory/Sales/Presentations/Reservations/Contracts menülerinin hepsi
  // aynı `units` tablosunu, yalnızca status filtresiyle farklı görünümde
  // gösterir (madde 18 menüsündeki bu 5 sekme, promptun kendi veri modelinde
  // (madde 32-36) zaten TEK bir envanter tablosuna dayanıyor — ayrı ayrı
  // "sales" / "reservations" tabloları icat etmek yerine mevcut state
  // machine'i (AVAILABLE→...→SOLD) tek kaynak olarak kullanmak, madde 81'in
  // "gereksiz teknoloji/model değişikliği yapma" kuralına uygun).
  if (path === '/api/units' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const companyId = auth.role === 'veraliq_admin' ? url.searchParams.get('company_id') : auth.company_id;
    if (!companyId) return json({ error: 'company_id_required' }, 400);
    const status = url.searchParams.get('status');
    let query = `SELECT u.*, p.name AS project_name FROM units u JOIN projects p ON p.id = u.project_id WHERE u.company_id = ?`;
    const params = [companyId];
    if (status) { query += ` AND u.status = ?`; params.push(status); }
    query += ` ORDER BY u.updated_at DESC LIMIT 500`;
    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ units: results });
  }

  // ---- DASHBOARD (madde 19) -------------------------------------------------
  if (path === '/api/dashboard' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const cid = auth.company_id;
    const [totalLeads, todayLeads, unitStatusCounts, revenue, pendingApprovals, agentPerf] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ?`).bind(cid).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ? AND date(created_at) = date('now')`).bind(cid).first(),
      env.DB.prepare(`SELECT status, COUNT(*) AS n FROM units WHERE company_id = ? GROUP BY status`).bind(cid).all(),
      env.DB.prepare(`SELECT COALESCE(SUM(price), 0) AS total FROM units WHERE company_id = ? AND status = 'SOLD'`).bind(cid).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM approval_requests WHERE company_id = ? AND status = 'pending'`).bind(cid).first(),
      // madde 19 "AI Agent Performance / Human Sales Performance": presentation_lock
      // audit kayıtlarındaki gerçek agent_type dağılımından hesaplanır (uydurma
      // bir "performans skoru" DEĞİL, gerçekten kaç sunumun AI/insan tarafından
      // başlatıldığının sayımı).
      env.DB.prepare(
        `SELECT json_extract(new_value, '$.agent_type') AS agent_type, COUNT(*) AS n
         FROM audit_log WHERE company_id = ? AND action = 'unit.presentation_lock'
         GROUP BY agent_type`
      ).bind(cid).all(),
    ]);
    const statusMap = {};
    for (const row of unitStatusCounts.results) statusMap[row.status] = row.n;
    const agentMap = { AI: 0, HUMAN: 0 };
    for (const row of agentPerf.results) if (row.agent_type) agentMap[row.agent_type] = row.n;
    return json({
      total_leads: totalLeads.n,
      today_leads: todayLeads.n,
      active_stock: statusMap.AVAILABLE || 0,
      presentations: statusMap.PRESENTATION || 0,
      holds: statusMap.HOLD || 0,
      reservations: statusMap.RESERVED || 0,
      deposits: statusMap.DEPOSIT_PAID || 0,
      contracts: statusMap.CONTRACT || 0,
      sales: statusMap.SOLD || 0,
      revenue: revenue.total,
      pending_approvals: pendingApprovals.n,
      ai_agent_presentations: agentMap.AI,
      human_agent_presentations: agentMap.HUMAN,
    });
  }

  // ---- COMPANY AI ASSISTANT (madde 20-22) ------------------------------------
  // ZERO TRUST AI (madde 56) burada da geçerli: bu uç bir LLM'e SERBEST metin
  // SQL ürettirmiyor (bu, en klasik SQL injection/veri sızıntısı riskidir).
  // Bunun yerine, agent-core/providers/faq-sales-brain-provider.js'de zaten
  // kurulu olan aynı desenle (deterministik niyet eşleştirme) çalışıyor: sabit
  // bir örüntü listesi soruyu SINIRLI, ÖNCEDEN TANIMLANMIŞ ve PARAMETRELİ bir
  // D1 sorgusuna eşler, cevap GERÇEK veritabanı değerinden üretilir — asla
  // uydurulmuş bir sayı değildir. v1 kapsamı madde 20'deki örnek sorularla
  // sınırlı; daha geniş doğal dil anlama için gerçek bir LLM sağlayıcısı
  // (agent-core/config.js'deki llmProvider gibi) BAĞLANABİLİR ama bu, LLM'in
  // yine de asla doğrudan DB'ye dokunmaması gerektiği anlamına gelir — LLM
  // yalnızca "hangi intent" sorusuna cevap verir, sorguyu BU fonksiyon çalıştırır.
  if (path === '/api/assistant/query' && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { question, lang } = await request.json();
    if (!question || typeof question !== 'string') return json({ error: 'missing_fields' }, 400);
    // `lang`: portal.html'in o anki arayüz dili (tr/en/ru, varsayılan tr) —
    // İmparator'ın "şirket yetkilisi ingilizce/rusça konuşursa asistanı da o
    // dili konuşmalı" isteği üzerine eklendi. Yalnızca CEVABIN hangi dilde
    // üretileceğini seçer; soru hangi dilde yazılırsa yazılsın niyet aynı
    // şekilde tanınır (bkz. answerAssistantQuery).
    const answer = await answerAssistantQuery(env, auth.company_id, question, lang);
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'assistant.query', entity_type: 'assistant', new_value: { question, lang }, request });
    return json({ answer });
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
    // leads.customer_id (2026-08-27, madde 61-62 — leads/customers bağlantısı,
    // bkz. migrations/0002). company_id İSTEMCİDEN gelen customer_id'ye
    // GÜVENMEDEN doğrulanıyor — başka bir şirketin müşterisine bağlamayı
    // denemek sessizce yok sayılır (null olarak kalır), 400 değil, çünkü bu
    // "isteğin biçimi bozuk" değil "verilen id bu şirkete ait değil" anlamına
    // gelir ve lead oluşturmayı engellememesi daha iyi bir UX.
    let customerId = null;
    if (body.customer_id) {
      const c = await env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND company_id = ?`).bind(body.customer_id, auth.company_id).first();
      if (c) customerId = c.id;
    }
    const id = generateId('lead');
    await env.DB.prepare(
      `INSERT INTO leads (id, company_id, project_id, customer_id, name, phone, email, budget, interest, source, assigned_type, status, notes, ai_summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      id, auth.company_id, body.project_id || null, customerId, body.name || '', body.phone || null, body.email || null,
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
      if ('customer_id' in body) {
        if (body.customer_id === null) {
          sets.push('customer_id = ?'); vals.push(null);
        } else {
          const c = await env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND company_id = ?`).bind(body.customer_id, auth.company_id).first();
          if (!c) return json({ error: 'invalid_customer_id' }, 400);
          sets.push('customer_id = ?'); vals.push(c.id);
        }
      }
      if (!sets.length) return json({ error: 'no_fields' }, 400);
      sets.push(`updated_at = datetime('now')`);
      vals.push(leadId);
      await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'lead.update', entity_type: 'lead', entity_id: leadId, old_value: lead, new_value: body, request });
      return json({ ok: true });
    }
  }

  // ---- CUSTOMERS + CONVERSATION MEMORY (2026-08-27) --------------------------
  // Provider-bağımsız müşteri/görüşme hafızası — bkz. schema.sql'deki geniş
  // yorum ve docs/DATABASE_SCHEMA.md. Hangi avatar/LLM sağlayıcısı kullanılırsa
  // kullanılsın (Anam/Spatius/başka biri), bu veriler burada, VERALIQ'ın kendi
  // veritabanında kalır ve provider değişse bile ASLA kaybolmaz.
  if (path === '/api/customers' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(`SELECT * FROM customers WHERE company_id = ? ORDER BY updated_at DESC LIMIT 500`).bind(auth.company_id).all();
    return json({ customers: results });
  }
  if (path === '/api/customers' && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    const id = generateId('cust');
    await env.DB.prepare(
      `INSERT INTO customers (id, company_id, name, phone, email, budget, preferences, sales_status, consent_status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      id, auth.company_id, body.name || '', body.phone || null, body.email || null, body.budget ?? null,
      body.preferences || '', body.sales_status || 'new', body.consent_status || 'unknown', body.notes || ''
    ).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'customer.create', entity_type: 'customer', entity_id: id, new_value: body, request });
    return json({ id }, 201);
  }
  if ((m = path.match(/^\/api\/customers\/([^/]+)$/)) && (method === 'GET' || method === 'PATCH')) {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const customerId = m[1];
    const customer = await env.DB.prepare(`SELECT * FROM customers WHERE id = ? AND company_id = ?`).bind(customerId, auth.company_id).first();
    if (!customer) return json({ error: 'not_found' }, 404);
    if (method === 'GET') {
      const interests = await env.DB.prepare(
        `SELECT ci.*, p.name AS project_name, u.unit_no FROM customer_interests ci
         LEFT JOIN projects p ON p.id = ci.project_id LEFT JOIN units u ON u.id = ci.unit_id
         WHERE ci.customer_id = ? ORDER BY ci.created_at DESC`
      ).bind(customerId).all();
      const conversations = await env.DB.prepare(`SELECT * FROM conversations WHERE customer_id = ? ORDER BY started_at DESC LIMIT 50`).bind(customerId).all();
      // leads.customer_id (madde 61-62, bkz. migrations/0002): bu müşteriye
      // bağlı dahili CRM lead kayıtları da (varsa) müşteri detayında görünsün.
      const leads = await env.DB.prepare(`SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at DESC`).bind(customerId).all();
      return json({ customer, interests: interests.results, conversations: conversations.results, leads: leads.results });
    }
    const body = await request.json();
    const fields = ['name', 'phone', 'email', 'budget', 'preferences', 'sales_status', 'consent_status', 'notes'];
    const sets = [], vals = [];
    for (const f of fields) if (f in body) { sets.push(`${f} = ?`); vals.push(body[f]); }
    if (!sets.length) return json({ error: 'no_fields' }, 400);
    sets.push(`updated_at = datetime('now')`);
    vals.push(customerId);
    await env.DB.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'customer.update', entity_type: 'customer', entity_id: customerId, old_value: customer, new_value: body, request });
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/customers\/([^/]+)\/interests$/)) && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const customerId = m[1];
    const customer = await env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND company_id = ?`).bind(customerId, auth.company_id).first();
    if (!customer) return json({ error: 'not_found' }, 404);
    const body = await request.json();
    if (!body.project_id && !body.unit_id) return json({ error: 'missing_fields', required: ['project_id or unit_id'] }, 400);
    const id = generateId('int');
    await env.DB.prepare(
      `INSERT INTO customer_interests (id, customer_id, project_id, unit_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(id, customerId, body.project_id || null, body.unit_id || null).run();
    return json({ id }, 201);
  }

  if (path === '/api/conversations' && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const customerFilter = url.searchParams.get('customer_id');
    let query = `SELECT * FROM conversations WHERE company_id = ?`;
    const params = [auth.company_id];
    if (customerFilter) { query += ` AND customer_id = ?`; params.push(customerFilter); }
    query += ` ORDER BY started_at DESC LIMIT 200`;
    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ conversations: results });
  }
  if (path === '/api/conversations' && method === 'POST') {
    // Bu uç hem portal JWT'si (company_owner/staff) hem de agent-key (Zero
    // Trust) ile çağrılabilir — çünkü bir görüşmeyi BAŞLATAN taraf genellikle
    // müşteriyle konuşan canlı ajanın kendisidir (widget-runtime.js), portal
    // oturumu açmış bir insan değil. Bu, /units/:id/lock ile AYNI mimari
    // desen (bkz. yukarıdaki checkAgentKey notu). Ajan yalnızca YENİ bir
    // konuşma satırı ve mesaj EKLEYEBİLİR — customer/lead/unit/proje gibi
    // hiçbir iş verisini DEĞİŞTİREMEZ.
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    const viaAgentKey = !auth && checkAgentKey(request, env);
    if (!auth && !viaAgentKey) return json({ error: 'unauthorized' }, 401);
    const body = await request.json();
    const companyId = auth ? auth.company_id : body.company_id;
    if (!companyId) return json({ error: 'company_id_required' }, 400);
    const id = generateId('conv');
    await env.DB.prepare(
      `INSERT INTO conversations (id, company_id, customer_id, lead_id, agent_type, agent_persona, provider, channel, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      id, companyId, body.customer_id || null, body.lead_id || null, body.agent_type || 'AI',
      body.agent_persona || '', body.provider || '', body.channel || 'web'
    ).run();
    return json({ id }, 201);
  }
  if ((m = path.match(/^\/api\/conversations\/([^/]+)$/)) && method === 'GET') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff', 'veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const conversationId = m[1];
    const conversation = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(conversationId).first();
    if (!conversation) return json({ error: 'not_found' }, 404);
    if (auth.role !== 'veraliq_admin' && conversation.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);
    const messages = await env.DB.prepare(`SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC`).bind(conversationId).all();
    const summary = await env.DB.prepare(`SELECT * FROM conversation_summaries WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`).bind(conversationId).first();
    return json({ conversation, messages: messages.results, summary: summary || null });
  }
  if ((m = path.match(/^\/api\/conversations\/([^/]+)\/messages$/)) && method === 'POST') {
    // Zero Trust AI: agent-key ile çağrıldığında bu uç yalnızca bir metin
    // satırı EKLER — hiçbir status/fiyat/CRM alanını değiştirmez.
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    const viaAgentKey = !auth && checkAgentKey(request, env);
    if (!auth && !viaAgentKey) return json({ error: 'unauthorized' }, 401);
    const conversationId = m[1];
    const conversation = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(conversationId).first();
    if (!conversation) return json({ error: 'not_found' }, 404);
    if (auth && conversation.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);
    const body = await request.json();
    if (!body.role || !body.text) return json({ error: 'missing_fields', required: ['role', 'text'] }, 400);
    const id = generateId('msg');
    await env.DB.prepare(
      `INSERT INTO conversation_messages (id, conversation_id, role, text, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(id, conversationId, body.role, body.text).run();
    return json({ id }, 201);
  }
  if ((m = path.match(/^\/api\/conversations\/([^/]+)\/end$/)) && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    const viaAgentKey = !auth && checkAgentKey(request, env);
    if (!auth && !viaAgentKey) return json({ error: 'unauthorized' }, 401);
    const conversationId = m[1];
    const conversation = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(conversationId).first();
    if (!conversation) return json({ error: 'not_found' }, 404);
    if (auth && conversation.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);
    await env.DB.prepare(`UPDATE conversations SET ended_at = datetime('now') WHERE id = ?`).bind(conversationId).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/conversations\/([^/]+)\/summary$/)) && method === 'POST') {
    const auth = await requireAuth(request, env, ['company_owner', 'company_staff']);
    const viaAgentKey = !auth && checkAgentKey(request, env);
    if (!auth && !viaAgentKey) return json({ error: 'unauthorized' }, 401);
    const conversationId = m[1];
    const conversation = await env.DB.prepare(`SELECT * FROM conversations WHERE id = ?`).bind(conversationId).first();
    if (!conversation) return json({ error: 'not_found' }, 404);
    if (auth && conversation.company_id !== auth.company_id) return json({ error: 'forbidden' }, 403);
    const body = await request.json();
    const id = generateId('sum');
    await env.DB.prepare(
      `INSERT INTO conversation_summaries (id, conversation_id, summary, customer_need, budget, interest, objection, next_step, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      id, conversationId, body.summary || '', body.customer_need || '', body.budget ?? null,
      body.interest || '', body.objection || '', body.next_step || ''
    ).run();
    return json({ id }, 201);
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
    // company_viewer requireAuth içinde zaten (GET dışı → null) engellendi.
    if (auth && (['company_owner', 'company_staff'].includes(auth.role) || COMPANY_EXTENDED_ROLES.includes(auth.role))) {
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
    // Onaylama yetkisi: owner + company_manager (madde 43 + RBAC genişlemesi
    // 2026-08-27 — Manager rolü onay verebilir, diğer yeni roller VEREMEZ).
    const auth = await requireAuth(request, env, ['company_owner', 'company_manager']);
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

  // ---- ADMIN: platform-genelinde ekranlar (madde 45) ---------------------
  if (path === '/api/admin/users' && method === 'GET') {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.company_id, c.name AS company_name, u.created_at
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       ORDER BY u.created_at DESC LIMIT 500`
    ).all();
    return json({ users: results });
  }

  if (path === '/api/admin/projects' && method === 'GET') {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(
      `SELECT p.*, c.name AS company_name FROM projects p JOIN companies c ON c.id = p.company_id ORDER BY p.created_at DESC LIMIT 500`
    ).all();
    return json({ projects: results });
  }

  if (path === '/api/admin/stats' && method === 'GET') {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const [companies, activeCompanies, users, projects, units, sold, revenue, leads, pending, aiPres, humanPres, planRows] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM companies`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM companies WHERE status = 'active'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM projects`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM units`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM units WHERE status = 'SOLD'`).first(),
      env.DB.prepare(`SELECT COALESCE(SUM(price), 0) AS total FROM units WHERE status = 'SOLD'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM leads`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM approval_requests WHERE status = 'pending'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'unit.presentation_lock' AND json_extract(new_value, '$.agent_type') = 'ai'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'unit.presentation_lock' AND json_extract(new_value, '$.agent_type') = 'human'`).first(),
      env.DB.prepare(`SELECT plan, COUNT(*) AS n FROM companies GROUP BY plan`).all(),
    ]);
    return json({
      total_companies: companies.n, active_companies: activeCompanies.n, total_users: users.n,
      total_projects: projects.n, total_units: units.n, total_sold: sold.n, total_revenue: revenue.total,
      total_leads: leads.n, pending_approvals: pending.n,
      ai_agent_presentations: aiPres.n, human_agent_presentations: humanPres.n,
      plans: planRows.results,
    });
  }

  if (path === '/api/admin/assistant/query' && method === 'POST') {
    const auth = await requireAuth(request, env, ['veraliq_admin']);
    if (!auth) return json({ error: 'unauthorized' }, 401);
    const { question } = await request.json();
    if (!question || typeof question !== 'string') return json({ error: 'missing_fields' }, 400);
    const answer = await answerAdminAssistantQuery(env, question);
    await writeAudit(env, { user_id: auth.sub, action: 'admin_assistant.query', entity_type: 'admin_assistant', new_value: { question }, request });
    return json({ answer });
  }

  // Herkese açık, JWT gerektirmez — worker/D1 canlı mı diye Admin Panel
  // "System Health" ekranının kontrol ettiği hafif uç.
  if (path === '/api/health' && method === 'GET') {
    try {
      await env.DB.prepare(`SELECT 1`).first();
      return json({ ok: true, db: 'ok', worker: 'veraliq-portal-api', time: new Date().toISOString() });
    } catch (e) {
      return json({ ok: false, db: 'error', detail: String((e && e.message) || e) }, 503);
    }
  }

  return json({ error: 'not_found' }, 404);
}
