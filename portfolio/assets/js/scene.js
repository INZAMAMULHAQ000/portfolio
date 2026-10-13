/* ============================================================
   scene.js — the clay core (Three.js, pinned ESM via importmap)
   ------------------------------------------------------------
   Structural, not a gimmick. Three jobs:
     1. the hero "core" object,
     2. six satellite clay forms — one per flagship system —
        that the camera travels through as you scroll,
     3. pointer-driven parallax over the whole scene.

   The entire WebGL path is guarded. If the CDN import fails, if
   WebGL is unavailable, or if any construction throws, the canvas
   is hidden and the generated clay hero image is shown instead.
   The page is never left empty.
   ============================================================ */

const root = document.documentElement;
const canvas = document.getElementById('clay-canvas');
const fallback = document.getElementById('stage-fallback');
const range = document.getElementById('scene-range');

const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const REDUCE = !!(mqReduce && mqReduce.matches);
const SMALL = window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : false;

const CYAN = 0x4ce0c0;
const VIOLET = 0x8b6cf0;
const GRAPHITE = 0x191c21;

function showFallback(reason) {
  if (canvas) canvas.style.display = 'none';
  if (fallback) fallback.classList.add('is-live');
  if (reason) console.info('[clay] static fallback:', reason);
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* smooth low-frequency field used to mould the core — reads as
   hand-worked plasticine, not a mathematical surface */
function mould(x, y, z) {
  let v = 0;
  v += Math.sin(x * 1.9 + y * 1.3) * 0.50;
  v += Math.sin(y * 2.7 - z * 1.7) * 0.30;
  v += Math.sin(z * 3.1 + x * 2.3) * 0.20;
  v += Math.sin(x * 5.3 + z * 4.1 + y * 3.7) * 0.09;
  return v;
}

async function main() {
  if (!canvas) return;
  if (!webglOK()) { showFallback('no webgl context'); return; }

  let THREE;
  try {
    /* dynamic import so a CDN outage is catchable, not fatal */
    THREE = await import('three');
  } catch (err) {
    showFallback('three.js could not be loaded');
    return;
  }

  let renderer, scene, camera, world, coreGroup, core, satellites = [], ring = null;
  let raf = 0, running = false, disposed = false;
  let pmrem = null, envRT = null, envScene = null;
  let mergeVertices = null;
  const disposables = [];

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !SMALL,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 0.25, 6.6);
    camera.lookAt(0, 0, 0);

    world = new THREE.Group();
    scene.add(world);

    /* soft studio IBL so clearcoat + iridescence have something to catch,
       plus a vertex welder for the rounded forms. Both optional: the
       scene still reads correctly if either addon fails to arrive. */
    try {
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
      pmrem = new THREE.PMREMGenerator(renderer);
      envScene = new RoomEnvironment(renderer);
      envRT = pmrem.fromScene(envScene);
      scene.environment = envRT.texture;
    } catch (e) { /* no env map — the lights still carry the material */ }

    try {
      const utils = await import('three/addons/utils/BufferGeometryUtils.js');
      mergeVertices = utils.mergeVertices || null;
    } catch (e) { mergeVertices = null; }

    /* weld duplicated vertices so displaced geometry shades smoothly */
    const weld = (g) => {
      if (!mergeVertices) return g;
      try {
        const merged = mergeVertices(g, 1e-4);
        if (merged && merged !== g) { g.dispose(); merged.computeVertexNormals(); return merged; }
      } catch (e) { /* keep the original */ }
      return g;
    };

    /* ---- matte clay: high roughness, clearcoat, faint iridescence ---- */
    const clay = (tint, opts) => new THREE.MeshPhysicalMaterial(Object.assign({
      color: tint,
      roughness: 0.93,
      metalness: 0.0,
      clearcoat: 0.38,
      clearcoatRoughness: 0.72,
      iridescence: 0.26,
      iridescenceIOR: 1.16,
      sheen: 0.4,
      sheenRoughness: 0.85,
      sheenColor: new THREE.Color(0x6f7a8a),
      envMapIntensity: scene.environment ? 0.32 : 0
    }, opts || {}));

    const clayDark = clay(0x333a45);

    /* ---- 1 · the core: a moulded clay mass ----
       Held in its own group outside the travelling `world`, so it keeps a
       near-constant distance from the camera and never balloons over copy. */
    coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const v = new THREE.Vector3();
    const coreGeo0 = new THREE.SphereGeometry(
      1.52, SMALL ? 56 : 104, SMALL ? 34 : 68
    );
    const coreGeo = weld(coreGeo0);
    const pos = coreGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const bump = mould(v.x * 2.15, v.y * 2.15, v.z * 2.15);
      const r = 1.52 + bump * 0.19;
      pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    }
    pos.needsUpdate = true;
    coreGeo.computeVertexNormals();
    core = new THREE.Mesh(coreGeo, clayDark);
    coreGroup.add(core);
    disposables.push(coreGeo, clayDark);

    /* an open clay hoop around the core — a collar, not a planetary ring */
    const ringGeo = new THREE.TorusGeometry(1.98, 0.055, SMALL ? 6 : 9, SMALL ? 70 : 130, Math.PI * 1.42);
    ring = new THREE.Mesh(ringGeo, clay(0x3a4250, { roughness: 0.82, clearcoat: 0.55 }));
    ring.rotation.set(1.16, 0, 0.5);
    coreGroup.add(ring);
    disposables.push(ringGeo, ring.material);

    /* ---- 2 · six satellites, one per flagship system ----
       Stacked along -z so scrolling literally travels past them. */
    const rounded = (size, radius, seg) => {
      const g0 = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
      const g = weld(g0);
      const p = g.attributes.position;
      const inner = size / 2 - radius;
      const c = new THREE.Vector3();
      const d = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        c.set(clamp(v.x, -inner, inner), clamp(v.y, -inner, inner), clamp(v.z, -inner, inner));
        d.copy(v).sub(c);
        if (d.lengthSq() < 1e-9) { p.setXYZ(i, c.x, c.y, c.z); continue; }
        d.setLength(radius);
        p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    };

    const satGeo = [
      rounded(0.92, 0.2, 5),                                            /* CAFM — facility block */
      new THREE.CapsuleGeometry(0.3, 0.46, 6, SMALL ? 12 : 20),         /* Pharmacy — bottle */
      rounded(0.86, 0.34, 6),                                           /* POS — terminal */
      new THREE.CylinderGeometry(0.34, 0.34, 0.5, SMALL ? 16 : 32),     /* Hotel — key block */
      new THREE.TorusGeometry(0.42, 0.16, SMALL ? 8 : 14, SMALL ? 26 : 52), /* Unified ERP — loop */
      new THREE.SphereGeometry(0.44, SMALL ? 16 : 32, SMALL ? 12 : 24)  /* Vision — lens */
    ];
    const satMat = [
      clay(0x2a303a), clay(0x26313a), clay(0x2b2f3a),
      clay(0x273038), clay(0x2d2a3c, { iridescence: 0.4 }), clay(0x282d36)
    ];

    satGeo.forEach((g, i) => {
      const m = new THREE.Mesh(g, satMat[i]);
      const a = (i / 6) * Math.PI * 2 + 0.5;
      /* kept off-axis so they sweep past the frame edges rather than
         through the reading column */
      const rad = 2.45 + (i % 3) * 0.55;
      m.position.set(Math.cos(a) * rad, Math.sin(a * 1.4) * 0.95, -3 - i * 2.5);
      m.rotation.set(a * 0.6, a, a * 0.3);
      m.scale.setScalar(0.86);
      m.userData.spin = 0.12 + (i % 3) * 0.05;
      m.userData.y0 = m.position.y;
      world.add(m);
      satellites.push(m);
      disposables.push(g, satMat[i]);
    });

    /* ---- lights: cyan from one side, violet from the other ---- */
    scene.add(new THREE.HemisphereLight(0x3d4552, GRAPHITE, 0.62));

    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(3.5, 6, 7);
    scene.add(key);

    const rimC = new THREE.DirectionalLight(CYAN, 2.35);
    rimC.position.set(-6.5, 1.2, 2.6);
    scene.add(rimC);

    const rimV = new THREE.DirectionalLight(VIOLET, 1.95);
    rimV.position.set(5.5, -2.2, -4.5);
    scene.add(rimV);

    const fill = new THREE.PointLight(0xffd9a8, 0.4, 26);
    fill.position.set(0, 3.4, 5.2);
    scene.add(fill);

    /* ---- interaction state ---- */
    let ptr = { x: 0, y: 0 }, ptrT = { x: 0, y: 0 };
    let scrollP = 0, clock = new THREE.Clock();

    function readScroll() {
      const max = Math.max(1, root.scrollHeight - window.innerHeight);
      scrollP = clamp((window.scrollY || root.scrollTop || 0) / max, 0, 1);
      /* the clay layer dims behind dense copy and lifts again for the
         travel sequence — protects text contrast at every stop */
      let o;
      const p = scrollP;
      if (p < 0.05) o = 0.95;
      else if (p < 0.18) o = lerp(0.95, 0.36, (p - 0.05) / 0.13);
      else if (p < 0.60) o = lerp(0.36, 0.62, (p - 0.18) / 0.42);
      else o = lerp(0.62, 0.40, clamp((p - 0.60) / 0.40, 0, 1));
      root.style.setProperty('--stage-o', o.toFixed(3));
    }

    function onScroll() { readScroll(); if (REDUCE) render(); }

    function onPointer(e) {
      if (e.pointerType === 'touch') return;
      ptrT.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptrT.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    function resize() {
      if (disposed) return;
      const w = window.innerWidth, h2 = window.innerHeight;
      camera.aspect = w / h2;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2));
      renderer.setSize(w, h2, false);
      sizeRangeSentinel();
      readScroll();
      if (REDUCE) render();
    }

    function render() {
      renderer.render(scene, camera);
    }

    function frame() {
      if (!running) return;
      const t = clock.getElapsedTime();
      const p = scrollP;

      ptr.x = lerp(ptr.x, ptrT.x, 0.055);
      ptr.y = lerp(ptr.y, ptrT.y, 0.055);

      /* motion 2 — scroll drives the camera through the object.
         The satellite stream travels; the core holds a near-constant
         distance and slides off the text column as you descend. */
      const travel = p * 15.5;
      world.position.z = travel;
      world.rotation.y = p * Math.PI * 1.15 + ptr.x * 0.14;
      world.rotation.x = ptr.y * 0.08 - p * 0.16;

      /* the core slides off the reading column early so copy never sits on it */
      coreGroup.position.set(
        0.18 + Math.pow(p, 0.6) * 3.6 + ptr.x * 0.28,
        0.12 - p * 0.8 + ptr.y * -0.2,
        -1.25
      );
      coreGroup.scale.setScalar((1 - p * 0.5) * (1 + Math.sin(t * 0.62) * 0.012));
      coreGroup.rotation.y = t * 0.06 + p * 1.9 + ptr.x * 0.22;
      coreGroup.rotation.x = Math.sin(t * 0.21) * 0.08 + ptr.y * 0.1;

      camera.position.z = 6.6 - p * 0.5;
      camera.position.x = ptr.x * 0.34;
      camera.position.y = 0.25 + ptr.y * -0.2 - p * 0.1;
      camera.lookAt(0, 0, -1.2);

      if (ring) {
        ring.rotation.z = 0.5 + t * 0.05;
        ring.rotation.x = 1.16 + Math.sin(t * 0.24) * 0.07;
      }

      for (let i = 0; i < satellites.length; i++) {
        const s = satellites[i];
        s.rotation.y += s.userData.spin * 0.01;
        s.rotation.x += s.userData.spin * 0.006;
        s.position.y = s.userData.y0 + Math.sin(t * 0.5 + i) * 0.2;
      }

      render();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || disposed) return;
      running = true;
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    /* ---- lifecycle: pause when the clay layer leaves the viewport ---- */
    function sizeRangeSentinel() {
      if (!range) return;
      const hero = document.getElementById('top');
      const contact = document.getElementById('contact');
      if (!hero || !contact) return;
      const top = hero.getBoundingClientRect().top + window.scrollY;
      const bottom = contact.getBoundingClientRect().bottom + window.scrollY;
      range.style.top = top + 'px';
      range.style.height = Math.max(0, bottom - top) + 'px';
    }

    let inRange = true;
    if (range && 'IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          inRange = en.isIntersecting;
          if (REDUCE) return;
          if (inRange && !document.hidden) start(); else stop();
        });
      }, { threshold: 0 }).observe(range);
    }

    document.addEventListener('visibilitychange', () => {
      if (REDUCE) return;
      if (document.hidden) stop();
      else if (inRange) start();
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      stop();
      showFallback('webgl context lost');
    });

    window.addEventListener('pagehide', destroy, { once: true });

    function destroy() {
      if (disposed) return;
      disposed = true;
      stop();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      try {
        disposables.forEach((d) => d && d.dispose && d.dispose());
        scene.traverse((o) => {
          if (o.geometry && o.geometry.dispose) o.geometry.dispose();
          if (o.material) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
          }
        });
        if (envRT && envRT.dispose) envRT.dispose();
        if (envScene && envScene.dispose) envScene.dispose();
        if (pmrem && pmrem.dispose) pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss && renderer.forceContextLoss();
      } catch (e) { /* teardown must never throw at the user */ }
    }

    /* ---- first paint ---- */
    sizeRangeSentinel();
    readScroll();
    resize();
    canvas.classList.add('is-live');
    if (REDUCE) { render(); }
    else { start(); }
  } catch (err) {
    try { if (raf) cancelAnimationFrame(raf); } catch (e) {}
    showFallback(err && err.message ? err.message : 'webgl init error');
  }
}

main().catch((err) => showFallback(err && err.message ? err.message : 'module error'));
