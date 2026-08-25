// agent-core/tts-providers/google-translate-tts-provider.js
//
// GoogleTranslateTTSProvider — ucretsiz, kredi karti/hesap GEREKTIRMEYEN
// bulut TTS. "konusma testlerini tamamla ve yayina al" istegi uzerine
// eklendi (2026-08-25): Spatius (agent-core/avatar-providers/
// spatius-avatar-provider.js) kendi TTS'ini calistirmiyor - Turkce'nin
// akici/insansi cikmasi tamamen BU dosyanin urettigi ses kalitesine bagli.
//
// NASIL CALISIYOR: Google Translate'in kendi web arayuzunun kullandigi,
// resmi olarak dokumante EDILMEMIS "translate_tts" endpoint'ini kullanir
// (gTTS gibi populer acik kaynak kutuphanelerin de dayandigi ayni
// endpoint - client=tw-ob varyanti, token/API key gerektirmiyor). Tarayici
// bu endpoint'e doğrudan fetch atamiyor (CORS izni yok) - bu yuzden
// worker-spatius/session-worker.js icindeki /tts route'u uzerinden
// proxy'leniyor (bkz. o dosyadaki "DORDUNCU EKLENTI" notu).
//
// ONEMLI - RISK VE SINIRLAR (kullanicinin bilmesi gereken):
//   1. RESMI DEGIL: Google bu endpoint'i istedigi an degistirebilir,
//      hiz siniri koyabilir veya tamamen kapatabilir - hicbir SLA/garanti
//     yok. StreamElements'in ayni kategorideki eski ucretsiz endpoint'i
//     TAM OLARAK bu yuzden bu oturum icinde canli test sirasinda
//     kapatilmis bulundu ("401 - No API key was found").
//   2. TICARI KULLANIM ACIKCA LISANSLANMAMIS: Google bunu kendi Translate
//     web sitesi icin sunuyor, ucuncu taraf ticari urunler icin resmi bir
//     kullanim izni/lisansi yayinlamadi. VERALIQ ticari bir urun oldugu
//     icin bu, "gecici/dogrulama amacli ucretsiz test katmani" olarak
//     goruluyor - KALICI/uzun vadeli production sesi olarak degil.
//     Uzun vadede resmi, lisansli bir TTS'e (orn. kendi GPU'nuzda
//     Chatterbox, bkz. docs/SELF_HOSTED_DEPLOYMENT.md) gecilmesi onerilir.
//   3. SES KALITESI: Google Translate'in bu eski/klasik motoru, ElevenLabs/
//     Azure Neural gibi modern "neural" TTS'lerin dogallik seviyesinde
//     DEGIL - anlasilir ve dogru telaffuzlu Turkce uretir ama "insan gibi"
//     degil, klasik/robotik bir ton. Bu, akici VE hatasiz (doğru telaffuz,
//     doğru cumle bilgisi) ama "insansi" olma iddiasinin tam karsilanmadigi
//     anlamina gelir - nihai kalite degerlendirmesi (dinleyerek) projeyi
//     onaylayacak kisiye (Imparator'a) ait, ben (Claude) sesi duyamiyorum.
//   4. UZUNLUK SINIRI: Upstream endpoint ~200 karakterden uzun metinlerde
//     hata veriyor/kesiliyor - bu yuzden asagida metin cumle sinirlarinda
//     parcalara bolunup her parca ayri ayri sese cevrilip tek bir
//     AudioBuffer'da birlestiriliyor.
//
// SOZLESME NOTU (agent-core/providers.js TTSProvider ile bir fark):
// speak() SENKRON bir handle donduruyor (barge-in icin stop() hemen
// calismali) ama gercek audioBuffer AG ISTEGI + decode gerektirdigi icin
// hemen hazir olamiyor. Bu yuzden standart `audioBuffer` alanina EK olarak
// `audioBufferPromise` alani da donduruluyor - SpatiusAvatarProvider.speak()
// bunu destekleyecek sekilde guncellendi (bkz. o dosya).
//
// Bu saglayici SESI KENDISI CALMAZ (hoparlorden) - sadece bir AudioBuffer
// uretir. Bilerek boyle: Spatius ile kullanimda gercek ses cikisi
// Spatius'un kendi render pipeline'indan (controller.send() ile beslenen
// PCM'den) geliyor - burada da caldirilirsa ses IKI KEZ duyulur. Ileride bu
// saglayici webspeech'in yerine baska (Spatius olmayan) bir avatar ile
// varsayilan yapilirsa, o zaman audioBuffer'i AudioContext.destination'a
// baglayip caldirma mantigi eklenmeli - bugun bu KAPSAM DISI.

