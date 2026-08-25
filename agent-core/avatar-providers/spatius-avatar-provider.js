// agent-core/avatar-providers/spatius-avatar-provider.js
//
// SpatiusAvatarProvider — VERALIQ Ücretsiz Avatar Havuzu, 1. sağlayıcı.
//
// STATUS (2026-08-25): İSKELET / TAMAMLANMAMIŞ. Henüz production'a
// BAĞLANMADI ve config.js'teki varsayılan avatarProvider hâlâ 'anam'.
// Bu dosya, İmparator'ın onayladığı Spatius avatarı "Clara" (Spatius'un
// kendi kütüphanesindeki, vintage/kurumsal görünümlü avatar — Halima değil,
// karar 2026-08-25'te Clara olarak netleşti) için VERALIQ'in Clara
// karakterini Spatius'un Motion Server'ı üzerinden render etmeye
// hazırlanan bir provider'dır — ama devreye alınması için AŞAĞIDAKİ 2
// bilginin proje sahibi tarafından sağlanması gerekiyor (bkz.
// docs/SPATIUS_AVATAR_RESEARCH.md "Sıradaki Adım" bölümü). Ücretsiz Spatius
// hesabı 2026-08-25'te İmparator tarafından zaten açıldı:
//
//   1. SPATIUS_APP_ID / SPATIUS_API_KEY — Spatius Studio'nun (app.spatius.ai)
//      Settings/API sayfasından alınır. Bu ikisi SADECE worker-spatius/
//      Cloudflare Worker'ının secret'ı olarak saklanacak — tarayıcıya ASLA
//      gönderilmeyecek (brief madde 10).
//   2. SPATIUS_AVATAR_ID — app.spatius.ai/avatars/library sayfasında
//      "Clara" avatarının kartından kopyalanan avatar-id. Aşağıdaki
//      SPATIUS_AVATAR_ID sabitine yapıştırılacak.
//
// Hesap açma/parola girme işlemini BEN (Claude) hiçbir zaman yapamam — bu
// oturumun güvenlik kurallarından biri (kullanıcı isteği bile bunu
// değiştiremez); yukarıdaki 2 değeri İmparator kendisi Studio'dan alıp
// bana iletecek.
//
// MİMARİ NOTU — Spatius, Anam'ın aksine KENDİ TTS/LLM/STT'sini ÇALIŞTIRMAZ.
// Sadece "audio-in → lip-sync video-out" yapan saf bir render motoru
// (Motion Server). Bu iyi haber: Clara'nın TÜRKÇE konuşması Spatius'a
// değil, BİZİM seçtiğimiz TTS sağlayıcısına bağlı — yani Türkçe desteği
// site zaten sahip olduğumuz TTS katmanından geliyor (agent-core/tts-providers/).
// TEK KISIT: Spatius'a ham ses (PCM16) göndermemiz gerektiği için, bu
// provider yalnızca GERÇEK ses verisi (AudioBuffer) üreten bir
// TTSProvider ile çalışır — 'webspeech' (tarayıcı TTS'i, ham buffer
// vermiyor) İLE ÇALIŞMAZ. Bugün repodaki tek uyumlu aday 'chatterbox'
// (self-hosted, bkz. docs/SELF_HOSTED_DEPLOYMENT.md) ya da ileride
// eklenecek, ses verisi döndüren ücretsiz bulut bir Türkçe TTS.
//
// providesOwnPipeline=false / rendersOwnAudioFromText=false olarak
// işaretli — yani bu, QuickTalk/MuseTalk ailesiyle aynı "saf render
// backend'i" sözleşmesine uyuyor (agent-core/providers.js).
//
// DOĞRULANMAMIŞ VARSAYIMLAR (hesap + gerçek entegrasyon testi olmadan
// kesinleştirilemedi — docs.spatius.ai'nin metin özetlerinden çıkarıldı,
// gerçek @spatius/avatarkit paketinin TypeScript tipleri görülmedi):
//   - AvatarView'ın mount noktası bir <div> container mı yoksa <canvas> mı
//     bekliyor (burada videoEl bir container gibi kullanılıyor — TODO
//     gerçek quickstart demosunda (github.com/spatius-ai/spatius-avatar-demo)
//     doğrulanmalı).
//   - controller.send() için hedef sample rate / chunk boyutu.
//   - AvatarSDK.initialize()'ın tam imzası.
// Hesap açıldıktan sonra bu dosya, resmi Web SDK quickstart demosuyla
// satır satır karşılaştırılıp düzeltilmeli — o yüzden bu bir "iskelet",
// "bitmiş entegrasyon" değil.

import { AvatarProvider } from '../providers.js';
import { refusePaymentPrompt } from '../avatar-pool/free-tier-guard.js';

const AVATARKIT_CDN_URL = 'https://esm.sh/@spatius/avatarkit@latest';

// TODO(İmparator'dan bekleniyor): Clara'nın Spatius avatar-id'si.
// app.spatius.ai/avatars/library → Clara kartı → "Copy avatar-id".
const SPATIUS_AVATAR_ID = '';

// Bu worker HENÜZ DEPLOY EDİLMEDİ — worker-spatius/README.md'deki adımları
// izleyip kendi Cloudflare hesabınızdan deploy ettikten sonra buradaki
// URL'i gerçek workers.dev adresiyle güncelleyin.
const SPATIUS_SESSION_ENDPOINT = 'https://veraliq-spatius-session.<SIZIN-SUBDOMAIN>.workers.dev/session';

export class SpatiusAvatarProvider extends AvatarProvider {
  constructor() {
    super();
    this.providesOwnPipeline = false;
    this.rendersOwnAudioFromText = false;
    this._controller = null;
    this._avatarView = null;
    this._listeners = {};
  }

