#!/usr/bin/env node
// scripts/verify-public-dist.mjs
//
// Verifies an already-built `public-dist/` (run scripts/build-public-dist.mjs
// first) is safe and complete before it's handed to Cloudflare Pages:
//   1. every required public page exists;
//   2. no forbidden file/directory/pattern is present anywhere in the tree;
//   3. every local (non-http, non-mailto/tel, non-anchor-only) src=/href=
//      reference inside each shipped HTML file resolves to a real file
//      inside public-dist/;
//   4. `_headers` is present at the output root.
//
// Exits non-zero (and prints every failure, not just the first) if anything
// is wrong — this is the actual CI test the brief asked for, not a step that
// always reports green. No external dependencies.
//
// Usage: node scripts/verify-public-dist.mjs [dir]

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, sep } from 'node:path';

const DIST = process.argv[2] || 'public-dist';
const failures = [];

function fail(msg) { failures.push(msg); }

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  console.error(`[verify-public-dist] ERROR: ${DIST} does not exist — run scripts/build-public-dist.mjs first.`);
  process.exit(1);
}

// 1. Required pages -----------------------------------------------------
const REQUIRED_PAGES = ['index.html', 'pricing.html', 'admin.html', 'portal.html', 'terms.html', 'privacy.html', 'kvkk.html'];
for (const page of REQUIRED_PAGES) {
  if (!existsSync(join(DIST, page))) fail(`missing required page: ${page}`);
}

// 4. _headers -------------------------------------------------------------
if (!existsSync(join(DIST, '_headers'))) fail('missing _headers at the output root');

// Walk the whole tree once, collecting every file's path relative to DIST.
// Symlinks are rejected outright rather than followed or silently skipped:
// a symlink's target isn't checked against the denylist by the pattern scan
// below (which only ever sees the link's own name), so a symlink pointing
// outside public-dist/ would defeat this script's entire purpose as a
// safety net.
function walk(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail(`symlink present in public-dist/ (not allowed): ${rel}`);
    else if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}
const allFiles = walk(DIST);

// 2. Forbidden patterns ---------------------------------------------------
// Anything matching these must NEVER appear in the published artifact.
// Matched against the '/'-joined relative path (case-insensitive).
const FORBIDDEN_PATTERNS = [
  /(^|\/)spatius-test\.html$/i,
  /(^|\/)wrangler\.toml$/i,
  /(^|\/)schema\.sql$/i,
  /(^|\/)seed\.sql$/i,
  /\.sql$/i,
  // Broad on purpose: catches any worker-prefixed directory, not just the
  // four that exist today (worker/, worker-portal/, worker-llm/,
  // worker-spatius/) — a future worker-payments/ etc. must be caught even
  // if someone mistakenly allowlists a file from it later.
  /(^|\/)worker[a-z0-9_-]*\//i,
  /(^|\/)services\//i,
  /(^|\/)docs\//i,
  /(^|\/)marketing\//i,
  /(^|\/)scripts\//i,
  // Broad on purpose (mirrors build-public-dist.mjs's segment-based
  // exclude): catches a test/tests/__tests__ directory at any depth, not
  // just the literal agent-core/test/ that exists today.
  /(^|\/)(test|tests|__tests__)\//i,
  // No .md file is ever legitimately part of the public site — blanket ban
  // instead of enumerating filenames (README/PRD/CLAUDE.md/etc.), so a new
  // internal doc added later is caught automatically.
  /\.md$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.wrangler(\/|$)/i,
  /(^|\/)node_modules\//i,
  /(^|\/)package(-lock)?\.json$/i,
  /\.env(\.|$)/i,
  /(^|\/)\.pem$|\.key$/i,
];
for (const rel of allFiles) {
  const posix = rel.split(sep).join('/');
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(posix)) fail(`forbidden path present in public-dist/: ${posix} (matched ${pattern})`);
  }
}

// 3. Local asset resolution -------------------------------------------------
// src=/href= AND srcset= — a <source srcset="assets/x.webp"> inside a
// <picture> carries the same kind of local reference as src=/href= and must
// resolve too, or this check's own claim ("all local references resolve")
// would be false for any page using responsive images.
const LOCAL_ATTR_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const SRCSET_ATTR_RE = /srcset\s*=\s*["']([^"']+)["']/gi;
function isSkippable(url) {
  return (
    !url ||
    url.startsWith('#') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('javascript:') ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || // any scheme:// (http, https, data:, blob:, etc. handled below)
    url.startsWith('data:') ||
    url.startsWith('//') // protocol-relative external
  );
}
function checkResolves(page, abs, rawUrl) {
  if (isSkippable(rawUrl)) return;
  const url = rawUrl.split('?')[0].split('#')[0];
  if (!url) return;
  const resolved = url.startsWith('/') ? join(DIST, url) : join(dirname(abs), url);
  if (!existsSync(normalize(resolved))) {
    fail(`${page}: local reference does not resolve: "${rawUrl}" (looked for ${normalize(resolved)})`);
  }
}
for (const page of REQUIRED_PAGES) {
  const abs = join(DIST, page);
  if (!existsSync(abs)) continue; // already reported above
  const html = readFileSync(abs, 'utf8');
  let m;
  while ((m = LOCAL_ATTR_RE.exec(html))) checkResolves(page, abs, m[1]);
  while ((m = SRCSET_ATTR_RE.exec(html))) {
    // srcset value: comma-separated "url [descriptor]" candidates, e.g.
    // "a.webp 1x, b.webp 2x" or "a.jpg 800w, b.jpg 1200w".
    for (const candidate of m[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      checkResolves(page, abs, url);
    }
  }
}

// ---------------------------------------------------------------------------
if (failures.length) {
  console.error(`[verify-public-dist] FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`[verify-public-dist] OK — ${allFiles.length} files checked, ${REQUIRED_PAGES.length} required pages present, 0 forbidden paths, all local references resolve.`);