import { TTSProvider } from '../providers.js';

const TTS_ENDPOINT = 'https://veraliq-spatius-session.veraliq-com.workers.dev/tts';
const MAX_CHARS_PER_CHUNK = 180; // upstream ~200 siniri altinda, guvenli pay

// Metni cumle/virgul sinirlarinda, MAX_CHARS_PER_CHUNK'i asmayacak
// parcalara bolen basit bir yardimci. Kelime ortasindan kesmemeye calisir.
function splitIntoChunks(text, maxLen) {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  // Once cumle sinirlarinda (., !, ?) bol.
  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length <= maxLen) {
      current += sentence;
      continue;
    }
    if (current) chunks.push(current.trim());
    if (sentence.length <= maxLen) {
      current = sentence;
    } else {
      // Tek cumle bile cok uzun - kelime sinirlarinda zorla bol.
      const words = sentence.split(/\s+/);
      current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length > maxLen) {
          if (current) chunks.push(current.trim());
          current = word;
        } else {
          current = (current + ' ' + word).trim();
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Birden fazla AudioBuffer'i (ayni sample rate/kanal sayisi varsayimiyla -
// hepsi ayni upstream'den geldigi icin bu guvenli) tek bir AudioBuffer'da
// art arda birlestirir.
function mergeAudioBuffers(ctx, buffers) {
  if (buffers.length === 1) return buffers[0];
  const numChannels = buffers[0].numberOfChannels;
  const sampleRate = buffers[0].sampleRate;
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const merged = ctx.createBuffer(numChannels, totalLength, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const out = merged.getChannelData(ch);
    let offset = 0;
    for (const buf of buffers) {
      // Kaynak buffer'da bu kanal yoksa (orn. mono kaynak, stereo hedef)
      // kanal 0'i tekrar kullan.
      const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
      out.set(src, offset);
      offset += buf.length;
    }
  }
  return merged;
}

export class GoogleTranslateTTSProvider extends TTSProvider {
  speak(text, opts) {
    const lang = ((opts && opts.lang) || 'tr-TR').split('-')[0];
    const abortController = new AbortController();
    let stopped = false;
    let doneTimer = null;
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });

    const finish = () => {
      if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
      resolveDone();
    };

    const handle = {
      audioBuffer: null,
      audioBufferPromise: null,
      done,
      stop: () => {
        stopped = true;
        try { abortController.abort(); } catch (e) {}
        finish();
      },
    };

    handle.audioBufferPromise = (async () => {
      const chunks = splitIntoChunks(text, MAX_CHARS_PER_CHUNK);
      if (chunks.length === 0) { finish(); return null; }

      let ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        finish();
        return null;
      }

      const decoded = [];
      try {
        for (const chunk of chunks) {
          if (stopped) break;
          const url = TTS_ENDPOINT + '?text=' + encodeURIComponent(chunk) + '&lang=' + encodeURIComponent(lang);
          const resp = await fetch(url, { signal: abortController.signal });
          if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error('google_translate_tts_failed_' + resp.status + '_' + body.slice(0, 150));
          }
          const arrayBuf = await resp.arrayBuffer();
          const buf = await ctx.decodeAudioData(arrayBuf.slice(0));
          decoded.push(buf);
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[GoogleTranslateTTSProvider] hata:', e && e.message ? e.message : e);
        }
        finish();
        return null;
      }

      if (stopped || decoded.length === 0) { finish(); return null; }

      const merged = mergeAudioBuffers(ctx, decoded);
      handle.audioBuffer = merged;
      // done, gercek ses suresi kadar sonra cozulur - orchestrator.js bunu
      // "avatar konusmayi ne zaman bitirir" olarak kullaniyor (bkz.
      // agent-core/orchestrator.js _speakReply). Erken cozulurse mikrofon
      // avatar hala konusurken tekrar acilir.
      doneTimer = setTimeout(finish, Math.max(200, merged.duration * 1000));
      return merged;
    })();

    return handle;
  }
}