  async init({ videoEl } = {}) {
    if (!SPATIUS_AVATAR_ID) {
      throw new Error(
        '[SpatiusAvatarProvider] SPATIUS_AVATAR_ID boş — Clara\'nın avatar-id\'si ' +
        'henüz girilmedi. Bu provider seçilmemeli (config.js hâlâ \'anam\' kullanmalı).'
      );
    }
    // NOT: AvatarView muhtemelen bir <div> container bekliyor, ham bir
    // <video> elementi değil (3DGS/WebGL render). Widget bize her zaman bir
    // <video> veriyor (bkz. agent-core/widget.js) — TODO: gerçek entegrasyon
    // sırasında bunun yerine widget.js'e Spatius seçiliyken bir <div>
    // container eklenip eklenmeyeceği netleştirilmeli. Şimdilik parent
    // node'u container olarak kullanıyoruz.
    this._container = (videoEl && videoEl.parentElement) || videoEl;
  }

  async connect() {
    const mod = await import(/* webpackIgnore: true */ AVATARKIT_CDN_URL);
    const { AvatarSDK, AvatarManager, AvatarView, DrivingServiceMode } = mod;
    if (!AvatarSDK || !AvatarManager || !AvatarView) {
      throw new Error('spatius_sdk_shape_unexpected');
    }

    const { appId, sessionToken } = await this._fetchSessionToken();

    AvatarSDK.initialize(appId, { drivingServiceMode: DrivingServiceMode.direct });
    AvatarSDK.setSessionToken(sessionToken);

    const avatar = await AvatarManager.shared.load(SPATIUS_AVATAR_ID);
    this._avatarView = new AvatarView(avatar, this._container);
    this._controller = this._avatarView.controller;
    this._wireEvents(this._controller);

    // AvatarKit dokümantasyonu: initializeAudioContext() bir kullanıcı
    // jesti (tıklama) içinde çağrılmalı — VERALIQ zaten "Konuş" butonuna
    // tıklamayla başlıyor, o akışla uyumlu olmalı.
    await this._controller.initializeAudioContext();
    await this._controller.start();
  }

  async disconnect() {
    try { if (this._controller) this._controller.close(); } catch (e) {}
    try { if (this._avatarView) this._avatarView.dispose(); } catch (e) {}
    this._controller = null;
    this._avatarView = null;
  }

  /**
   * @param {{done: Promise<void>, stop: () => void, audioBuffer?: AudioBuffer}} ttsHandle
   */
  async speak(ttsHandle) {
    if (!this._controller) return;
    if (!ttsHandle || !ttsHandle.audioBuffer) {
      // Bkz. dosya başındaki mimari not: 'webspeech' gibi ham buffer
      // vermeyen bir TTS ile bu provider ÇALIŞMAZ. Sessizce başarısız olmak
      // yerine açıkça hata fırlatıyoruz ki yanlış TTS eşleşmesi config
      // aşamasında fark edilsin.
      throw new Error(
        '[SpatiusAvatarProvider] ttsProvider gerçek bir audioBuffer üretmiyor. ' +
        'Spatius için ttsProvider: \'chatterbox\' (veya buffer döndüren başka bir ' +
        'sağlayıcı) seçilmeli, \'webspeech\' değil.'
      );
    }
    const pcm16 = floatAudioBufferToPCM16(ttsHandle.audioBuffer);
    this._controller.send(pcm16, /* end */ true);
    if (ttsHandle.done) await ttsHandle.done;
  }

  stopSpeaking() {
    try { if (this._controller) this._controller.interrupt(); } catch (e) {}
  }

  // Spatius Direct Mode API'sinde bugün açık bir "emotion" kontrolü
  // dokümante edilmedi — best-effort no-op.
  setEmotion() {}
  setListening() {}

  on(event, handler) {
    (this._listeners[event] = this._listeners[event] || []).push(handler);
  }

  _emit(event) {
    (this._listeners[event] || []).forEach((h) => { try { h(); } catch (e) {} });
  }

  _wireEvents(controller) {
    controller.onConnectionState = (state) => {
      if (state === 'connected') this._emit('live');
      if (state === 'disconnected' || state === 'failed') this._emit('lost');
    };
    controller.onError = (err) => {
      // Ödeme/upgrade ile ilgili bir hata sinyali gelirse (ör. 402/403 +
      // "upgrade" içeren mesaj), ücretsiz-kota koruma katmanına bildir.
      // Router (ileride) bu sinyali dinleyip sıradaki provider'a geçecek.
      const msg = (err && (err.message || err.code || '')).toString().toLowerCase();
      if (msg.includes('upgrade') || msg.includes('payment') || msg.includes('quota')) {
        refusePaymentPrompt('spatius', msg);
      }
      this._emit('error');
    };
  }

  async _fetchSessionToken() {
    const resp = await fetch(SPATIUS_SESSION_ENDPOINT, { method: 'POST' });
    if (!resp.ok) throw new Error('spatius_session_token_http_' + resp.status);
    const data = await resp.json();
    if (!data || !data.sessionToken || !data.appId) throw new Error('spatius_session_token_missing');
    return data;
  }
}

/**
 * AvatarKit'in beklediği "mono 16-bit PCM (s16le)" formatına dönüştürür.
 * TODO: gerçek entegrasyonda hedef sample rate (session config'te
 * belirlenen) ile AudioBuffer'ın kendi sample rate'i eşleşmiyorsa
 * resample gerekir — bu basit sürüm resample YAPMIYOR, sadece
 * float32 -> int16 dönüşümü yapıyor.
 * @param {AudioBuffer} audioBuffer
 * @returns {Int16Array}
 */
function floatAudioBufferToPCM16(audioBuffer) {
  const float32 = audioBuffer.getChannelData(0);
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}
