// agent-core/avatar-providers/spatius-avatar-provider.js
//
// SpatiusAvatarProvider — VERALIQ Ücretsiz Avatar Havuzu, 1. sağlayıcı.
//
// STATUS (2026-08-25): PRODUCTION'A ALINDI — Imparator onayi: "elif kaya
// yayina al simdilik turkce destegi koymayalim sonra dusunecegim". config.js
// artik avatarProvider: 'spatius' + ttsProvider: 'googleTranslate' (zorunlu
// eslesme, asagida ve config.js'te aciklandi). Baglanti + gorsel render
// ucdan uca CANLI dogrulandi (spatius-test.html uzerinden, Claude'un kendi
// Chrome oturumuyla otomatik test edildi): Clara gorseli dogru yukleniyor,
// "App ID mismatch" hatasi KOKTEN cozuldu (JWT'den okuma), baglanti
// "connected" durumunda kaliyor. Ses tarafi: google-translate-tts-provider.js
// (bkz. o dosyanin basindaki 4 maddelik risk notu) su an ROBOTIK/KLASIK
// kalitede calisiyor, insan gibi degil — Imparator bunu BILEREK kabul etti
// ve daha iyi bir ucretsiz/GPU'suz Turkce TTS bulununca (Piper WASM veya
// benzeri) sadece config.js'teki ttsProvider degisecek.
// NOT (2026-08-25): VERALIQ'in ortak AI satış danışmanı persona ismi
// "Clara" değil "Elif Kaya" — mevcut canlı Anam entegrasyonuyla (bkz.
// worker/session-worker.js, script.js) aynı isim, tutarlılık için
// İmparator'ın talebiyle düzeltildi. Aşağıdaki "Clara" geçen yerler,
// Spatius'un KENDİ kütüphanesindeki avatarın kendi katalog adı — o görsel
// avatarı Elif Kaya persona'sı için kullanıyoruz, isim çakışması sadece
// tesadüf.
//
// Bu dosya, İmparator'ın onayladığı Spatius avatarı "Clara" (Spatius'un
// kendi kütüphanesindeki, vintage/kurumsal görünümlü avatar — Halima değil,
// karar 2026-08-25'te Clara olarak netleşti) için VERALIQ'in Elif Kaya
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
// (Motion Server). Bu iyi haber: Elif Kaya'nın TÜRKÇE konuşması Spatius'a
// değil, BİZİM seçtiğimiz TTS sağlayıcısına bağlı — yani Türkçe desteği
// site zaten sahip olduğumuz TTS katmanından geliyor (agent-core/tts-providers/).
// TEK KISIT: Spatius'a ham ses (PCM16) göndermemiz gerektiği için, bu
// provider yalnızca GERÇEK ses verisi (AudioBuffer) üreten bir
// TTSProvider ile çalışır — 'webspeech' (tarayıcı TTS'i, ham buffer
// vermiyor) İLE ÇALIŞMAZ. Uyumlu adaylar: 'googleTranslate' (ücretsiz
// bulut, bkz. agent-core/tts-providers/google-translate-tts-provider.js —
// bugün canlı test edilen, hesap/kart gerektirmeyen seçenek) ya da
// 'chatterbox' (self-hosted, GPU gerektirir, bkz.
// docs/SELF_HOSTED_DEPLOYMENT.md — henüz kurulmadı).
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

// Elif Kaya için kullanılacak Spatius avatar-id'si — Spatius kütüphanesindeki
// "Clara" avatarının id'si. app.spatius.ai/avatars/library'den
// (İmparator'ın hesabına giriş yapmış tarayıcısı üzerinden, sadece bu genel
// kimlik değeri okunarak — API Key sayfasına hiç girilmedi) 2026-08-25'te alındı.
//
// DÜZELTME (2026-08-25): İlk seferde yanlışlıkla Halima'nın id'si
// (c7069121-8245-4015-9940-82d0dc0c6bda) buraya girilmişti — spatius-test.html
// ile canlı testte avatar Clara değil Halima olarak göründü VE
// "controller.onError: App ID mismatch" hatası alındı (Halima'nın id'si bu
// hesabın/App ID'sinin avatar listesine ait değildi). Spatius Studio'nun
// Herkese Açık Avatarlar sayfası (accessibility tree ile tam/kısaltılmamış
// id okunarak) tekrar kontrol edildi — Clara'nın doğru id'si:
const SPATIUS_AVATAR_ID = 'd51ab422-3db7-47cc-afa8-7273b02bc70b';

