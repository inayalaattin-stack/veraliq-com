// three-canvas.js
// Hero 3D scene (#hero-3d canvas in index.html) — an abstract architectural
// massing composition (floating floor-plate slabs + a bent glass-like
// ribbon), not a generic glowing-sphere/particle "AI" cliché. Materials are
// tuned to the brand's anthracite/titanium/champagne palette (see :root
// vars in index.html). Vanilla Three.js via esm.sh — this repo has no
// React/bundler (CLAUDE.md), and esm.sh is already CSP-whitelisted.
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
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.3, 6.2);
  camera.lookAt(0, 0, 0);

  // Lighting only — no HDRI/env map, so metalness/roughness stay cheap.
  scene.add(new THREE.HemisphereLight(0x2a2f30, 0x08090a, 0.65));
  const key = new THREE.DirectionalLight(0xd9b878, 1.5); // warm champagne key light
  key.position.set(3, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7d97a6, 0.45); // cool fill, adds depth
  fill.position.set(-3, 1, -2);
  scene.add(fill);

  const group = new THREE.Group();
  group.rotation.x = -0.18; // slight downward tilt, like viewing an architectural model
  scene.add(group);

  const GOLD = 0xbfa16a; // brand --accent
  const matte = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.25 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x3c4042, roughness: 0.4, metalness: 0.7 });
  const champagne = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.28, metalness: 0.85 });

  // Abstract building-massing slabs — floating floor plates, staggered like
  // an exploded architectural study, each edge-lined in champagne gold.
  const slabs = [
    { w: 1.9, h: 0.16, d: 1.1, x: 0,    y: 0.7,  z: 0,    rot: 0.08,  mat: matte(0x14181a) },
    { w: 1.3, h: 0.16, d: 0.9, x: 0.5,  y: 0.32, z: 0.3,  rot: -0.12, mat: titanium },
    { w: 1.6, h: 0.16, d: 1.0, x: -0.3, y: -0.05,z: -0.2, rot: 0.05,  mat: matte(0x1b201f) },
    { w: 0.9, h: 0.16, d: 0.9, x: 0.35, y: -0.42,z: 0.15, rot: -0.06, mat: champagne },
    { w: 1.4, h: 0.16, d: 1.0, x: -0.1, y: -0.8, z: -0.1, rot: 0.1,   mat: matte(0x14181a) },
  ];
  for (const s of slabs) {
    const geo = new THREE.BoxGeometry(s.w, s.h, s.d);
    const mesh = new THREE.Mesh(geo, s.mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.rot;
    group.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35 })
    );
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    group.add(edges);
  }

  // Flowing ribbon — a gently bent, translucent aubergine plane threading
  // the slabs ("akışkan mimari" accent). No transmission/env map (that
  // forces an extra render pass) — a cheap displaced plane instead.
  const ribbonGeo = new THREE.PlaneGeometry(2.6, 0.6, 24, 1);
  const rPos = ribbonGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const x = rPos.getX(i);
    rPos.setZ(i, Math.sin(x * 1.3) * 0.35);
    rPos.setY(i, rPos.getY(i) + Math.sin(x * 0.8) * 0.15);
  }
  ribbonGeo.computeVertexNormals();
  const ribbon = new THREE.Mesh(
    ribbonGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x4a2540, roughness: 0.3, metalness: 0.4,
      transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    })
  );
  ribbon.rotation.y = 0.5;
  ribbon.position.set(-0.2, 0.1, -0.6);
  group.add(ribbon);

  // Bias the whole composition to sit behind .hero-showcase (not the copy)
  // — measured from the real DOM layout so it adapts across breakpoints,
  // including mobile where the showcase stacks full-width above the text.
  const showcaseEl = document.querySelector(".hero-showcase");
  let baseX = 0;
  function computeBias() {
    if (!showcaseEl) return 0;
    const cRect = canvas.getBoundingClientRect();
    const sRect = showcaseEl.getBoundingClientRect();
    if (!cRect.width) return 0;
    const frac = (sRect.left + sRect.width / 2 - cRect.left) / cRect.width; // 0..1
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const halfH = Math.tan(vFov / 2) * camera.position.z;
    const halfW = halfH * camera.aspect;
    return (frac - 0.5) * 2 * halfW * 0.7; // 0.7 damping — never pushed to the edge
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dprCap = w < 640 ? 1.5 : 2; // extra-light on small/mobile screens
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);
    baseX = computeBias();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Heavy, noble damping — parallax + scroll drift should feel weighted,
  // never jumpy. Canvas is pointer-events:none (see CSS), so this never
  // fights page scroll or blocks the hero CTA.
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    targetX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    targetY = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  let scrollT = 0;
  function onScroll() {
    scrollT = Math.min(window.scrollY / (window.innerHeight || 1), 1);
  }
  if (!reduceMotion) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  let tabVisible = true;
  document.addEventListener("visibilitychange", () => { tabVisible = !document.hidden; });

  if (reduceMotion) {
    group.position.x = baseX;
    renderer.render(scene, camera);
    return; // static frame only — no animation loop
  }

  let curScroll = 0;
  (function tick() {
    requestAnimationFrame(tick);
    if (!tabVisible) return;
    curX += (targetX - curX) * 0.025;
    curY += (targetY - curY) * 0.025;
    curScroll += (scrollT - curScroll) * 0.04;
    group.position.x = baseX + curX * 0.15;
    group.position.y = 0.15 - curScroll * 0.6;
    group.rotation.y = 0.12 + curX * 0.18;
    group.rotation.x = -0.18 + curY * 0.08 - curScroll * 0.15;
    renderer.render(scene, camera);
  })();
}
