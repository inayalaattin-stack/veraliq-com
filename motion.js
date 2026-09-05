// VERALIQ — scroll-reveal + cursor-tilt motion layer.
// Additive only: never touches functional hooks used by script.js/widget.js.
// No-ops entirely under prefers-reduced-motion.
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // Immediate reveal (hero) — play once, right after paint.
  var immediate = document.querySelectorAll('[data-reveal-immediate]');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      immediate.forEach(function (el) { el.classList.add('in-view'); });
    });
  });

  // Scroll reveal — stagger index via --reveal-i for elements sharing a parent.
  var counters = new WeakMap();
  document.querySelectorAll('[data-reveal="rise"]').forEach(function (el) {
    var parent = el.parentElement;
    var i = counters.get(parent) || 0;
    el.style.setProperty('--reveal-i', i);
    counters.set(parent, i + 1);
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('in-view'); });
  }

  // Cursor tilt for card grids — small, premium 3D response, not a gimmick.
  var MAX_TILT = 6; // degrees
  document.querySelectorAll('.tilt-card').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var rect = card.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--tiltX', (px * MAX_TILT * 2).toFixed(2) + 'deg');
      card.style.setProperty('--tiltY', (py * -MAX_TILT * 2).toFixed(2) + 'deg');
    });
    card.addEventListener('mouseleave', function () {
      card.style.setProperty('--tiltX', '0deg');
      card.style.setProperty('--tiltY', '0deg');
    });
  });

  // Subtle parallax on the hero showcase image while it's in view.
  var showcase = document.querySelector('.hero-showcase');
  if (showcase) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var rect = showcase.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          var offset = (rect.top - window.innerHeight / 2) * 0.03;
          showcase.style.transform = 'translateY(' + offset.toFixed(1) + 'px)';
        }
        ticking = false;
      });
    }, { passive: true });
  }
})();