// Worker 2026-08-25'te deploy edildi (worker-spatius/README.md), secret'lar
// (SPATIUS_APP_ID / SPATIUS_API_KEY) girildi. Session-token akışı CANLI
// test edildi ve doğrulandı (gerçek sessionToken + appId dönüyor, JWT'den
// okunan appId App ID mismatch hatasını çözdü). Aynı worker artık ayrıca
// bir /tts route'u da sunuyor (google-translate-tts-provider.js için).
const SPATIUS_SESSION_ENDPOINT = 'https://veraliq-spatius-session.veraliq-com.workers.dev/session';

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
        '[SpatiusAvatarProvider] SPATIUS_AVATAR_ID boş — Elif Kaya için kullanılacak avatar-id\'si ' +
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

    // initialize() ASENKRON — spatius-test.html ile canlı doğrulandı:
    // await edilmezse AvatarManager.shared.load() "AvatarSDK not
    // initialized" hatası fırlatıyor.
    await AvatarSDK.initialize(appId, { drivingServiceMode: DrivingServiceMode.direct });
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
   * @param {{done: Promise<void>, stop: () => void, audioBuffer?: AudioBuffer, audioBufferPromise?: Promise<AudioBuffer>}} ttsHandle
   */
  async speak(ttsHandle) {
    if (!this._controller) return;

    // GUNCELLEME (2026-08-25): audioBuffer artik SENKRON hazir olmayabilir -
    // google-translate-tts-provider.js gibi ag tabanli saglayicilar ses
    // verisini fetch+decode ETTIKTEN sonra doldurabiliyor, bu yuzden bir
    // `audioBufferPromise` da destekleniyor. webspeech/chatterbox gibi
    // buffer HIC uretmeyen/uretemeyen saglayicilar icin davranis ayni kaliyor
    // (asagida hata firlatiliyor).
    let audioBuffer = ttsHandle && ttsHandle.audioBuffer;
    if (!audioBuffer && ttsHandle && ttsHandle.audioBufferPromise) {
      audioBuffer = await ttsHandle.audioBufferPromise;
    }

    if (!audioBuffer) {
      // Bkz. dosya başındaki mimari not: 'webspeech' gibi ham buffer
      // vermeyen bir TTS ile bu provider ÇALIŞMAZ. Sessizce başarısız olmak
      // yerine açıkça hata fırlatıyoruz ki yanlış TTS eşleşmesi config
      // aşamasında fark edilsin.
      throw new Error(
        '[SpatiusAvatarProvider] ttsProvider gerçek bir audioBuffer üretmiyor (veya ' +
        'üretim başarısız oldu). Spatius için ttsProvider: \'googleTranslate\' veya ' +
        '\'chatterbox\' (buffer döndüren bir sağlayıcı) seçilmeli, \'webspeech\' değil.'
      );
    }
    const pcm16 = floatAudioBufferToPCM16(audioBuffer);
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

// AvatarKit'in beklediği tam hedef sample rate resmi dokümanlarda hiç
// belirtilmedi (yukarıdaki "DOĞRULANMAMIŞ VARSAYIMLAR" notu) — 16000 Hz,
// spatius-test.html'deki ilk canlı testte (sentetik 440Hz ton, hatasız
// kabul edildi) kullanılan değerle aynı tutuluyor, tutarlılık için.
const SPATIUS_TARGET_SAMPLE_RATE = 16000;

/**
 * AvatarKit'in beklediği "mono 16-bit PCM (s16le)" formatına dönüştürür.
 * GÜNCELLEME (2026-08-25): artık kaynak AudioBuffer'ın sample rate'i
 * hedeften farklıysa BASİT DOĞRUSAL (linear) resample uygulanıyor — önceki
 * sürüm bunu atlıyordu, bu da gerçek bir TTS (örn. Google'ın ~24kHz mp3'ü)
 * Spatius'un beklediği hızdan farklı bir hızda gönderilirse sesin
 * "hızlı/tiz" ya da "yavaş/kalın" çıkmasına (kalite sorunuyla karıştırılabilecek
 * bir artefakta) yol açabilirdi. Doğrusal resample mükemmel değildir (basit
 * bir alçak geçiren filtre yok) ama bu ölçekte (konuşma sesi) fark
 * edilmeyecek kadar iyi sonuç verir.
 * @param {AudioBuffer} audioBuffer
 * @returns {Int16Array}
 */
function floatAudioBufferToPCM16(audioBuffer) {
  let float32 = audioBuffer.getChannelData(0);
  const srcRate = audioBuffer.sampleRate;

  if (srcRate !== SPATIUS_TARGET_SAMPLE_RATE) {
    const ratio = srcRate / SPATIUS_TARGET_SAMPLE_RATE;
    const outLength = Math.round(float32.length / ratio);
    const resampled = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const srcPos = i * ratio;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, float32.length - 1);
      const frac = srcPos - i0;
      resampled[i] = float32[i0] * (1 - frac) + float32[i1] * frac;
    }
    float32 = resampled;
  }

  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}
