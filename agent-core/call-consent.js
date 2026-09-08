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
  stylesheet.href = new URL('./call-consent.css?v=2', import.meta.url).href;
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
  // Camera toggle lives in the header's own control row (next to half/full/
  // min/close) instead of a floating card over the chat/video stage — a
  // floating mid-stage tray used to cover the conversation. The self-preview
  // video, when active, drops down from the button itself so it stays
  // anchored to that same top row rather than overlapping the stage.
  const ctrl = document.createElement('div');
  ctrl.className = 'veraliq-camera-ctrl';
  ctrl.innerHTML = '<button type="button" class="agent-btn veraliq-camera-btn" aria-pressed="false" title="Kamerayı aç">🎥</button>' +
    '<div class="veraliq-camera-panel" hidden><video muted autoplay playsinline aria-label="Yalnızca cihazınızdaki kamera önizlemesi"></video><span role="status"></span></div>';
  const controls = win.querySelector('.agent-controls');
  if (controls) controls.insertBefore(ctrl, controls.firstChild);
  else win.appendChild(ctrl); // defensive fallback if header markup ever changes
  ctrl.hidden = true;
  const video = ctrl.querySelector('video');
  video.muted = true;
  const status = ctrl.querySelector('span');
  const toggle = ctrl.querySelector('button');
  let accepted = false;
  let pending = null;
  let opening = false;
  let attempt = 0;
  const panel = ctrl.querySelector('.veraliq-camera-panel');
  // Only the "camera just turned on" path opens the panel — a failed
  // attempt keeps it open to show the error, and closing it back is only
  // ever the explicit act of the click handler below, never a side effect
  // of this reflecting the stream/button chrome.
  function reflectState(stream) {
    video.srcObject = stream || null;
    status.textContent = stream ? 'Kamera: yalnızca siz' : 'Kamera kapalı';
    toggle.title = stream ? 'Kamerayı kapat' : 'Kamerayı aç';
    toggle.setAttribute('aria-pressed', stream ? 'true' : 'false');
    toggle.classList.toggle('is-on', !!stream);
    if (stream) { panel.hidden = false; video.play().catch(() => {}); }
  }
  const camera = new LocalCameraPreview({ mediaDevices: navigator.mediaDevices, onStream: reflectState });
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
    panel.hidden = false;
    toggle.title = 'İzin isteğini iptal et';
    status.textContent = 'Kamera izni bekleniyor';
    try { await camera.open(); }
    catch { if (accepted && ownAttempt === attempt) status.textContent = 'Kamera açılamadı; kamerasız devam edebilirsiniz.'; }
    finally {
      if (ownAttempt === attempt) {
        opening = false;
        toggle.title = camera.stream ? 'Kamerayı kapat' : 'Kamerayı aç';
        toggle.setAttribute('aria-pressed', camera.stream ? 'true' : 'false');
        toggle.classList.toggle('is-on', !!camera.stream);
      }
    }
  }
  toggle.addEventListener('click', () => {
    if (camera.stream || opening) { attempt++; opening = false; camera.stop(); panel.hidden = true; }
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
    ctrl.hidden = false;
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
      ctrl.hidden = true;
      finish(false);
    },
  };
}
