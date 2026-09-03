// three-canvas.js
// Decorative 3D scene for the hero band (#hero-3d canvas in index.html).
//
// This project has no React/bundler (see CLAUDE.md — plain HTML/JS site,
// Cloudflare Pages + Workers), so this uses vanilla Three.js loaded as an ES
// module straight from esm.sh instead of @react-three/fiber — esm.sh is
// already whitelisted in _headers' CSP script-src for other SDKs, so no CSP
// change was needed. Pinned to an exact version per that CSP's own practice.
import * as THREE from "https://esm.sh/three@0.185.1";

const canvas = document.getElementById("hero-3d");
if (canvas) initHeroScene(canvas);

function initHeroScene(canvas) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return; // WebGL unavailable — the plain gradient hero background stays as-is.
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5.2;

  const accent = new THREE.Color(0xbfa16a); // brand champagne accent (--accent)
  const geometry = new THREE.IcosahedronGeometry(1.7, 1);

  const wireframe = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.5 })
  );
  const nodes = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: accent, size: 0.045, transparent: true, opacity: 0.9 })
  );

  const group = new THREE.Group();
  group.add(wireframe, nodes);
  scene.add(group);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Subtle mouse-parallax instead of drag/orbit controls: this sits behind
  // hero text and CTAs, so it must never capture pointer input (canvas has
  // pointer-events:none in CSS) or fight page scroll.
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    targetX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    targetY = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  if (!reduceMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

  let tabVisible = true;
  document.addEventListener("visibilitychange", () => { tabVisible = !document.hidden; });

  if (reduceMotion) {
    group.rotation.set(0.4, 0.6, 0);
    renderer.render(scene, camera);
    return; // static frame only — no animation loop
  }

  (function tick() {
    requestAnimationFrame(tick);
    if (!tabVisible) return;
    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;
    group.rotation.y += 0.0022 + curX * 0.0015;
    group.rotation.x = curY * 0.25;
    renderer.render(scene, camera);
  })();
}
