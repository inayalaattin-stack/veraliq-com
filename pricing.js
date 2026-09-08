// Veraliq — pricing page interactivity (calculator + WebGL network orb).
// Vanilla JS port of VeraliqPricing.jsx from VERALIQ-Pricing-Package.zip —
// this repo has no build step and no React runtime, so the JSX component
// could not be dropped in directly (see CLAUDE.md: plain HTML/CSS/vanilla
// JS, no framework). Price/commission math and calculator behavior match
// the reference 1:1; Framer Motion's fade/slide transitions are replaced
// with plain CSS transitions, and the reference's React refs/useEffect
// become plain DOM lookups and a single IIFE run on DOMContentLoaded.
(function () {
  'use strict';

  var PRICES = { monthly: 25000, annual: 250000, successRate: 0.005 };
  var MONEY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

  function tl(n) { return MONEY.format(n) + ' TL'; }

  function clean(value, max, integer) {
    if (max === undefined) max = 100000000;
    var n = Math.min(max, Math.max(0, Number(value) || 0));
    return integer ? Math.floor(n) : Math.round(n * 100) / 100;
  }

  function calculateCosts(annual, data) {
    var platform = annual ? PRICES.annual / 12 : PRICES.monthly;
    var personnel = data.salary + data.sgk + data.meals + data.travel + data.bonus;
    var success = data.salePrice * data.sales * PRICES.successRate;
    return {
      platform: platform,
      personnel: personnel,
      success: success,
      veraliq: platform + success,
      difference: personnel - (platform + success)
    };
  }
  window.VeraliqPricingCalc = calculateCosts; // exposed for the test harness below

  function t(key) {
    return (window.VeraliqI18N && window.VeraliqI18N.t(key)) || key;
  }

  // ---- calculator state ----
  var state = {
    annual: false,
    data: { salary: 60000, sgk: 15000, meals: 2500, travel: 2500, bonus: 0, salePrice: 5000000, sales: 1 }
  };

  var els = {};
  ['vpToggleMonthly', 'vpToggleAnnual', 'vpPriceAmount', 'vpPriceUnit', 'vpPriceNote',
   'vpSalary', 'vpSgk', 'vpMeals', 'vpTravel', 'vpBonus', 'vpSalePrice', 'vpSales', 'vpSalesVal',
   'vpChartNote', 'vpChartAria', 'vpBarPersonnel', 'vpBarPlatform', 'vpBarSuccess',
   'vpPersonnelVal', 'vpVeraliqVal', 'vpAxisMid', 'vpAxisMax',
   'vpBdPlatformLabel', 'vpBdPlatform', 'vpBdSuccess', 'vpBdTotal', 'vpDiff'
  ].forEach(function (id) { els[id] = document.getElementById(id); });

  function render() {
    if (!els.vpPriceAmount) return; // pricing.js loaded on a page without the calculator markup
    var c = calculateCosts(state.annual, state.data);

    // plan card
    els.vpPriceAmount.textContent = MONEY.format(state.annual ? PRICES.annual : PRICES.monthly);
    els.vpPriceUnit.setAttribute('data-i18n', state.annual ? 'pricing.price.unit.annual' : 'pricing.price.unit.monthly');
    els.vpPriceUnit.textContent = t(state.annual ? 'pricing.price.unit.annual' : 'pricing.price.unit.monthly');
    if (state.annual) {
      els.vpPriceNote.removeAttribute('data-i18n');
      els.vpPriceNote.textContent = t('pricing.price.note.annual').replace('{amount}', tl(PRICES.annual / 12));
    } else {
      els.vpPriceNote.setAttribute('data-i18n', 'pricing.price.note.monthly');
      els.vpPriceNote.textContent = t('pricing.price.note.monthly');
    }

    // breakdown label follows the billing period too
    els.vpBdPlatformLabel.setAttribute('data-i18n', state.annual ? 'pricing.calc.bdplatform.annual' : 'pricing.calc.bdplatform.monthly');
    els.vpBdPlatformLabel.textContent = t(state.annual ? 'pricing.calc.bdplatform.annual' : 'pricing.calc.bdplatform.monthly');
    els.vpChartNote.setAttribute('data-i18n', state.annual ? 'pricing.calc.chartnote.annual' : 'pricing.calc.chartnote.monthly');
    els.vpChartNote.textContent = t(state.annual ? 'pricing.calc.chartnote.annual' : 'pricing.calc.chartnote.monthly');

    // chart
    var ceiling = Math.max(10000, Math.ceil(Math.max(c.personnel, c.veraliq) / 10000) * 10000);
    function pct(n) { return (n / ceiling * 100) + '%'; }
    els.vpBarPersonnel.style.width = pct(c.personnel);
    els.vpBarPlatform.style.width = pct(c.platform);
    els.vpBarSuccess.style.width = pct(c.success);
    els.vpPersonnelVal.textContent = tl(c.personnel);
    els.vpVeraliqVal.textContent = tl(c.veraliq);
    els.vpAxisMid.textContent = tl(ceiling / 2);
    els.vpAxisMax.textContent = tl(ceiling);
    els.vpBdPlatform.textContent = tl(c.platform);
    els.vpBdSuccess.textContent = tl(c.success);
    els.vpBdTotal.textContent = tl(c.veraliq) + ' + KDV';

    if (Math.abs(c.difference) < 0.005) {
      els.vpDiff.textContent = t('pricing.calc.diffsame');
    } else {
      els.vpDiff.textContent = tl(Math.abs(c.difference)) + ' ' + t(c.difference > 0 ? 'pricing.calc.difflower' : 'pricing.calc.diffhigher');
    }

    els.vpChartAria.setAttribute('aria-label',
      t('pricing.calc.rowpersonnel') + ': ' + tl(c.personnel) + '. ' +
      t('pricing.calc.rowveraliq') + ': ' + tl(c.veraliq) + ' (' +
      t('pricing.calc.legendplatform') + ' ' + tl(c.platform) + ', ' +
      t('pricing.calc.legendsuccess') + ' ' + tl(c.success) + ').');
  }

  function bindToggle() {
    if (!els.vpToggleMonthly) return;
    els.vpToggleMonthly.addEventListener('click', function () {
      state.annual = false;
      els.vpToggleMonthly.setAttribute('aria-pressed', 'true');
      els.vpToggleAnnual.setAttribute('aria-pressed', 'false');
      render();
    });
    els.vpToggleAnnual.addEventListener('click', function () {
      state.annual = true;
      els.vpToggleMonthly.setAttribute('aria-pressed', 'false');
      els.vpToggleAnnual.setAttribute('aria-pressed', 'true');
      render();
    });
  }

  function bindMoneyField(id, key, max) {
    var el = els[id];
    if (!el) return;
    el.addEventListener('input', function () {
      state.data[key] = clean(el.value, max, false);
      render();
    });
  }

  function bindInputs() {
    bindMoneyField('vpSalary', 'salary');
    bindMoneyField('vpSgk', 'sgk');
    bindMoneyField('vpMeals', 'meals');
    bindMoneyField('vpTravel', 'travel');
    bindMoneyField('vpBonus', 'bonus');
    bindMoneyField('vpSalePrice', 'salePrice');
    if (els.vpSales) {
      els.vpSales.addEventListener('input', function () {
        state.data.sales = clean(els.vpSales.value, 10, true);
        els.vpSalesVal.textContent = state.data.sales;
        render();
      });
    }
  }

  document.addEventListener('veraliq:langchange', render);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindToggle(); bindInputs(); render(); });
  } else {
    bindToggle(); bindInputs(); render();
  }

  // =========================================================================
  // Decorative WebGL network orb — native WebGL, no Three.js. Ported from the
  // reference JSX's useEffect almost verbatim (same shaders/geometry); React
  // refs become plain DOM lookups, and cleanup runs once via visibility/
  // context-loss listeners instead of a component-unmount return function,
  // since this is a static page rather than a mounted React component.
  // Falls back to the CSS-only .vp-orb-fallback radial gradient (already in
  // the markup) when WebGL is unavailable — no error shown to the visitor.
  // =========================================================================
  (function orb() {
    var canvas = document.getElementById('vpOrbCanvas');
    if (!canvas) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var gl;
    try { gl = canvas.getContext('webgl', { alpha: true, antialias: true }); } catch (e) { return; }
    if (!gl) return;

    var vertex = 'attribute vec3 position; uniform float time, aspect, pointSize; uniform vec2 pointer; varying float depth;' +
      'void main(){ vec3 p=position; float a=time*.12+pointer.x*.20, b=pointer.y*.18;' +
      'p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;' +
      'p.yz=mat2(cos(b),-sin(b),sin(b),cos(b))*p.yz;' +
      'depth=(p.z+1.)*.5; float z=2.6-p.z*.35;' +
      'gl_Position=vec4(p.x*1.85/aspect/z,p.y*1.85/z,0.,1.); gl_PointSize=pointSize*(.65+depth); }';
    var fragment = 'precision mediump float; uniform float dots; varying float depth;' +
      'void main(){ if(dots>.5 && distance(gl_PointCoord,vec2(.5))>.5)discard;' +
      'vec3 c=mix(vec3(.29,.42,1.),vec3(.52,.88,1.),depth);' +
      'gl_FragColor=vec4(c,dots>.5 ? .45+depth*.5 : .09+depth*.18); }';

    var shaders = [];
    function compile(type, source) {
      var s = gl.createShader(type); shaders.push(s);
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('WebGL shader unavailable');
      return s;
    }
    var program = gl.createProgram();
    var buffers = [], raf = 0, visible = true, active = true;
    function release() {
      buffers.forEach(function (b) { gl.deleteBuffer(b); });
      shaders.forEach(function (s) { gl.deleteShader(s); });
      gl.deleteProgram(program);
    }
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL link unavailable');
    } catch (e) { release(); return; }

    var points = [], lines = [], count = 360;
    for (var i = 0; i < count; i++) {
      var y = 1 - 2 * i / (count - 1), radius = Math.sqrt(1 - y * y), angle = i * 2.39996323;
      points.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
    for (var a = 0; a < count; a++) {
      for (var b = a + 1; b < count; b++) {
        var dx = points[a * 3] - points[b * 3], dy = points[a * 3 + 1] - points[b * 3 + 1], dz = points[a * 3 + 2] - points[b * 3 + 2];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.24) {
          lines.push(points[a * 3], points[a * 3 + 1], points[a * 3 + 2], points[b * 3], points[b * 3 + 1], points[b * 3 + 2]);
        }
      }
    }
    function upload(values) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
      buffers.push(buf);
      return buf;
    }
    var pointBuffer = upload(points), lineBuffer = upload(lines);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    var posLoc = gl.getAttribLocation(program, 'position');
    function uniform(n) { return gl.getUniformLocation(program, n); }
    var u = { time: uniform('time'), aspect: uniform('aspect'), pointer: uniform('pointer'), pointSize: uniform('pointSize'), dots: uniform('dots') };
    var pointer = [0, 0], phase = 0, last = 0, ratio = 1;

    function draw(now) {
      raf = 0;
      if (!active || !visible || document.hidden) return;
      now = now || 0;
      if (!reduce) phase += last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.time, phase);
      gl.uniform2fv(u.pointer, pointer);
      gl.uniform1f(u.aspect, ratio);
      gl.uniform1f(u.pointSize, Math.min(window.devicePixelRatio || 1, 1.5) * 2.6);
      gl.enableVertexAttribArray(posLoc);
      [[lineBuffer, gl.LINES, lines.length / 3, 0], [pointBuffer, gl.POINTS, count, 1]].forEach(function (spec) {
        gl.bindBuffer(gl.ARRAY_BUFFER, spec[0]);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        gl.uniform1f(u.dots, spec[3]);
        gl.drawArrays(spec[1], 0, spec[2]);
      });
      if (!reduce) raf = requestAnimationFrame(draw);
    }
    function restart() { cancelAnimationFrame(raf); last = 0; draw(performance.now()); }
    function resize() {
      var r = canvas.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(r.width * d));
      canvas.height = Math.max(1, Math.round(r.height * d));
      ratio = r.width / Math.max(r.height, 1);
      gl.viewport(0, 0, canvas.width, canvas.height);
      restart();
    }
    function move(e) {
      if (reduce) return;
      pointer[0] = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer[1] = (0.5 - e.clientY / window.innerHeight) * 2;
    }
    function lost(e) { e.preventDefault(); active = false; cancelAnimationFrame(raf); }

    var observer = new ResizeObserver(resize);
    observer.observe(canvas);
    var intersection = new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; restart(); });
    intersection.observe(canvas);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('visibilitychange', restart);
    canvas.addEventListener('webglcontextlost', lost);
    resize();
  })();
})();
