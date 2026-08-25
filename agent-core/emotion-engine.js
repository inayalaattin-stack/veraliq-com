// agent-core/emotion-engine.js
//
// EmotionEngine — maps conversational content to one of the emotion states
// from the spec: greeting, neutral, happy, excited, surprised, thinking,
// concerned, empathetic, professional.
//
// Two paths feed it:
//   1. An LLMProvider that already returns an explicit `emotion` field —
//      normalizeEmotion() just validates/clamps it to a known value.
//   2. A lightweight keyword heuristic (classifyCustomerText /
//      classifyReplyText) used by providers (like the FAQ sales brain) that
//      don't reason about emotion themselves, and as a safety-net fallback.
//
// Deliberately conservative: per the spec ("mimikler abartılı çizgi film
// karakteri gibi olmamalı — kurumsal ve doğal olmalı"), the default is
// always 'neutral' or 'professional', and only clear signals move off it.

export const EMOTIONS = Object.freeze([
  'greeting', 'neutral', 'happy', 'excited', 'surprised',
  'thinking', 'concerned', 'empathetic', 'professional',
]);

export function normalizeEmotion(value) {
  return EMOTIONS.includes(value) ? value : 'neutral';
}

// Keyword lists are Turkish-first (VERALIQ's primary market) with an
// English fallback layer. This is intentionally simple pattern matching —
// not a classifier model — so it's auditable and has zero inference cost.
const POSITIVE_TR = ['teşekkür', 'harika', 'mükemmel', 'beğendim', 'süper', 'çok iyi', 'memnun'];
const POSITIVE_EN = ['thank', 'great', 'excellent', 'love it', 'awesome', 'perfect'];
const CONCERN_TR = ['pahalı', 'yüksek', 'fiyat benim için', 'endişe', 'emin değilim', 'şüphe', 'sorun'];
const CONCERN_EN = ['expensive', 'too high', 'worried', 'not sure', 'concerned', 'problem'];
const SURPRISE_TR = ['gerçekten mi', 'ciddi misin', 'inanamıyorum', 'vay'];
const SURPRISE_EN = ['really?', 'no way', 'wow', "can't believe"];
const QUESTION_MARKERS = ['?', 'nasıl', 'neden', 'ne zaman', 'kaç', 'how', 'why', 'when', 'what'];

function containsAny(text, list) {
  const t = text.toLowerCase();
  return list.some((k) => t.includes(k));
}

/** Classify the CUSTOMER's message — used to pick how the agent should feel while responding. */
export function classifyCustomerText(text) {
  if (!text) return 'neutral';
  if (containsAny(text, POSITIVE_TR) || containsAny(text, POSITIVE_EN)) return 'happy';
  if (containsAny(text, CONCERN_TR) || containsAny(text, CONCERN_EN)) return 'empathetic';
  if (containsAny(text, SURPRISE_TR) || containsAny(text, SURPRISE_EN)) return 'surprised';
  if (containsAny(text, QUESTION_MARKERS)) return 'thinking';
  return 'neutral';
}

/** Classify the AGENT's own reply text as a fallback when a provider gives no explicit emotion. */
export function classifyReplyText(text) {
  if (!text) return 'professional';
  if (containsAny(text, POSITIVE_TR) || containsAny(text, POSITIVE_EN)) return 'happy';
  if (containsAny(text, CONCERN_TR) || containsAny(text, CONCERN_EN)) return 'empathetic';
  return 'professional';
}
