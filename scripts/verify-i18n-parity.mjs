#!/usr/bin/env node
// scripts/verify-i18n-parity.mjs
//
// Faz 6 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md) — "güncellenen tüm
// i18n anahtarları 8 dilde eksiksiz kalmalı" gereksinimi için otomatik test.
// Anahtar-SETİ parite testidir — çeviri KALİTESİ testi DEĞİLDİR (bkz.
// CAPABILITY-LEDGER.md: "statik sözlük key-parity çeviri kalitesinin kanıtı
// değildir").
//
// Kontrol eder:
//   1. i18n.js — dict.tr'deki HER anahtar, diğer 7 dilde de var mı (ve tersi:
//      fazladan/yetim bir anahtar var mı).
//   2. portal-i18n.js — TR/EN/RU aynı şekilde.
//
// Bağımsız çalışır (harici paket yok) — dosyaları gerçek bir <script> ortamı
// taklit ederek (window stub) Node'da import eder.
//
// Kullanım: node scripts/verify-i18n-parity.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function loadDict(relPath, globalName) {
  const src = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: relPath });
  const data = sandbox.window[globalName];
  if (!data) throw new Error(`${relPath}: window.${globalName} tanımlanmadı`);
  return data;
}

function checkParity(label, dict, sourceLang) {
  const sourceKeys = new Set(Object.keys(dict[sourceLang] || {}));
  if (sourceKeys.size === 0) {
    failures.push(`${label}: kaynak dil '${sourceLang}' hiç anahtar içermiyor`);
    return;
  }
  for (const lang of Object.keys(dict)) {
    if (lang === sourceLang) continue;
    const keys = new Set(Object.keys(dict[lang] || {}));
    const missing = [...sourceKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !sourceKeys.has(k));
    if (missing.length) failures.push(`${label}: '${lang}' dilinde EKSİK anahtar(lar): ${missing.join(', ')}`);
    if (extra.length) failures.push(`${label}: '${lang}' dilinde YETİM (kaynakta olmayan) anahtar(lar): ${extra.join(', ')}`);
  }
}

const i18n = loadDict('i18n.js', 'VERALIQ_I18N');
checkParity('i18n.js (site, 8 dil)', i18n.dict, 'tr');

const portalI18n = loadDict('portal-i18n.js', 'VERALIQ_PORTAL_I18N');
checkParity('portal-i18n.js (portal, TR/EN/RU)', portalI18n.dict, 'tr');

if (failures.length) {
  console.error(`[verify-i18n-parity] FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
const siteLangs = Object.keys(i18n.dict).length;
const portalLangs = Object.keys(portalI18n.dict).length;
const siteKeys = Object.keys(i18n.dict.tr).length;
const portalKeys = Object.keys(portalI18n.dict.tr).length;
console.log(`[verify-i18n-parity] OK — site: ${siteLangs} dil x ${siteKeys} anahtar, portal: ${portalLangs} dil x ${portalKeys} anahtar, hepsi eşleşiyor.`);
