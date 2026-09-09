#!/usr/bin/env node
// scripts/build-public-dist.mjs
//
// Builds `public-dist/` — the ONLY directory that should ever be handed to
// Cloudflare Pages. Before this script existed, `.github/workflows/deploy.yml`
// published the entire repo root (`directory: .`), which meant every worker
// source file, `schema.sql`/`seed.sql`, migrations, the test suite, internal
// docs/PRD/deploy notes, self-hosted service source, and `spatius-test.html`
// (a real, callable Spatius session/TTS test page — see its own header
// comment) were all served as public static files on the live domain. That
// is a real data-exposure bug, not a cosmetic one — fixed here by publishing
// from an explicit ALLOWLIST instead of the repo root.
//
// No external dependencies (plain Node `fs`/`path`) — this must run in CI
// with nothing but a Node runtime.
//
// Usage:  node scripts/build-public-dist.mjs [outDir]
// Verify: node scripts/verify-public-dist.mjs [outDir]   (run this after)

import { existsSync, mkdirSync, rmSync, cpSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, process.argv[2] || 'public-dist');

// ---------------------------------------------------------------------------
// ALLOWLIST — the ONLY things that end up in public-dist/. Anything not
// listed here is NOT published, full stop. When you add a new public page or
// a new browser-loaded agent-core file, add it here explicitly — that
// friction is intentional (see brief: "yalnızca açık allowlist ile").
// ---------------------------------------------------------------------------

// Individual files copied to the SAME relative path in public-dist/.
const FILES = [
  // Public pages. spatius-test.html is deliberately NOT here — it is a
  // real, callable Spatius session/TTS test harness, not a product page
  // (see its own header comment) and must never be publicly reachable.
  'index.html',
  'pricing.html',
  'admin.html',
  'portal.html',
  'terms.html',
  'privacy.html',
  'kvkk.html',

  // Root scripts/styles/dictionaries the pages above load directly.
  'i18n.js',
  'portal-i18n.js',
  'script.js',
  'pricing.js',
  'motion.js',

  // Cloudflare Pages publish-time config (headers). No `_redirects` file
  // exists in this repo today; add it here the day one is introduced.
  '_headers',

  // Root-level assets actually referenced by the pages above (verified via
  // `grep -oE 'assets/[A-Za-z0-9_.-]+\.(png|svg|jpg|jpeg|webp|css|ico)'`
  // across every public page — see IMPLEMENTATION-BASELINE.md). Deliberately
  // EXCLUDES assets/architecture.jpg, assets/hero-showcase-a.jpg/-b.jpg
  // (orphaned, unreferenced) and assets/generate-favicons.py (a build tool,
  // never fetched by a browser).
  'assets/apple-touch-icon.png',
  'assets/favicon-16.png',
  'assets/favicon-32.png',
  'assets/veraliq-mark.svg',
  'assets/elif-kaya-temp.jpg',
  'assets/hero-showcase-platforms.jpg',
  'assets/hero-showcase-platforms.webp',
  'assets/enterprise-light.css',
];

// Whole directories copied recursively. agent-core/ is entirely browser
// code (the Digital Human Engine widget) loaded via <script type=module> and
// dynamic import() from agent-core/providers.js's LOADERS map — every
// provider file must be servable even when not the currently-selected one,
// since switching providers is meant to be a config.js-only change. The one
// exclusion is agent-core/test/ (Node-only test harness + a browser-test
// results JSON), which is stripped out explicitly below after the copy.
const DIRECTORIES = [
  { from: 'agent-core', to: 'agent-core', exclude: ['test'] },
];

// assets/brand/ (marketing/sales-deck material, unused icon/illustration
// kit — see EK-05 finding: none of it is referenced by any live page) is
// deliberately NOT copied. If you want the sales deck or brand kit publicly
// hosted at a real URL, that's a separate, deliberate decision — add it here
// explicitly, don't let it ride along by default.

// ---------------------------------------------------------------------------

function fail(msg) {
  console.error(`[build-public-dist] ERROR: ${msg}`);
  process.exit(1);
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let copiedFiles = 0;
for (const rel of FILES) {
  const src = join(REPO_ROOT, rel);
  if (!existsSync(src)) fail(`allowlisted file is missing from the repo: ${rel}`);
  const dest = join(OUT_DIR, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  copiedFiles++;
}

let copiedDirs = 0;
for (const { from, to, exclude } of DIRECTORIES) {
  const src = join(REPO_ROOT, from);
  if (!existsSync(src) || !statSync(src).isDirectory()) fail(`allowlisted directory is missing: ${from}`);
  const dest = join(OUT_DIR, to);
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const rel = source.slice(src.length + 1).split('\\').join('/');
      if (!rel) return true; // the directory root itself
      return !(exclude || []).some((ex) => rel === ex || rel.startsWith(ex + '/'));
    },
  });
  copiedDirs++;
}

console.log(`[build-public-dist] OK — ${copiedFiles} files + ${copiedDirs} director${copiedDirs === 1 ? 'y' : 'ies'} copied into ${OUT_DIR}`);
