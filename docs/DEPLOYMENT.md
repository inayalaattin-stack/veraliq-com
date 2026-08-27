# VERALIQ — Deployment

## Frontend (index.html / admin.html / portal.html / i18n.js / script.js / agent-core/ / _headers)

Cloudflare Pages, otomatik: `main` dalına push edildiğinde deploy olur. Bu sandbox ortamı GitHub'a doğrudan push edemiyor (kimlik bilgisi yok) — değişiklikler bir git patch olarak kullanıcının kendi cihazına aktarılır, kullanıcı kendi PowerShell'inden `git push origin main` çalıştırır.

## Backend (`worker-portal/`)

Ayrı, bağımsız bir Cloudflare Worker. Sandbox'tan `wrangler` çalıştırılamıyor (npm registry erişimi + Cloudflare hesap kimlik bilgisi sandbox'ta yok) — bu adımlar HER ZAMAN kullanıcının kendi PowerShell'inden çalıştırılmalı:

```powershell
cd worker-portal
npx wrangler deploy
```

Şema değişikliği varsa (yeni tablo/kolon eklendiğinde):

```powershell
npx wrangler d1 execute veraliq-portal-db --remote --file=schema.sql
```

Yeni bir secret gerekirse:

```powershell
npx wrangler secret put JWT_SECRET
npx wrangler secret put AGENT_SHARED_SECRET
```

İlk kurulum tam adımları `worker-portal/README.md` ve `wrangler.toml`'daki yorumlarda yazılı.

## Deploy sırası önerisi

1. Backend değiştiyse önce `wrangler deploy` (worker-portal/) — API her zaman geriye dönük uyumlu olacak şekilde yazılıyor (yeni route eklemek, var olanı bozmadan).
2. Sonra `git push origin main` (frontend + worker-portal kaynak kodu senkron kalsın diye).
3. `/api/health` ile canlı worker'ın ayakta olduğunu doğrulayın: `curl https://veraliq-portal-api.veraliq-com.workers.dev/api/health`.

## Ortam / secret'lar (özet — ayrıntı SECURITY.md'de)

| Secret | Nerede | Amacı |
|---|---|---|
| `JWT_SECRET` | worker-portal (Cloudflare secret) | JWT imzalama/doğrulama |
| `AGENT_SHARED_SECRET` | worker-portal (Cloudflare secret) | Agent↔worker arası presentation-lock çağrıları |
| Spatius API key/secret | worker-spatius (ayrı worker, bu dokümanın kapsamı dışında) | Avatar session token |

Hiçbir secret frontend koduna (HTML/JS) YAZILMIYOR — hepsi yalnızca Worker ortamında (`env.*`) okunuyor.
