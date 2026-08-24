// Veraliq — site interactivity
// SECURITY NOTE: This file intentionally contains NO API keys.
// Never place secret keys in client-side JavaScript — they become
// publicly visible to anyone who views page source.
//
// NOTE (Ağustos 2026): Sitedeki canlı AI Agent ("Elif Kaya") artık burada
// yazılmış bir chat/avatar UI değil — tamamen Anam.ai'nin kendi
// barındırdığı widget'ı (bkz. index.html, </body> öncesi <anam-agent>
// satırı). Görüntü, ses, dil geçişi (TR/EN) ve konuşma mantığının
// tamamı Anam Lab'de (persona: Elif Kaya) yapılandırıldı ve orada
// yönetiliyor. Bu dosya artık sadece sitenin geri kalan sıradan
// etkileşimlerinden (mobil menü, SSS akordeonu, demo formu) sorumlu.

(function () {
  'use strict';

  // ---- Mobile nav toggle ----
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
      });
    });
  }

  // ---- FAQ accordion ----
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (el) { el.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  // ---- Demo form: honest fallback — opens a prefilled email, since no
  // backend CRM endpoint is wired up yet. ----
  var demoForm = document.getElementById('demoForm');
  if (demoForm) {
    demoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(demoForm);
      var subject = encodeURIComponent('Veraliq Demo Talebi — ' + (data.get('company') || ''));
      var bodyLines = [
        'Ad Soyad: ' + (data.get('name') || ''),
        'Şirket: ' + (data.get('company') || ''),
        'Telefon: ' + (data.get('phone') || ''),
        'E-posta: ' + (data.get('email') || ''),
        'Şirket Türü: ' + (data.get('type') || ''),
        'Aylık Lead/Satış Hacmi: ' + (data.get('volume') || '')
      ];
      var body = encodeURIComponent(bodyLines.join('\n'));
      window.location.href = 'mailto:info@veraliq.com?subject=' + subject + '&body=' + body;
      var status = document.getElementById('formStatus');
      if (status) status.classList.add('show');
    });
  }
})();
