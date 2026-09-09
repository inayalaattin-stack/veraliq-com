#!/usr/bin/env node
// scripts/verify-pricing-parity.mjs
//
// Faz 7 (VERALIQ-CLAUDE-CODE-NIHAI-UYGULAMA-PROMPTU.md, madde 7-9) —
// fiyatlandırma tüm yüzeylerde tutarlı mı? Tek doğruluk kaynağı:
// pricing.js'in PRICES sabiti (monthly/annual/successFeeRate). Bu script:
//   1. pricing.js'teki successFeeRate'in GERÇEKTEN 0.005 olduğunu doğrular
//      (kararın kendisi — 0.01 gibi eski bir değere sessizce dönülürse
//      yakalar).
//   2. i18n.js'in 8 dilindeki pricing.fee.rate metninin hepsinde "0.5"/"0,5"
//      olduğunu VE "%1"/"1%" gibi YANLIŞ bir oranın hiçbir yüzeyde
//      kalmadığını doğrular.
//   3. agent-core/llm-providers/faq-sales-brain-provider.js'in fiyat
//      cevaplarında da aynı kontrolü yapar (FAQ botu ayrı bir metin
//      kaynağıdır, i18n.js'e bağlı değildir).
//   4. pricing.js'in başlangıç DOM değerinin (pricing.html'deki
//      #vpPriceAmount ilk içeriği) PRICES.monthly ile eşleştiğini doğrular.
//
// Bağımsız çalışır (harici paket yok).
//
// Kullanım: node scripts/verify-pricing-parity.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function fail(msg) { failures.push(msg); }

// 1) pricing.js — PRICES sabitini regex ile çıkar (VM'e gerek yok, IIFE
// document/window bekliyor; sabit tanımı tek satırda, doğrudan okunabilir).
const pricingJs = readFileSync(join(REPO_ROOT, 'pricing.js'), 'utf8');
const pricesMatch = pricingJs.match(/var PRICES = \{ monthly: (\d+), annual: (\d+), successFeeRate: ([\d.]+) \}/);
if (!pricesMatch) {
  fail('pricing.js: PRICES sabiti beklenen formatta bulunamadı (monthly/annual/successFeeRate)');
} else {
  const [, monthly, annual, successFeeRate] = pricesMatch;
  if (Number(monthly) !== 25000) fail(`pricing.js: PRICES.monthly beklenen 25000, bulunan ${monthly}`);
  if (Number(annual) !== 250000) fail(`pricing.js: PRICES.annual beklenen 250000, bulunan ${annual}`);
  if (Number(successFeeRate) !== 0.005) fail(`pricing.js: PRICES.successFeeRate beklenen 0.005, bulunan ${successFeeRate}`);
}

// pricing.html'deki başlangıç değeri PRICES.monthly ile eşleşmeli.
const pricingHtml = readFileSync(join(REPO_ROOT, 'pricing.html'), 'utf8');
const initialAmountMatch = pricingHtml.match(/id="vpPriceAmount">([\d.]+)</);
if (!initialAmountMatch) {
  fail('pricing.html: #vpPriceAmount başlangıç değeri bulunamadı');
} else if (initialAmountMatch[1] !== '25.000') {
  fail(`pricing.html: #vpPriceAmount beklenen "25.000", bulunan "${initialAmountMatch[1]}"`);
}

// 2) i18n.js — pricing.fee.rate her dilde 0.5 içermeli, yanlış bir oran
// (örn %1, 1%) İÇERMEMELİ.
function loadWindowGlobal(relPath, globalName) {
  const src = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: relPath });
  return sandbox.window[globalName];
}
// Farsça (fa) Arapça-Hint rakamları kullanır: ۰=0, ۱=1, ۵=5.
const WRONG_RATE_RE = /(?<![\d۰-۹])[%٪]\s*[1۱](?![\d.,۰-۹])|(?<![\d.,۰-۹])[1۱]\s*[%٪](?![\d۰-۹])/;
const RIGHT_RATE_RE = /0[.,]5|۰[.,]۵/;

const i18n = loadWindowGlobal('i18n.js', 'VERALIQ_I18N');
for (const lang of Object.keys(i18n.dict)) {
  const rate = i18n.dict[lang]['pricing.fee.rate'];
  if (!rate) { fail(`i18n.js [${lang}]: pricing.fee.rate anahtarı yok`); continue; }
  if (!RIGHT_RATE_RE.test(rate)) fail(`i18n.js [${lang}]: pricing.fee.rate "0.5" içermiyor: "${rate}"`);
  if (WRONG_RATE_RE.test(rate)) fail(`i18n.js [${lang}]: pricing.fee.rate YANLIŞ bir oran (%1) içeriyor: "${rate}"`);
}

// 3) FAQ botu — fiyat cevaplarında da aynı kontrol (metin kaynağı ayrı).
const faqSrc = readFileSync(join(REPO_ROOT, 'agent-core/llm-providers/faq-sales-brain-provider.js'), 'utf8');
// 'pricing' KB girdisinin tr/en bloklarını kabaca izole et (id: 'pricing'den
// bir sonraki '},' kapanışına kadar).
const pricingBlockMatch = faqSrc.match(/id: 'pricing'[\s\S]*?\n {2}\},/);
if (!pricingBlockMatch) {
  fail('faq-sales-brain-provider.js: pricing KB girdisi bulunamadı');
} else {
  const block = pricingBlockMatch[0];
  if (!RIGHT_RATE_RE.test(block)) fail('faq-sales-brain-provider.js: pricing KB girdisi "0.5" içermiyor');
  if (WRONG_RATE_RE.test(block)) fail('faq-sales-brain-provider.js: pricing KB girdisi YANLIŞ bir oran (%1) içeriyor');
  if (!/25[.,]000/.test(block)) fail('faq-sales-brain-provider.js: pricing KB girdisi aylık 25.000 tutarını içermiyor');
  if (!/250[.,]000/.test(block)) fail('faq-sales-brain-provider.js: pricing KB girdisi yıllık 250.000 tutarını içermiyor');
}

if (failures.length) {
  console.error(`[verify-pricing-parity] FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[verify-pricing-parity] OK — pricing.js (25.000/250.000/0.005), i18n.js (8 dil) ve FAQ botu hepsi tutarlı.');
