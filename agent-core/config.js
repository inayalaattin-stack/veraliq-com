// agent-core/config.js
//
// SINGLE SOURCE OF TRUTH for "which model runs the Digital Human Engine".
// This is the file the spec means by "avatarProvider = 'quicktalk' şeklinde
// config üzerinden değiştirilebilsin" — change a string here, nothing else.
//
// Providers are loaded via dynamic import() so an unused provider's code
// (in particular anam-avatar-provider.js) is never fetched/parsed unless
// something actually selects it — this is what keeps Anam truly OUT of the
// default production path rather than just "unused but still shipped".

export const AGENT_PROVIDER_CONFIG = {
  // 'anam' (kept live on purpose — see note below) | 'mock' (no GPU, always available, for local dev/testing only) | 'quicktalk' | 'musetalk' | 'spatius'
  //
  // Kept on 'anam' deliberately: the new provider-agnostic pipeline below is
  // merged and ready, but the only zero-GPU avatar available today (Mock)
  // was judged not acceptable for real visitors (too crude/cartoonish for a
  // live site). Anam stays the production avatar until a real photoreal
  // self-hosted avatar (QuickTalk/MuseTalk on a GPU host) is ready to swap
  // in — at that point this one line is the only change needed.
  // 'spatius' PRODUCTION'A ALINDI (2026-08-25, Imparator onayi: "elif kaya
  // yayina al"). Persona: Elif Kaya (gorsel olarak Spatius'un "Clara" kutuphane
  // avatari). Turkce ses kalitesi henuz "gercek insan gibi" seviyesinde degil
  // (bkz. google-translate-tts-provider.js basindaki risk notlari) — Imparator
  // bunu bilerek "simdilik turkce destegi koymayalim, sonra dusunecegim" dedi;
  // yani ses su an ROBOTIK/KLASIK kalitede calisiyor, sessiz DEGIL. Daha iyi
  // bir ucretsiz/GPU'suz Turkce TTS bulununca burada sadece ttsProvider
  // degisecek, avatarProvider ayni kalacak.
  avatarProvider: 'spatius',
  // 'googleTranslate' ZORUNLU eşleşme: 'spatius' provider'i speak() icinde
  // gercek bir audioBuffer bekliyor (yoksa throw ediyor) ve orchestrator.js
  // bu hatayi sessizce yutuyor — yani 'webspeech' ile birlikte kullanilirsa
  // Elif Kaya gorunur ama HICBIR SES CIKMAZ (sessiz/bozuk production). Bu
  // yuzden 'spatius' secili oldugu surece ttsProvider da 'googleTranslate'
  // olmali. Kalite notu: klasik/robotik (insan gibi degil) — bkz.
  // google-translate-tts-provider.js basindaki 4 maddelik risk notu.
  ttsProvider: 'googleTranslate',
  // 'webspeech' (default today — free, browser-native) | 'whisper'
  sttProvider: 'webspeech',
  // 'faq' (default today — free, deterministic, no API key) | 'openai' | 'anthropic'
  llmProvider: 'faq',

  // When a self-hosted GPU service is selected (chatterbox/whisper/quicktalk/musetalk),
  // this is the base URL of YOUR server (see docs/SELF_HOSTED_DEPLOYMENT.md).
  // Left blank on purpose — filling this in is a deploy-time decision, never a
  // hard-coded secret, and nothing in this repo should silently point at a
  // stranger's server if it's left empty.
  selfHostedBaseUrl: '',
};

const LOADERS = {
  avatar: {
    mock: () => import('./avatar-providers/mock-avatar-provider.js').then((m) => m.MockAvatarProvider),
    quicktalk: () => import('./avatar-providers/quicktalk-avatar-provider.js').then((m) => m.QuickTalkAvatarProvider),
    musetalk: () => import('./avatar-providers/musetalk-avatar-provider.js').then((m) => m.MuseTalkAvatarProvider),
    anam: () => import('./avatar-providers/anam-avatar-provider.js').then((m) => m.AnamAvatarProvider),
    // Ücretsiz Avatar Havuzu — 1. sağlayıcı (Elif Kaya persona'sı, Spatius'un
    // "Clara" adlı kütüphane avatarını kullanıyor). Bkz. dosyanın
    // başındaki durum notu: production'a bağlanması için önce Spatius
    // hesabı + avatar-id + session-token worker'ı gerekiyor.
    spatius: () => import('./avatar-providers/spatius-avatar-provider.js').then((m) => m.SpatiusAvatarProvider),
  },
  tts: {
    webspeech: () => import('./tts-providers/webspeech-tts-provider.js').then((m) => m.WebSpeechTTSProvider),
    chatterbox: () => import('./tts-providers/chatterbox-tts-provider.js').then((m) => m.ChatterboxTTSProvider),
    googleTranslate: () => import('./tts-providers/google-translate-tts-provider.js').then((m) => m.GoogleTranslateTTSProvider),
  },
  stt: {
    webspeech: () => import('./stt-providers/webspeech-stt-provider.js').then((m) => m.WebSpeechSTTProvider),
    whisper: () => import('./stt-providers/whisper-stt-provider.js').then((m) => m.WhisperSTTProvider),
  },
  llm: {
    faq: () => import('./llm-providers/faq-sales-brain-provider.js').then((m) => m.FaqSalesBrainProvider),
    openai: () => import('./llm-providers/openai-provider.js').then((m) => m.OpenAIProvider),
    anthropic: () => import('./llm-providers/anthropic-provider.js').then((m) => m.AnthropicProvider),
  },
};

/**
 * Instantiates the four providers named in `config` (defaults to
 * AGENT_PROVIDER_CONFIG). Each provider class is dynamically imported so
 * switching providers never pulls in code for the ones you didn't pick.
 * @param {Partial<typeof AGENT_PROVIDER_CONFIG>} [overrides]
 */
export async function createProviders(overrides) {
  const cfg = Object.assign({}, AGENT_PROVIDER_CONFIG, overrides || {});

  const avatarLoader = LOADERS.avatar[cfg.avatarProvider];
  const ttsLoader = LOADERS.tts[cfg.ttsProvider];
  const sttLoader = LOADERS.stt[cfg.sttProvider];
  const llmLoader = LOADERS.llm[cfg.llmProvider];

  if (!avatarLoader) throw new Error('Unknown avatarProvider: ' + cfg.avatarProvider);
  if (!ttsLoader) throw new Error('Unknown ttsProvider: ' + cfg.ttsProvider);
  if (!sttLoader) throw new Error('Unknown sttProvider: ' + cfg.sttProvider);
  if (!llmLoader) throw new Error('Unknown llmProvider: ' + cfg.llmProvider);

  const [AvatarCls, TTSCls, STTCls, LLMCls] = await Promise.all([
    avatarLoader(), ttsLoader(), sttLoader(), llmLoader(),
  ]);

  return {
    avatar: new AvatarCls({ baseUrl: cfg.selfHostedBaseUrl }),
    tts: new TTSCls({ baseUrl: cfg.selfHostedBaseUrl }),
    stt: new STTCls({ baseUrl: cfg.selfHostedBaseUrl }),
    llm: new LLMCls({ baseUrl: cfg.selfHostedBaseUrl }),
    config: cfg,
  };
}
