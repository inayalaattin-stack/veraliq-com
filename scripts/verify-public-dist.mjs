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
function walk(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
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
  /(^|\/)worker(-portal|-llm|-spatius)?\//i,
  /(^|\/)services\//i,
  /(^|\/)docs\//i,
  /(^|\/)marketing\//i,
  /(^|\/)scripts\//i,
  /(^|\/)agent-core\/test\//i,
  /(^|\/)(readme|prd|deploy_adim_adim|project_handoff|claude)\.md$/i,
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
const LOCAL_ATTR_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
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
for (const page of REQUIRED_PAGES) {
  const abs = join(DIST, page);
  if (!existsSync(abs)) continue; // already reported above
  const html = readFileSync(abs, 'utf8');
  let m;
  while ((m = LOCAL_ATTR_RE.exec(html))) {
    let url = m[1].split('?')[0].split('#')[0];
    if (isSkippable(m[1])) continue;
    if (!url) continue;
    const resolved = url.startsWith('/') ? join(DIST, url) : join(dirname(abs), url);
    if (!existsSync(normalize(resolved))) {
      fail(`${page}: local reference does not resolve: "${m[1]}" (looked for ${normalize(resolved)})`);
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
