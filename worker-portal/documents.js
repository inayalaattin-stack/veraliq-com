// worker-portal/documents.js
//
// Proje belgeleri (PDF/Word/Excel/PowerPoint/görsel) — gerçek Cloudflare R2
// depolama. `documents` tablosu (schema.sql) daha önce yalnızca METADATA
// için ayrılmıştı ("gerçek dosya içeriği Faz 6'da R2'ye taşınacak" yorumu)
// ama hiçbir upload/download route'u hiç yazılmamıştı — data-export
// endpoint'i yalnızca metadata'yı OKUYORDU. Bu dosya o eksik parçayı kapatır.
//
// TASARIM İLKELERİ:
// 1. Gerçek dosya baytları R2'de saklanır, D1'de yalnızca metadata (r2_key
//    dahil) tutulur — büyük binary içerik asla D1'e yazılmaz.
// 2. Tenant izolasyonu: her işlem projenin company_id'sinin auth.company_id
//    ile eşleştiği doğrulanmadan yapılmaz.
// 3. Dosya boyutu İSTEMCİ Content-Length header'ına GÜVENMEDEN, gerçek
//    okunan bayt sayısına (arrayBuffer().byteLength) göre sınırlanır (Faz 2
//    /tts düzeltmesiyle AYNI ilke — bkz. worker-spatius/session-worker.js).
// 4. Dosya uzantısı sabit bir allowlist'e karşı kontrol edilir — MIME
//    sniffing veya içerik doğrulaması YAPILMAZ (kapsam dışı, dürüstçe not
//    düşülüyor: kötü niyetli bir dosya uzantıyı taklit edebilir).
// 5. R2 binding yoksa (yapılandırılmamışsa) fail-closed — sessizce "başarılı
//    ama hiçbir yere kaydedilmedi" durumuna düşülmez.

import { generateId } from './auth.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — tipik PDF/pptx/xlsx için yeterli
const ALLOWED_EXTENSIONS = {
  pdf: 'pdf', doc: 'doc', docx: 'docx', xls: 'xls', xlsx: 'xlsx',
  ppt: 'ppt', pptx: 'pptx', jpg: 'jpg', jpeg: 'jpg', png: 'png', mp4: 'mp4',
};
const CATEGORIES = ['price_list', 'payment_plan', 'presentation', 'contract', 'image', 'video', 'other'];

function extOf(filename) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/** POST /api/projects/:id/documents — multipart/form-data: file, category */
export async function handleDocumentUpload(request, env, { json, writeAudit, auth, projectId }) {
  const project = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND company_id = ?`).bind(projectId, auth.company_id).first();
  if (!project) return json({ error: 'not_found' }, 404);

  let form;
  try { form = await request.formData(); } catch (e) { return json({ error: 'invalid_form_data' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing_file' }, 400);

  const ext = extOf(file.name);
  if (!ALLOWED_EXTENSIONS[ext]) {
    return json({ error: 'unsupported_file_type', allowed: Object.keys(ALLOWED_EXTENSIONS) }, 400);
  }
  const buf = await file.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: 'empty_file' }, 400);
  if (buf.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'file_too_large', max_bytes: MAX_UPLOAD_BYTES }, 413);

  if (!env.DOCUMENTS_BUCKET) return json({ error: 'server_not_configured' }, 500);

  const categoryRaw = form.get('category');
  const category = CATEGORIES.includes(categoryRaw) ? categoryRaw : 'other';
  const id = generateId('doc');
  const safeName = String(file.name).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const r2Key = auth.company_id + '/' + projectId + '/' + id + '-' + safeName;

  await env.DOCUMENTS_BUCKET.put(r2Key, buf, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  await env.DB.prepare(
    `INSERT INTO documents (id, company_id, project_id, filename, file_type, category, r2_key, uploaded_by, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
  ).bind(id, auth.company_id, projectId, file.name, ALLOWED_EXTENSIONS[ext], category, r2Key, auth.sub).run();

  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'document.upload', entity_type: 'document', entity_id: id, new_value: { filename: file.name, category, project_id: projectId }, request });
  return json({ id }, 201);
}

/** GET /api/projects/:id/documents */
export async function handleProjectDocumentsList(request, env, { json, auth, projectId }) {
  const project = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND company_id = ?`).bind(projectId, auth.company_id).first();
  if (!project) return json({ error: 'not_found' }, 404);
  const { results } = await env.DB.prepare(
    `SELECT id, filename, file_type, category, uploaded_by, version, created_at FROM documents
     WHERE project_id = ? AND company_id = ? ORDER BY created_at DESC`
  ).bind(projectId, auth.company_id).all();
  return json({ documents: results });
}

/** GET /api/documents/:id/download — gerçek binary yanıt (R2'den akış). */
export async function handleDocumentDownload(request, env, { json, auth, id }) {
  const doc = await env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND company_id = ?`).bind(id, auth.company_id).first();
  if (!doc) return json({ error: 'not_found' }, 404);
  if (!env.DOCUMENTS_BUCKET) return json({ error: 'server_not_configured' }, 500);
  const obj = await env.DOCUMENTS_BUCKET.get(doc.r2_key);
  if (!obj) return json({ error: 'file_missing_in_storage' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + doc.filename.replace(/"/g, '') + '"',
      'Cache-Control': 'private, no-store',
    },
  });
}

/** DELETE /api/documents/:id */
export async function handleDocumentDelete(request, env, { json, writeAudit, auth, id }) {
  const doc = await env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND company_id = ?`).bind(id, auth.company_id).first();
  if (!doc) return json({ error: 'not_found' }, 404);
  if (env.DOCUMENTS_BUCKET) await env.DOCUMENTS_BUCKET.delete(doc.r2_key).catch(() => {});
  await env.DB.prepare(`DELETE FROM documents WHERE id = ?`).bind(id).run();
  await writeAudit(env, { company_id: auth.company_id, user_id: auth.sub, action: 'document.delete', entity_type: 'document', entity_id: id, old_value: { filename: doc.filename }, request });
  return json({ ok: true });
}
