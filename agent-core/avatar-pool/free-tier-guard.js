// agent-core/avatar-pool/free-tier-guard.js
//
// VERALIQ ÜCRETSİZ AVATAR HAVUZU — ödeme koruması (bkz. proje brief'i,
// "6. ÖDEME KORUMASI" ve "18. ÜCRETLİ PLANA KARŞI KORUMA").
//
// Bu dosya, gelecekte eklenecek HER avatar sağlayıcısı (Spatius, Simli,
// Beyond Presence, Tavus, D-ID, HeyGen LiveAvatar, ...) için ORTAK ve
// TEK bir ödeme-koruma katmanıdır. Amaç: kod içinde hiçbir yerde
// `auto_upgrade = true` benzeri bir davranış OLMASIN; provider'lar bu
// sabitleri import edip kendi mantıklarında kullansın.
//
// KURAL: Bu üç sabiti false'tan true'ya çevirmek — ya da bu dosyayı
// bypass eden yeni bir yol eklemek — YASAK. Ücretli bir plana geçiş,
// kredi kartı ekleme veya otomatik ödeme başlatma ihtiyacı doğarsa,
// bunu proje sahibi (İmparator) elle ve bilerek yapar; kod bunu asla
// kendiliğinden yapmaz.

export const AUTO_UPGRADE = false;
export const PAYMENTS_ENABLED = false;
export const PAID_PROVIDERS_ALLOWED = false;

/**
 * Brief'in 5. maddesindeki durum kümesi. Router (ileride kurulacak
 * agent-core/avatar-pool/avatar-router.js), bu durumlardan herhangi
 * birine sahip bir provider'ı OTOMATİK olarak devre dışı bırakmalı ve
 * sıradaki ücretsiz provider'a geçmelidir.
 */
export const PROVIDER_STATUS = Object.freeze({
  FREE_AVAILABLE: 'FREE_AVAILABLE',
  FREE_QUOTA_EXHAUSTED: 'FREE_QUOTA_EXHAUSTED',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  API_LIMIT_REACHED: 'API_LIMIT_REACHED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  AVATAR_UNAVAILABLE: 'AVATAR_UNAVAILABLE',
  // Brief madde 18: provider sadece ücretli plana izin veriyorsa bu durum
  // kullanılır ve router onu HİÇBİR ZAMAN seçmemelidir.
  PAID_ONLY: 'PAID_ONLY',
});

const NEVER_USABLE_STATUSES = new Set([
  PROVIDER_STATUS.FREE_QUOTA_EXHAUSTED,
  PROVIDER_STATUS.TRIAL_EXPIRED,
  PROVIDER_STATUS.PAYMENT_REQUIRED,
  PROVIDER_STATUS.API_LIMIT_REACHED,
  PROVIDER_STATUS.ACCOUNT_SUSPENDED,
  PROVIDER_STATUS.PROVIDER_ERROR,
  PROVIDER_STATUS.AVATAR_UNAVAILABLE,
  PROVIDER_STATUS.PAID_ONLY,
]);

/**
 * Bir provider'ın şu an kullanılabilir olup olmadığını tek bir yerden
 * karara bağlar. Router bu fonksiyonu HER görüşme başlamadan önce
 * çağırmalı (brief madde 7) — true dönmüyorsa o provider atlanır.
 * @param {string} status - PROVIDER_STATUS değerlerinden biri
 * @returns {boolean}
 */
export function isProviderUsable(status) {
  if (status === PROVIDER_STATUS.PAID_ONLY && !PAID_PROVIDERS_ALLOWED) return false;
  if (NEVER_USABLE_STATUSES.has(status)) return false;
  return status === PROVIDER_STATUS.FREE_AVAILABLE;
}

/**
 * Bir provider entegrasyonu, kod akışının herhangi bir noktasında bir
 * ödeme ekranı / "Upgrade" isteği / kredi kartı formu / otomatik ödeme
 * tetiklemesiyle karşılaşırsa bunu ÇAĞIRMALI. Asla o isteği otomatik
 * tamamlamaya çalışmamalı — sadece bu guard'ı çağırıp o provider'ı
 * PAYMENT_REQUIRED olarak işaretleyip vazgeçmeli.
 * @param {string} providerName
 * @param {string} reason - örn. "credit_card_form_detected", "upgrade_prompt"
 */
export function refusePaymentPrompt(providerName, reason) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(
      '[FreeTierGuard] ' + providerName + ' ödeme/upgrade istedi (' + reason + ') — ' +
      'PAYMENTS_ENABLED=false olduğu için bu provider KULLANILMAYACAK. Sıradaki ücretsiz ' +
      'provider\'a geçilmeli.'
    );
  }
  return PROVIDER_STATUS.PAYMENT_REQUIRED;
}
