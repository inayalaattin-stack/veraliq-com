// Camera frames stay in this module and the local video element only.
// No recording, networking, face recognition or psychological inference.
export class LocalCameraPreview {
  constructor({ mediaDevices, onStream = () => {} }) {
    this.mediaDevices = mediaDevices;
    this.onStream = onStream;
    this.stream = null;
    this.generation = 0;
  }
  async open() {
    this.stop();
    const generation = this.generation;
    if (!this.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
    const stream = await this.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return false;
    }
    this.stream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener?.('ended', () => {
      if (this.stream === stream) this.stop();
    }));
    this.onStream(stream);
    return true;
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.onStream(null);
  }
}

export function createCallConsent({ win, conversationLogging = false }) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./call-consent.css', import.meta.url).href;
  document.head.appendChild(stylesheet);
  const dialog = document.createElement('dialog');
  dialog.className = 'veraliq-call-consent';
  dialog.setAttribute('aria-labelledby', 'veraliqConsentTitle');
  dialog.innerHTML = `
    <h2 id="veraliqConsentTitle">Görüşme sizin kontrolünüzde</h2>
    <p>Bu kişi gerçek bir insan değil, Veraliq’in yapay zekâ asistanıdır. Satış görüşmelerinin ticari amacı vardır.</p>
    <p>Sesli görüşmeye katıldığınızda sesiniz yapılandırılmış konuşma tanıma sağlayıcısı tarafından işlenir. Mevcut kurulum tarayıcı veya üçüncü taraf servisleri kullanabilir; henüz tamamen yerel çalışma garantisi yoktur.</p>
    <p data-logging></p>
    <label><input type="checkbox" data-accept> AI kimliğini, veri işleme açıklamasını ve sesli görüşmeye katıldığımda mikrofon kullanımını kabul ediyorum.</label>
    <label><input type="checkbox" data-camera> Kameramı yalnızca kendi önizlemem için aç (isteğe bağlı).</label>
    <p>Kamera görüntüsü bu özellik tarafından gönderilmez veya kaydedilmez. Yüz tanıma, ruh hâli analizi ve gizli psikolojik yönlendirme yapılmaz.</p>
    <div class="veraliq-consent-actions"><button type="button" data-cancel>Vazgeç</button><button type="button" data-confirm disabled>Onayla ve başlat</button></div>`;
  dialog.querySelector('[data-logging]').textContent = conversationLogging
    ? 'Bu panelde görüşme metinleri ve oturum bilgileri mevcut şirket görüşme kaydına yazılabilir. Kapatmak önceki kayıtları silmez. Ayrıntılar için gizlilik politikasını inceleyin.'
    : 'Mesaj ve yanıtlar seçili sağlayıcılara iletilebilir. Bu izin katmanı ek bir görüşme kaydı oluşturmaz; sağlayıcıların saklama koşulları ayrıca geçerlidir.';
  document.body.appendChild(dialog);
  const tray = document.createElement('aside');
  tray.className = 'veraliq-camera-tray';
  tray.hidden = true;
  tray.innerHTML = '<video muted autoplay playsinline aria-label="Yalnızca cihazınızdaki kamera önizlemesi"></video><span role="status">Kamera kapalı</span><button type="button">Kamerayı aç</button>';
  win.appendChild(tray);
  const video = tray.querySelector('video');
  video.muted = true;
  const status = tray.querySelector('span');
  const toggle = tray.querySelector('button');
  let accepted = false;
  let pending = null;
  let opening = false;
  let attempt = 0;
  const camera = new LocalCameraPreview({ mediaDevices: navigator.mediaDevices, onStream(stream) {
    video.srcObject = stream;
    video.hidden = !stream;
    status.textContent = stream ? 'Kamera: yalnızca siz' : 'Kamera kapalı';
    toggle.textContent = stream ? 'Kamerayı kapat' : 'Kamerayı aç';
    if (stream) video.play().catch(() => {});
  }});
  camera.stop();
  function finish(value) {
    const resolve = pending;
    pending = null;
    if (dialog.open) dialog.close();
    resolve?.(value);
  }
  async function openCamera() {
    if (!accepted || opening) return;
    const ownAttempt = ++attempt;
    opening = true;
    toggle.textContent = 'İzin isteğini iptal et';
    status.textContent = 'Kamera izni bekleniyor';
    try { await camera.open(); }
    catch { if (accepted && ownAttempt === attempt) status.textContent = 'Kamera açılamadı; kamerasız devam edebilirsiniz.'; }
    finally {
      if (ownAttempt === attempt) { opening = false; toggle.textContent = camera.stream ? 'Kamerayı kapat' : 'Kamerayı aç'; }
    }
  }
  toggle.addEventListener('click', () => {
    if (camera.stream || opening) { attempt++; opening = false; camera.stop(); }
    else openCamera();
  });
  const checkbox = dialog.querySelector('[data-accept]');
  const confirm = dialog.querySelector('[data-confirm]');
  checkbox.addEventListener('change', () => { confirm.disabled = !checkbox.checked; });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
  dialog.addEventListener('close', () => { if (pending) finish(false); });
  confirm.addEventListener('click', () => {
    if (!checkbox.checked || !pending) return;
    accepted = true;
    tray.hidden = false;
    const withCamera = dialog.querySelector('[data-camera]').checked;
    finish(true);
    if (withCamera) openCamera();
  });
  return {
    get accepted() { return accepted; },
    request() {
      if (pending) return Promise.resolve(false);
      checkbox.checked = false;
      confirm.disabled = true;
      dialog.querySelector('[data-camera]').checked = false;
      return new Promise(resolve => { pending = resolve; dialog.showModal(); });
    },
    revoke() {
      accepted = false;
      attempt++;
      opening = false;
      camera.stop();
      tray.hidden = true;
      finish(false);
    },
  };
}
