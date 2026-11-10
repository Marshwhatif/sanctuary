/* lowpoly-marsh.js: the shared 3D kit for the "What if" Marsh videos.
   Needs three.min.js, lowpoly.js and lowpoly-blocky.js loaded first.

   const K = LPM.setup(document.querySelector("#world-canvas"));
   const { T, scene, camera, place, shake, light, marsh, puddle, putMarsh, wag } = K;
   const house = K.buildRoom({ snowy: false, xmas: false });   // build only the sets the video uses
   const street = K.buildStreet({ snowy: false });
   function renderAt(t) { K.reset(); ...shot...; K.render(); }

   Each set is a hidden group; a shot turns it on (house.show(t), street.group.visible = true).
   K.reset() hides every set, character, accessory and effect, then runs any K.onReset(fn) hooks.
   K.render() draws the frame, the fake bloom (K.BLOOM, 0..1) and the white flash (K.FLASH, 0..1).
   No randomness or clock at runtime: everything is seeded with LP.rng and driven by t.
   Bath-time kit (bottom of the file): spray, bubbles, steam, lens drops (#world-lens canvas, K.LENS), wetMarsh, coatTint,
   sockHat / foamHat / towel, and the sets buildBathroom, buildStairs, buildGarden and laundryBasket. Worked example: videos/what-if-bath-boss-fight. */
(function () {
  function setup(canvas, opts) {
    opts = opts || {};
    const T = THREE, { smooth, rng } = LP;
    const stage = LP.stage(canvas, Object.assign({ shadowSize: 12, fogNear: 40, fogFar: 160 }, opts.stage || {}));
    const { scene, camera, sun, hemi, renderer } = stage;
    renderer.setPixelRatio(opts.pixelRatio || 1.5); renderer.setSize(1080, 1920, false);
    camera.far = 3000; camera.near = 0.01; camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004;
    scene.add(camera);
    const sky = scene.getObjectByName("sky");
    const K = { T, stage, scene, camera, sun, hemi, renderer, sky, smooth, rng, BLOOM: 0, FLASH: 0 };

    /* ---- Maths ---- */
    const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
    const pulse = (l, a, up, down) => smooth(a - up, a, l) * (1 - smooth(a, a + down, l));
    const fract = (x) => x - Math.floor(x);

    /* ---- Helpers ---- */
    const MC = {};
    const M = (c, o) => (typeof c !== "string" ? c : o ? LP.mat(c, o) : (MC[c] = MC[c] || LP.mat(c)));
    const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    const bx = (g, w, h, d, c, x, y, z) => { const m = LP.box(w, h, d, M(c), x, y, z); g.add(m); return m; };
    const cy = (g, rt, rb, h, c, x, y, z, seg) => { const m = sh(new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 12), M(c))); m.position.set(x, y + h / 2, z); g.add(m); return m; };
    const cone = (g, r, h, c, x, y, z, seg) => { const m = sh(new T.Mesh(new T.ConeGeometry(r, h, seg || 8), M(c))); m.position.set(x, y + h / 2, z); g.add(m); return m; };
    const flat = (g, w, l, c, x, y, z) => { const p = new T.Mesh(new T.PlaneGeometry(w, l), M(c)); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; g.add(p); return p; };
    const geoT = (w, h, d, x, y, z) => { const g = new T.BoxGeometry(w, h, d); g.translate(x || 0, y || 0, z || 0); return g; };
    const D = new T.Object3D(), COL = new T.Color();
    // Many boxes in one draw call: list of [x, y(bottom), z, w, h, d, colour, yaw].
    function blocks(g, list, shadow) {
      const geo = new T.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      const m = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: "#ffffff" }), list.length);
      list.forEach(([x, y, z, w, h, d, c, yaw], i) => { D.position.set(x, y, z); D.rotation.set(0, yaw || 0, 0); D.scale.set(w, h, d); D.updateMatrix(); m.setMatrixAt(i, D.matrix); m.setColorAt(i, COL.set(c)); });
      m.castShadow = shadow !== false; m.receiveShadow = true; g.add(m); return m;
    }
    const GROUPS = []; const group = () => { const g = new T.Group(); g.visible = false; scene.add(g); GROUPS.push(g); return g; };
    const sized = (d, h) => { d.pose({}); const top = new T.Box3().setFromObject(d).max.y; d.scale.setScalar(h / top); return d; };
    const glow = (s, c, x, y, z, g) => { const m = LP9.glow(s, c); m.position.set(x, y, z); (g || scene).add(m); return m; };
    function canvasBoard(w, h, pw, ph, mopts) { const c = document.createElement("canvas"); c.width = pw; c.height = ph; const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial(Object.assign({ map: t, side: T.DoubleSide }, mopts || {}))); m.cx = c.getContext("2d"); m.tex = t; return m; }
    const ADDM = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o === undefined ? 1 : o, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide });
    Object.assign(K, { ease, pulse, fract, M, sh, bx, cy, cone, flat, geoT, blocks, group, GROUPS, sized, glow, canvasBoard, ADDM, D, COL });

    /* ---- Camera ---- */
    const look = new T.Vector3();
    // Camera at p looking at target; pass t for a tiny handheld drift.
    function place(px, py, pz, tx, ty, tz, fov, t) { const d = t === undefined ? 0 : 1; camera.position.set(px + (d ? Math.sin(t * 0.7) * 0.006 : 0), py + (d ? Math.sin(t * 0.9 + 1) * 0.005 : 0), pz); look.set(tx, ty, tz); camera.up.set(0, 1, 0); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } camera.updateMatrixWorld(true); }
    // Screen shake: call right after place(). a = strength in metres.
    function shake(a, t) { if (a <= 0.0005) return; camera.position.x += Math.sin(t * 61) * a; camera.position.y += Math.sin(t * 47 + 1) * a; camera.rotation.z += Math.sin(t * 53 + 2) * a * 0.6; camera.updateMatrixWorld(true); }
    // Straight down, with the top of the frame toward -z (rotated by rot).
    function placeTop(cx, cz, h, fov, rot) { camera.position.set(cx, h, cz); camera.up.set(Math.sin(rot || 0), 0, -Math.cos(rot || 0)); camera.lookAt(cx, 0, cz); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } camera.updateMatrixWorld(true); }
    // Beat-synced camera, after place(): punch-zoom and dip on every kick, alternating tilt. energy 0..1, beat = seconds per beat.
    function beatCam(t, e, beat) { if (!(e > 0)) return; const b = t / (beat || 60 / 128), ph = fract(b), k = Math.pow(1 - ph, 5), bi = Math.floor(b);
      camera.fov = camera.fov * (1 - 0.05 * e * k); camera.updateProjectionMatrix();
      camera.translateY(-0.03 * e * k); camera.translateX(Math.sin(t * 71) * 0.008 * e * k);
      camera.rotation.z += (bi % 2 ? 1 : -1) * 0.014 * e * (0.35 + 0.65 * k) + Math.sin(t * 0.9) * 0.006 * e; camera.updateMatrixWorld(true);
      hemi.intensity *= 1 + 0.45 * e * k; }
    Object.assign(K, { place, shake, placeTop, beatCam });

    /* ---- Light presets: [sun colour, sun intensity, sun offset [x, y, z], hemi sky, hemi ground, hemi intensity, sky, fog] ---- */
    const LIGHTS = {
      day: ["#fff4e8", 1.8, [-6, 12, 10], "#e8f0ff", "#e8eef8", 1.5, "#c8d8ec", "#d8e2ee"],
      cosy: ["#9ab4ff", 0.55, [1, 9, -12], "#ffe4c4", "#5a3a2a", 1.25, "#1a2848", "#1a2848"],
      morning: ["#fff0d8", 1.6, [2, 8, -10], "#fff4e8", "#6a4a3a", 1.5, "#cfe0f4", "#cfe0f4"],
      dream: ["#fff0f8", 1.6, [-4, 10, 8], "#fff0fa", "#e8c8e0", 1.7, "#f8d8ec", "#f6e0f0"],
      night: ["#8a9ad8", 0.8, [3, 9, 8], "#7a8ac8", "#3a3248", 1.45, "#141a30", "#141a30"],
      rave: ["#8a6aff", 0.35, [0, 12, 12], "#6a5ac8", "#140a1c", 0.9, "#07040f", "#140a26"],
      sunrise: ["#ffb88a", 1.5, [0, 5, -30], "#ffd0b8", "#3a2a3a", 1.25, "#f2a07e", "#e8a08a"],
      casino: ["#ffd8a0", 0.6, [2, 10, 6], "#ffd0b0", "#4a1828", 1.35, "#1a0e14", "#1a0e14"],
      dawn: ["#ffc8a0", 1.2, [-8, 6, -20], "#c8b8e8", "#e8eef8", 1.2, "#d8a8b8", "#c8a8c0"],
      rain: ["#b8c8dc", 0.5, [1, 9, -12], "#d8e0ec", "#5a4a3a", 1.15, "#6a7a8a", "#6a7a8a"],
      dusk: ["#ffb88a", 1.1, [-8, 7, 30], "#a8b8e8", "#e8eef8", 1.1, "#5a6a9a", "#7a7a9a"],
      autumn: ["#ffe0b0", 2.2, [-10, 14, 14], "#fff0d8", "#6a5a3a", 1.45, "#bcd8f0", "#d8d0c0"],
    };
    // light(mode, cx, cz, shadowSize, fogFar): sun shadow box centred on (cx, cz). Unknown modes fall back to "day".
    function light(mode, cx, cz, size, fogFar) {
      const c = sun.shadow.camera, S2 = size || 6; c.left = -S2; c.right = S2; c.top = S2; c.bottom = -S2; c.near = 0.5; c.far = 80; c.updateProjectionMatrix();
      scene.fog.near = (fogFar || 60) * 0.3; scene.fog.far = fogFar || 60;
      const L = LIGHTS[mode] || LIGHTS.day; cx = cx || 0; cz = cz || 0;
      sun.color.set(L[0]); sun.intensity = L[1]; sun.position.set(cx + L[2][0], L[2][1], cz + L[2][2]);
      hemi.color.set(L[3]); hemi.groundColor.set(L[4]); hemi.intensity = L[5]; sky.material.color.set(L[6]); scene.fog.color.set(L[7]);
      sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
    }
    Object.assign(K, { light, LIGHTS });

    /* ---- Effects ---- */
    // Fake bloom: a blurred, thresholded copy of the frame screen-blended on top (needs #world-bloom 270x480 canvas).
    const bloomC = document.querySelector("#world-bloom"), bloomX = bloomC && bloomC.getContext("2d"), flashEl = document.querySelector("#world-flash");
    function bloomPass(amount) { if (!bloomX) return; bloomX.globalCompositeOperation = "source-over"; bloomX.filter = "none"; bloomX.clearRect(0, 0, 270, 480); if (!(amount > 0)) { bloomC.style.opacity = 0; return; } bloomX.filter = "brightness(0.85) contrast(3.2) saturate(1.4) blur(4px)"; bloomX.drawImage(canvas, 0, 0, 270, 480); bloomX.globalCompositeOperation = "lighter"; bloomX.filter = "brightness(0.8) contrast(2.8) saturate(1.3) blur(12px)"; bloomX.globalAlpha = 0.6; bloomX.drawImage(canvas, 0, 0, 270, 480); bloomX.globalAlpha = 1; bloomC.style.opacity = amount * 0.7; }
    function render() { stage.render(); bloomPass(K.BLOOM); if (flashEl) flashEl.style.opacity = Math.min(1, Math.max(0, K.FLASH)); }
    // Falling snow in a box (centre cx, cy0 bottom, cz; size w, h, d).
    const SNOWN = 700, snowGeo = new T.BufferGeometry(); snowGeo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(SNOWN * 3), 3));
    const snow = new T.Points(snowGeo, new T.PointsMaterial({ color: "#ffffff", size: 0.05, transparent: true, opacity: 0.9, depthWrite: false })); snow.frustumCulled = false; scene.add(snow);
    const SNOWSEED = []; { const r = rng(61); for (let i = 0; i < SNOWN; i++) SNOWSEED.push([r(), r(), r(), 0.4 + r() * 0.6]); }
    function snowfall(t, cx, cy0, cz, w, h, d, size) { snow.visible = true; snow.material.size = size || 0.05; const a = snowGeo.attributes.position.array; SNOWSEED.forEach(([u, v, q, sp], i) => { a[i * 3] = cx + (u - 0.5) * w + Math.sin(t * 0.8 + i) * 0.15; a[i * 3 + 1] = cy0 + h - fract(v + t * sp * 0.12 * (3 / h)) * h; a[i * 3 + 2] = cz + (q - 0.5) * d; }); snowGeo.attributes.position.needsUpdate = true; }
    // Rain streaks in a box (centre cx, cz; width w, height h, depth d).
    const RAINN = 500, rainGeo = new T.BufferGeometry(); rainGeo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(RAINN * 6), 3));
    const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: "#a8c0dc", transparent: true, opacity: 0.6 })); rain.frustumCulled = false; scene.add(rain);
    function rainfall(t, cx, cz, w, h, d) { rain.visible = true; const a = rainGeo.attributes.position.array; SNOWSEED.slice(0, RAINN).forEach(([u, v, q], i) => { const x = cx + (u - 0.5) * w, z = cz + (q - 0.5) * d, y = h - fract(v + t * 1.6) * h; a.set([x, y, z, x - 0.02, y - 0.35, z], i * 6); }); rainGeo.attributes.position.needsUpdate = true; }
    // Tumbling autumn leaves in a box.
    const LEAFN = 160, leaves = new T.InstancedMesh(new T.PlaneGeometry(0.09, 0.06), new T.MeshLambertMaterial({ color: "#ffffff", side: T.DoubleSide }), LEAFN); leaves.frustumCulled = false; scene.add(leaves);
    for (let i = 0; i < LEAFN; i++) leaves.setColorAt(i, COL.set(["#d8782a", "#c8502a", "#e8b030", "#a8402a"][i % 4]));
    function leafFall(t, cx, cy0, cz, w, h, d) { leaves.visible = true; const r = rng(81); for (let i = 0; i < LEAFN; i++) { const u = r(), v = r(), q = r(), sp = 0.3 + r() * 0.4; const y = cy0 + h - fract(v + t * sp * 0.15) * h; D.position.set(cx + (u - 0.5) * w + Math.sin(t * 1.3 + i) * 0.3, y, cz + (q - 0.5) * d); D.rotation.set(t * 2 + i, t * 1.5 + i * 2, t + i); D.scale.setScalar(1); D.updateMatrix(); leaves.setMatrixAt(i, D.matrix); } leaves.instanceMatrix.needsUpdate = true; }
    // Dust motes floating in front of the camera (call after place()).
    const MOTES = []; for (let i = 0; i < 26; i++) { const s = LP9.glow(0.04 + (i % 4) * 0.015, "#fff0d0"); s.material.opacity = 0.4; scene.add(s); MOTES.push(s); }
    function motes(t, spread) { const r2 = rng(3); MOTES.forEach((s, i) => { s.visible = true; const p = new T.Vector3((r2() - 0.5) * spread, (r2() - 0.5) * spread * 1.6, -0.4 - r2() * spread * 1.5); p.x += Math.sin(t * 0.3 + i) * 0.08; p.y += ((t * 0.04 + r2()) % 1) * 0.5 - 0.25; s.position.copy(camera.localToWorld(p)); }); }
    Object.assign(K, { bloomPass, render, snow, snowfall, rain, rainfall, leaves, leafFall, MOTES, motes });

    /* ---- Characters ---- */
    const marsh = sized(LP9.dog({ terrier: true }), 0.45); scene.add(marsh);
    const puddle = LP9.duckling(); marsh.head.add(puddle);
    // Puddle back in his spot on Marsh's head.
    const puddleHome = () => { marsh.head.add(puddle); puddle.position.set(0, 0.12, -0.01); puddle.rotation.set(0, -0.2, 0); puddle.scale.setScalar(0.85); };
    function putMarsh(x, y, z, ry, pose) { marsh.visible = true; marsh.position.set(x, y, z); marsh.rotation.set(0, ry || 0, 0); marsh.pose(Object.assign({ wag: 0, mouth: 0.15 }, pose)); }
    const wag = (t, f) => Math.sin(t * (f || 20)) * 0.6;
    // "You": the owner, a blocky figure (LP9.figure set() poses).
    const you = LP9.figure({ skin: "#e8b797", hair: "#3a2619", top: "#b8323a", legs: "#3a4a6a" }); scene.add(you);
    // First-person arms: aim(armL, hand x, y, z) after place(); the sleeve stretches back to a shoulder just off-screen.
    function mkArm(c) { const g = new T.Group(); g.sl = new T.Mesh(geoT(0.09, 0.09, 1, 0, 0, 0.5), M(c)); g.add(g.sl); g.add(new T.Mesh(geoT(0.08, 0.07, 0.11, 0, 0, -0.03), M("#e6b491", { emissive: "#3a2418" }))); g.add(new T.Mesh(geoT(0.1, 0.1, 0.05, 0, 0, 0.1), M("#f4f2ea"))); return g; }
    const armL = mkArm("#b8323a"), armR = mkArm("#b8323a"); [armL, armR].forEach((a) => scene.add(a));
    const SH = new T.Vector3();
    function aim(arm, hx, hy, hz) { arm.visible = true; arm.position.set(hx, hy, hz); camera.updateMatrixWorld(true); const lx = camera.worldToLocal(arm.position.clone()).x; SH.set((lx >= 0 ? 1 : -1) * 0.26, -0.5, 0.25); camera.localToWorld(SH); arm.up.set(0, 1, 0); arm.lookAt(SH); arm.sl.scale.z = arm.position.distanceTo(SH); }
    // First-person legs (seated, jeans), placed by the shot.
    const legs = new T.Group(); scene.add(legs); [-0.12, 0.12].forEach((x) => { bx(legs, 0.17, 0.17, 0.62, "#3a4a6a", x, 0, -0.31); bx(legs, 0.17, 0.42, 0.17, "#3a4a6a", x, -0.42, -0.62); });
    Object.assign(K, { marsh, puddle, puddleHome, putMarsh, wag, you, mkArm, armL, armR, aim, legs });

    /* ---- Accessories on Marsh's head (all hidden by reset) ---- */
    const fedora = new T.Group(); marsh.head.add(fedora); fedora.position.set(0, 0.13, -0.01); cy(fedora, 0.19, 0.19, 0.015, "#1a1a1e", 0, 0, 0, 16); cy(fedora, 0.12, 0.13, 0.12, "#1a1a1e", 0, 0.01, 0, 16); cy(fedora, 0.131, 0.131, 0.03, "#8a1a22", 0, 0.015, 0, 16);
    const chew = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.14, 8), M("#a8703a")); chew.rotation.z = Math.PI / 2 - 0.3; chew.position.set(0.07, -0.11, 0.2); marsh.head.add(chew);
    // DJ kit: headphones with neon rings and shades.
    const djKit = new T.Group(); marsh.head.add(djKit); { const band = new T.Mesh(new T.TorusGeometry(0.165, 0.022, 6, 18, Math.PI), M("#1a1a20")); band.position.set(0, 0.0, -0.01); djKit.add(band); [-1, 1].forEach((s) => { const cup = new T.Mesh(new T.BoxGeometry(0.06, 0.12, 0.12), M("#1a1a20")); cup.position.set(s * 0.165, -0.01, -0.01); djKit.add(cup); const ring = new T.Mesh(new T.BoxGeometry(0.062, 0.05, 0.05), ADDM("#2bf0ff", 0.9)); ring.position.set(s * 0.168, -0.01, -0.01); djKit.add(ring); });
      const sh2 = new T.Mesh(new T.BoxGeometry(0.29, 0.06, 0.02), new T.MeshLambertMaterial({ color: "#0a0a10" })); sh2.position.set(0, 0.04, 0.132); djKit.add(sh2); [-1, 1].forEach((s) => { const lens = new T.Mesh(new T.BoxGeometry(0.1, 0.055, 0.005), ADDM("#ff2bd6", 0.35)); lens.position.set(s * 0.07, 0.04, 0.144); djKit.add(lens); }); }
    // Lead in Marsh's mouth (loop and dangling strap).
    const mouthLead = new T.Group(); marsh.head.add(mouthLead); { const lp = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 6, 12), M("#c8202a")); lp.rotation.y = Math.PI / 2; lp.position.set(0, -0.11, 0.21); mouthLead.add(lp); const st2 = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 0.34, 5), M("#c8202a")); st2.position.set(0.05, -0.27, 0.2); st2.rotation.z = 0.25; mouthLead.add(st2); }
    // Lead from Marsh's collar to a hand: leadTo(worldPos) (e.g. you.handR.getWorldPosition(v)).
    const lead = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 1, 5), M("#c8202a")); scene.add(lead);
    const UP = new T.Vector3(0, 1, 0), LC = new T.Vector3(), LD = new T.Vector3();
    function leadTo(handPos) { marsh.updateMatrixWorld(true); marsh.head.getWorldPosition(LC); LC.y -= 0.08; LC.z -= 0.08; lead.visible = true; lead.position.copy(handPos).add(LC).multiplyScalar(0.5); lead.scale.y = handPos.distanceTo(LC); lead.quaternion.setFromUnitVectors(UP, LD.copy(LC).sub(handPos).normalize()); }
    const ACCESSORIES = [fedora, chew, djKit, mouthLead, lead];
    Object.assign(K, { fedora, chew, djKit, mouthLead, lead, leadTo, ACCESSORIES });

    /* ---- Reset ---- */
    const RESETS = [];
    K.onReset = (fn) => RESETS.push(fn);
    K.reset = function () {
      GROUPS.forEach((g) => (g.visible = false)); marsh.visible = false; puddleHome(); puddle.pose({});
      ACCESSORIES.forEach((a) => (a.visible = false)); you.visible = false; armL.visible = false; armR.visible = false; legs.visible = false;
      snow.visible = false; rain.visible = false; leaves.visible = false; MOTES.forEach((m) => (m.visible = false));
      K.BLOOM = 0; K.FLASH = 0; RESETS.forEach((fn) => fn());
    };

    /* ================= SETS (build only what the video uses) ================= */

    // THE HOUSE: one room (10 x 8 m, floor at y 0, back wall z -4 with the window at x 2.5, front door at x 3.6 z 3.9).
    // snowy: snow outside the window. xmas: tree, garland and stockings. Returns { group, show(t, mode), ... }.
    K.buildRoom = function (o) {
      o = o || {}; const SNOWY = !!o.snowy, XMAS = !!o.xmas;
      const room = group();
      flat(room, 10, 8, "#8a5a3a", 0, 0, 0); for (let i = 0; i < 20; i++) bx(room, 10, 0.004, 0.02, "#6a4028", 0, 0.001, -4 + i * 0.4);
      const CREAM = "#efe0c8", BRICK = "#9a5038";
      const wall = (w, h, x, y, z) => { const a = bx(room, w, h, 0.1, CREAM, x, y, z + 0.05); const b = bx(room, w, h, 0.15, BRICK, x, y, z - 0.08); a.castShadow = false; b.castShadow = false; };
      wall(6.4, 3.2, -1.8, 0, -4); wall(1.4, 3.2, 4.3, 0, -4); wall(2.2, 0.9, 2.5, 0, -4); wall(2.2, 0.8, 2.5, 2.4, -4);
      [-5, 5].forEach((x) => { bx(room, 0.1, 3.2, 8, CREAM, x, 0, 0).castShadow = false; }); bx(room, 10, 3.2, 0.1, CREAM, 0, 0, 4).castShadow = false; bx(room, 10, 0.1, 8, "#f4ecdc", 0, 3.2, 0).castShadow = false;
      bx(room, 10, 0.12, 0.04, "#d8c8a8", 0, 0, -3.88); bx(room, 10, 0.06, 0.04, "#d8c8a8", 0, 2.2, -3.88);
      for (let i = 0; i < 4; i++) bx(room, 0.5, 0.7, 0.03, ["#6a8aa8", "#c8a050", "#4a7a5a", "#a85a5a"][i], -4.5 + i * 0.01, 1.4, -2.6 + i * 1.3).rotation.y = Math.PI / 2;
      // Window: frame, cross bars, faint glass, sills, window seat.
      [[2.5, 0.88, 2.3, 0.08], [2.5, 2.38, 2.3, 0.08]].forEach(([x, y, w, h]) => bx(room, w, h, 0.32, "#f4f2ea", x, y, -4.02));
      [1.38, 3.58].forEach((x) => bx(room, 0.08, 1.5, 0.3, "#f4f2ea", x, 0.9, -4.02)); bx(room, 2.2, 0.05, 0.3, "#f4f2ea", 2.5, 1.62, -4.02);
      { const gl = new T.Mesh(new T.PlaneGeometry(2.2, 1.5), new T.MeshBasicMaterial({ color: "#bcd8ff", transparent: true, opacity: 0.1, depthWrite: false })); gl.position.set(2.5, 1.65, -4.02); room.add(gl); }
      bx(room, 2.5, 0.06, 0.45, "#f4f2ea", 2.5, 0.9, -3.75); bx(room, 2.4, 0.08, 0.3, "#ffffff", 2.5, 0.92, -4.25); bx(room, 2.2, 0.05, 0.22, "#ffffff", 2.5, 2.42, -4.24);
      bx(room, 2.3, 0.55, 0.6, "#c8b090", 2.5, 0, -3.65); bx(room, 2.2, 0.12, 0.55, "#3a6a7a", 2.5, 0.55, -3.65);
      // Outside the window: gardens, houses opposite, street lamps, trees.
      flat(room, 120, 60, "#e8eef6", 0, -0.01, -34); { const H2 = [], hr = rng(4); for (let i = 0; i < 14; i++) { const x = -40 + i * 6.2, z = -22 - (i % 2) * 2; const c = ["#8a4a36", "#a0583f", "#6a4a3a", "#c8b8a0"][i % 4]; H2.push([x, 0, z, 6, 6.5, 6, c]); H2.push([x, 6.5, z, 6.3, 0.5, 6.3, "#ffffff"]); [1.5, 4].forEach((y) => [-1.6, 1.6].forEach((dx) => H2.push([x + dx, y, z + 3.01, 1.0, 1.2, 0.05, hr() > 0.35 ? "#ffd890" : "#2a3442"]))); } blocks(room, H2, false); }
      const OUTGLOW = []; [[-6, -14], [6, -14], [14, -14]].forEach(([x, z]) => { bx(room, 0.15, 4, 0.15, "#2a2a2e", x, 0, z); OUTGLOW.push(glow(1.6, "#ffd890", x, 4.1, z, room)); });
      for (let i = 0; i < 9; i++) { const tr = new T.Group(); tr.position.set(-10 + i * 3.4, 0, -8 - (i % 3) * 1.5); room.add(tr); cone(tr, 0.9, 2.6, "#2f5a3a", 0, 0.4, 0, 7); cone(tr, 0.75, 0.9, "#ffffff", 0, 2.1, 0, 7); }
      // Fireplace with stockings and a flickering fire.
      bx(room, 2.0, 1.3, 0.55, "#b8a890", -2, 0, -3.72); bx(room, 1.1, 0.8, 0.3, "#1a1412", -2, 0.1, -3.55); bx(room, 2.3, 0.12, 0.7, "#6a4028", -2, 1.3, -3.72); bx(room, 2.0, 1.9, 0.4, "#c8b8a0", -2, 1.42, -3.8);
      [-2.6, -2.0, -1.4].forEach((x, i) => { bx(room, 0.04, 0.12, 0.02, "#e8c83a", x, 1.22, -3.38); bx(room, 0.2, 0.3, 0.1, ["#c8202a", "#2f7a4a", "#c8202a"][i], x, 0.94, -3.36); bx(room, 0.22, 0.08, 0.11, "#ffffff", x, 1.18, -3.36); bx(room, 0.16, 0.1, 0.14, ["#c8202a", "#2f7a4a", "#c8202a"][i], x + 0.06, 0.88, -3.32); });
      const FIRE = [0, 1, 2, 3].map((i) => glow(0.5 + i * 0.12, ["#ffb040", "#ff7a2a", "#ffd070", "#ff5a1a"][i], -2 + (i - 1.5) * 0.14, 0.32, -3.45, room));
      [-0.2, 0.05, 0.2].forEach((x) => { bx(room, 0.5, 0.08, 0.08, "#4a2a18", -2 + x * 0.6, 0.1, -3.45).rotation.y = x * 2; });
      const fireLight = new T.PointLight("#ff9a4a", 2.5, 7, 1.6); fireLight.position.set(-2, 0.7, -3.0); room.add(fireLight);
      const lampLight = new T.PointLight("#ffd8a0", 1.6, 9, 1.5); lampLight.position.set(1.5, 2.6, 1.0); room.add(lampLight);
      cy(room, 0.02, 0.02, 0.6, "#2a2a2e", 1.5, 2.6, 1.0, 6); cy(room, 0.25, 0.32, 0.25, "#f4e4c4", 1.5, 2.42, 1.0, 12).castShadow = false; glow(0.9, "#ffe0a8", 1.5, 2.4, 1.0, room);
      // Christmas tree in the corner with baubles and fairy lights.
      const tree = new T.Group(); tree.position.set(-4.0, 0, -2.9); room.add(tree); cy(tree, 0.1, 0.12, 0.3, "#5a3a24", 0, 0, 0, 6); cy(tree, 0.3, 0.26, 0.25, "#b8323a", 0, 0, 0, 10);
      [[0.95, 1.1, 0.25], [0.75, 0.95, 0.85], [0.5, 0.8, 1.4]].forEach(([r, h, y]) => cone(tree, r, h, "#2f6a3a", 0, y, 0, 9));
      const star = glow(0.6, "#ffe070", 0, 2.25, 0, tree); bx(tree, 0.14, 0.14, 0.04, "#ffd23a", 0, 2.15, 0);
      const TLIGHTS = []; { const tr2 = rng(8); for (let i = 0; i < 46; i++) { const y = 0.35 + tr2() * 1.7, rr = (1 - (y - 0.25) / 1.95) * 0.95, a = tr2() * 6.28; const p = [Math.cos(a) * rr, y, Math.sin(a) * rr]; if (i % 2) { const b = sh(new T.Mesh(new T.SphereGeometry(0.06, 10, 8), new T.MeshStandardMaterial({ color: ["#c8202a", "#ffd23a", "#2f7bf0", "#e8e8e8"][i % 4], metalness: 0.6, roughness: 0.25 }))); b.position.set(...p); tree.add(b); } else TLIGHTS.push(glow(0.16, ["#ffd890", "#ff8a8a", "#a8d8ff", "#c8ffb0"][i % 4], p[0], p[1], p[2], tree)); } }
      const GARLAND = []; for (let i = 0; i < 28; i++) GARLAND.push(glow(0.14, ["#ffd890", "#ff9a9a", "#a8d8ff"][i % 3], -4.8 + i * 0.36, 2.95 - Math.abs(Math.sin(i * 0.45)) * 0.18, -3.86, room));
      // Sofa and rug.
      flat(room, 3.2, 2.2, "#a8323a", -1.8, 0.004, 0.8); flat(room, 2.9, 1.9, "#c84a4a", -1.8, 0.006, 0.8);
      bx(room, 2.4, 0.35, 0.9, "#3a6a7a", -1.8, 0, 1.75); bx(room, 2.4, 0.6, 0.25, "#3a6a7a", -1.8, 0.35, 2.12); [-1, 1].forEach((s) => bx(room, 0.22, 0.55, 0.9, "#34606e", -1.8 + s * 1.2, 0, 1.75)); [-0.55, 0.55].forEach((x) => bx(room, 1.05, 0.1, 0.75, "#4a7a8a", -1.8 + x, 0.35, 1.7));
      // Kitchen table (top at y 0.8, centre 2.4, 1.2), chairs, mug, cookies, laptop.
      bx(room, 1.5, 0.06, 1.0, "#a8784a", 2.4, 0.74, 1.2); [[-0.65, -0.42], [0.65, -0.42], [-0.65, 0.42], [0.65, 0.42]].forEach(([x, z]) => bx(room, 0.07, 0.74, 0.07, "#8a5a3a", 2.4 + x, 0, 1.2 + z));
      const chair = (x, z, ry) => { const c = new T.Group(); c.position.set(x, 0, z); c.rotation.y = ry; room.add(c); bx(c, 0.46, 0.05, 0.46, "#8a5a3a", 0, 0.46, 0); bx(c, 0.46, 0.55, 0.05, "#8a5a3a", 0, 0.5, 0.21); [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([a, b]) => bx(c, 0.04, 0.46, 0.04, "#7a4a2a", a, 0, b)); bx(c, 0.42, 0.05, 0.42, "#c84a4a", 0, 0.51, 0); return c; };
      chair(2.4, 1.95, 0); chair(1.4, 1.2, Math.PI / 2);
      cy(room, 0.05, 0.04, 0.1, "#ffffff", 2.95, 0.8, 0.95, 12); cy(room, 0.045, 0.045, 0.01, "#6a3a1a", 2.95, 0.895, 0.95, 12); bx(room, 0.25, 0.04, 0.32, "#f4f0e4", 1.95, 0.8, 0.95).rotation.y = 0.3;
      for (let i = 0; i < 3; i++) cy(room, 0.035, 0.035, 0.015, "#c8803a", 2.85 + i * 0.03, 0.8 + i * 0.016, 1.45, 10);
      const laptop = new T.Group(); laptop.position.set(2.25, 0.8, 1.2); laptop.rotation.y = -Math.PI / 2; room.add(laptop); bx(laptop, 0.34, 0.015, 0.24, "#c8ccd4", 0, 0, 0); const lscr = new T.Group(); lscr.position.set(0, 0.015, -0.12); lscr.rotation.x = -0.25; laptop.add(lscr); bx(lscr, 0.34, 0.23, 0.012, "#c8ccd4", 0, 0, 0); { const sc = new T.Mesh(new T.PlaneGeometry(0.31, 0.2), new T.MeshBasicMaterial({ color: "#a8c8ff" })); sc.position.set(0, 0.115, 0.007); lscr.add(sc); [0.06, 0.1, 0.14].forEach((y) => { const ln = new T.Mesh(new T.PlaneGeometry(0.2, 0.012), new T.MeshBasicMaterial({ color: "#5a7ab8" })); ln.position.set(-0.03, y, 0.008); lscr.add(ln); }); }
      const lapGlow = glow(0.8, "#a8c8ff", 2.3, 1.0, 1.2, room);
      // The present (hidden by default; the lid pops off).
      const present = new T.Group(); present.position.set(-3.1, 0, -2.0); room.add(present);
      { const red = "#c8202a"; bx(present, 0.62, 0.5, 0.05, red, 0, 0, 0.29); bx(present, 0.62, 0.5, 0.05, red, 0, 0, -0.29); bx(present, 0.05, 0.5, 0.62, red, 0.29, 0, 0); bx(present, 0.05, 0.5, 0.62, red, -0.29, 0, 0); bx(present, 0.6, 0.02, 0.6, red, 0, 0, 0); [[0, 0.315], [0, -0.315]].forEach(([x, z]) => bx(present, 0.08, 0.5, 0.01, "#ffd23a", x, 0, z)); [[0.315, 0], [-0.315, 0]].forEach(([x, z]) => bx(present, 0.01, 0.5, 0.08, "#ffd23a", x, 0, z)); }
      const lid = new T.Group(); lid.position.set(0, 0.5, 0); present.add(lid); bx(lid, 0.68, 0.1, 0.68, "#d02a32", 0, 0, 0); bx(lid, 0.69, 0.1, 0.08, "#ffd23a", 0, 0.001, 0); bx(lid, 0.08, 0.1, 0.69, "#ffd23a", 0, 0.001, 0);
      { const b = new T.Group(); lid.add(b); [-1, 1].forEach((k) => { const loop = new T.Mesh(new T.TorusGeometry(0.06, 0.022, 6, 12), M("#ffd23a")); loop.position.set(k * 0.06, 0.03, 0); loop.rotation.set(0, Math.PI / 2, k * 0.5); b.add(loop); }); bx(b, 0.05, 0.05, 0.05, "#e8b830", 0, 0.005, 0); b.scale.setScalar(1.6); b.position.set(0, 0.1, 0); }
      // Front door (inside face z 3.95) with the lead on a hook, doormat, coat, cat flap.
      bx(room, 1.3, 2.35, 0.12, "#f4f2ea", 3.6, 0, 3.94); const fdoor = bx(room, 1.05, 2.2, 0.08, "#2f5f3a", 3.6, 0, 3.9); [[3.38, 0.5], [3.82, 0.5], [3.38, 1.4], [3.82, 1.4]].forEach(([x, y]) => bx(room, 0.36, 0.7, 0.02, "#2a5434", x, y, 3.85)); { const kn = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), new T.MeshStandardMaterial({ color: "#e0b84a", metalness: 0.9, roughness: 0.3 })); kn.position.set(3.2, 1.05, 3.84); room.add(kn); }
      bx(room, 0.5, 0.05, 0.08, "#6a4028", 2.65, 1.45, 3.93); [2.5, 2.65, 2.8].forEach((x) => bx(room, 0.03, 0.08, 0.06, "#c8a050", x, 1.42, 3.9));
      const hookLead = new T.Group(); room.add(hookLead); hookLead.position.set(2.65, 1.44, 3.88); { const loop = new T.Mesh(new T.TorusGeometry(0.07, 0.012, 6, 14), M("#c8202a")); loop.position.y = -0.06; hookLead.add(loop); const strap = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.55, 5), M("#c8202a")); strap.position.y = -0.4; hookLead.add(strap); bx(hookLead, 0.04, 0.06, 0.03, "#c8c8c8", 0, -0.7, 0); }
      bx(room, 1.2, 0.03, 0.6, "#8a5a3a", 3.6, 0.0, 3.4); bx(room, 0.4, 0.9, 0.12, "#3a4a6a", 2.25, 0.85, 3.86);
      { const fo = new T.Mesh(new T.PlaneGeometry(0.3, 0.3), new T.MeshBasicMaterial({ color: "#1a2848" })); fo.rotation.y = Math.PI; fo.position.set(3.6, 0.26, 3.845); room.add(fo); }
      const catFlap = new T.Group(); catFlap.position.set(3.6, 0.42, 3.8); room.add(catFlap); bx(catFlap, 0.34, 0.03, 0.04, "#c8c8c8", 0, 0, 0); const flapLeaf = bx(catFlap, 0.3, 0.3, 0.02, "#d8dce4", 0, -0.32, 0);
      // Your bed in the front-left corner (pillows toward +z).
      const yourBed = new T.Group(); yourBed.position.set(-3.9, 0, 2.9); room.add(yourBed); bx(yourBed, 1.6, 0.35, 2.0, "#8a5a3a", 0, 0, 0); bx(yourBed, 1.55, 0.18, 1.95, "#f4f2ea", 0, 0.35, 0); bx(yourBed, 1.58, 0.1, 1.3, "#3a5a9a", 0, 0.5, -0.3); [-0.38, 0.38].forEach((x) => bx(yourBed, 0.6, 0.14, 0.32, "#ffffff", x, 0.5, 0.75)); bx(yourBed, 1.6, 0.9, 0.08, "#6a4028", 0, 0.3, 0.98);

      // Season switches. Without Christmas: no tree, garland or stockings.
      if (!XMAS) { tree.visible = false; GARLAND.forEach((g) => (g.visible = false)); room.children.forEach((m) => { if (m.isMesh && m.position.z > -3.42 && m.position.z < -3.3 && m.position.y > 0.8 && m.position.y < 1.3 && m.position.x < -1.2 && m.position.x > -2.8) m.visible = false; }); }
      // Without snow: dark roofs, green gardens, no snow caps on the trees outside.
      if (!SNOWY) { room.traverse((m) => { if (m.isInstancedMesh && m.instanceColor) { for (let i = 0; i < m.count; i++) { m.getColorAt(i, COL); if (COL.r > 0.97 && COL.g > 0.97 && COL.b > 0.97) m.setColorAt(i, COL.set("#5a4a4a")); } m.instanceColor.needsUpdate = true; } if (m.isMesh && m.material && m.material.color && m.geometry && m.geometry.type === "PlaneGeometry" && m.material.color.getHexString() === "e8eef6") m.material = M("#4a6a3a"); if (m.isMesh && m.geometry && m.geometry.type === "ConeGeometry" && m.material.color && m.material.color.getHexString() === "ffffff") m.visible = false; }); }

      function twinkle(t) { TLIGHTS.forEach((g, i) => (g.material.opacity = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7))); GARLAND.forEach((g, i) => (g.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.4 + i))); FIRE.forEach((f, i) => f.scale.setScalar((0.5 + i * 0.12) * (1 + 0.18 * Math.sin(t * 13 + i * 2)))); fireLight.intensity = 2.3 + 0.5 * Math.sin(t * 11) + 0.3 * Math.sin(t * 17); star.material.opacity = 0.8 + 0.2 * Math.sin(t * 2); }
      // Turn the room on with lighting ("cosy" night by default) and the living fire, lights and snow.
      function show(t, mode) { room.visible = true; light(mode || "cosy", 0, -1, 6, 60); twinkle(t); if (SNOWY) snowfall(t, 2.5, 0, -9, 14, 6, 9, 0.06); }
      K.onReset(() => { present.visible = false; lid.position.set(0, 0.5, 0); lid.rotation.set(0, 0, 0); present.rotation.set(0, 0, 0); fdoor.rotation.y = 0; hookLead.visible = true; flapLeaf.rotation.x = 0; lapGlow.visible = true; });
      return { group: room, show, twinkle, SNOWY, XMAS, tree, star, TLIGHTS, GARLAND, FIRE, fireLight, lampLight, OUTGLOW, present, lid, fdoor, hookLead, catFlap, flapLeaf, yourBed, laptop, lapGlow, chair };
    };

    // THE STREET: terraced houses either side of a road running along +z (road x -3..3, pavements to x ±5.6, doors at x ±6.17).
    // snowy: snow on roofs, pavements and trees, plus snowmen. Returns { group, LAMPS, TREES, snowmen }.
    K.buildStreet = function (o) {
      o = o || {}; const SNOWY = !!o.snowy;
      const street = group();
      flat(street, 400, 900, "#eef2f8", 0, -0.02, 300); flat(street, 6, 900, "#c8d0dc", 0, 0, 300); [-1.2, 1.2].forEach((x) => flat(street, 0.5, 900, "#9aa4b4", x, 0.002, 300)); [-1, 1].forEach((s) => { flat(street, 2.6, 900, "#f4f6fa", s * 4.3, 0.12, 300); bx(street, 0.15, 0.12, 900, "#dfe4ec", s * 3.0, 0, 300); });
      { const L2 = []; [-1, 1].forEach((s) => { for (let z = -10; z < 700; z += 6.5) { const k = Math.abs(Math.floor(z / 6.5) + (s > 0 ? 3 : 0)), zc = z + 3.2; const c = ["#a0583f", "#b8684a", "#8a4a36", "#c8b8a0", "#9a5a44", "#e0d4bc"][k % 6], hh = 7 + (k % 3) * 0.6;
        L2.push([s * 9.2, 0, zc, 6, hh, 6.3, c]); L2.push([s * 9.2, hh, zc, 6.4, 0.5, 6.6, "#ffffff"]); L2.push([s * 9.1, hh + 0.5, zc, 5, 1.2, 6.3, "#f4f6fa"]); L2.push([s * 10.6, hh + 0.5, zc - 2.2, 0.8, 1.4, 1.2, "#8a4a36"]); L2.push([s * 10.6, hh + 1.9, zc - 2.2, 0.85, 0.2, 1.25, "#ffffff"]);
        [1.3, 4.0].forEach((y) => [-1.5, 1.5].forEach((dz, j) => L2.push([s * 6.18, y, zc + dz, 0.08, 1.4, 1.1, (k + j + (y > 2 ? 1 : 0)) % 3 ? "#ffd890" : "#2a3442"]))); L2.push([s * 6.17, 0, zc - 0.2, 0.1, 2.1, 1.0, ["#2f5f3a", "#b8323a", "#2a5f8a", "#1a1a1e"][k % 4]]);
        L2.push([s * 5.75, 0, zc - 1.9, 0.28, 0.55, 2.3, "#8a4a36"]); L2.push([s * 5.75, 0.55, zc - 1.9, 0.36, 0.12, 2.4, "#ffffff"]); L2.push([s * 5.75, 0, zc + 1.6, 0.28, 0.55, 2.9, "#8a4a36"]); L2.push([s * 5.75, 0.55, zc + 1.6, 0.36, 0.12, 3.0, "#ffffff"]); L2.push([s * 6.0, 0, zc - 0.2, 0.5, 0.15, 1.2, "#e8ecf2"]);
        if (k % 3 === 0) { L2.push([s * 4.8, 0, zc, 0.12, 4.5, 0.12, "#2a2a2e"]); L2.push([s * 4.6, 4.5, zc, 0.5, 0.15, 0.25, "#2a2a2e"]); } } }); blocks(street, L2); }
      const LAMPS = []; [-1, 1].forEach((s) => { for (let z = -10; z < 300; z += 19.5) LAMPS.push(glow(1.4, "#ffd890", s * 4.45, 4.35, z + 3.2, street)); });
      const TREES = []; for (let i = 0; i < 24; i++) { const tr = new T.Group(); tr.position.set((i % 2 ? 1 : -1) * 4.9, 0, -6 + i * 9.5); street.add(tr); TREES.push(tr); cy(tr, 0.1, 0.13, 2.2, "#5a4030", 0, 0, 0, 6); cone(tr, 1.3, 2.4, "#2f5a3a", 0, 1.6, 0, 7); cone(tr, 1.0, 1.0, "#ffffff", 0, 3.1, 0, 7); }
      const snowmen = []; for (let i = 0; i < 6; i++) { const sm = new T.Group(); sm.position.set((i % 2 ? 1 : -1) * 5.2, 0.12, 6 + i * 21); street.add(sm); snowmen.push(sm); const b1 = sh(new T.Mesh(new T.SphereGeometry(0.4, 10, 8), M("#ffffff"))); b1.position.y = 0.38; sm.add(b1); const b2 = sh(new T.Mesh(new T.SphereGeometry(0.28, 10, 8), M("#ffffff"))); b2.position.y = 0.9; sm.add(b2); bx(sm, 0.05, 0.05, 0.16, "#e8802a", 0, 0.9, 0.28); bx(sm, 0.4, 0.06, 0.08, "#c8202a", 0, 0.62, 0.05); }
      // Without snow: tarmac, paving, grass, normal roofs and no snowmen.
      if (!SNOWY) { const MAP = { "eef2f8": "#6a8a4a", "c8d0dc": "#3a3638", "9aa4b4": "#3a3638", "f4f6fa": "#b9b3a6", "dfe4ec": "#c8c4b8" };
        street.traverse((m) => { if (m.isInstancedMesh && m.instanceColor) { for (let i = 0; i < m.count; i++) { m.getColorAt(i, COL); const h = COL.getHexString(); if (h === "ffffff" || h === "f4f6fa" || h === "e8ecf2") m.setColorAt(i, COL.set(h === "ffffff" ? "#4a3a3a" : "#c8c4b8")); } m.instanceColor.needsUpdate = true; }
          else if (m.isMesh && m.material && m.material.color) { const h = m.material.color.getHexString(); if (MAP[h]) m.material = M(MAP[h]); if (h === "ffffff" && m.geometry && m.geometry.type === "ConeGeometry") m.visible = false; if (h === "ffffff" && m.geometry && m.geometry.type === "SphereGeometry" && m.parent) m.parent.visible = false; } }); }
      K.onReset(() => TREES.forEach((tr) => (tr.visible = true)));
      return { group: street, SNOWY, LAMPS, TREES, snowmen };
    };

    // THE PARK: big lawn with a path along z (x -1.1..1.1), trees, a pond at (-6, -8) and a bench at (2.4, -2). Includes a tennis ball.
    K.buildPark = function () {
      const park = group(); flat(park, 200, 200, "#6a9a4a", 0, 0, 0); flat(park, 2.2, 200, "#d8c8a0", 0, 0.004, 0);
      const pr = rng(31); for (let i = 0; i < 40; i++) { const x = (pr() - 0.5) * 60, z = (pr() - 0.5) * 60 - 10; if (Math.abs(x) < 3) continue; const tr = new T.Group(); tr.position.set(x, 0, z); park.add(tr); cy(tr, 0.15, 0.2, 2.2, "#5a4030", 0, 0, 0, 6); const top = sh(new T.Mesh(LP.lumpy(1.6 + pr(), 300 + i, 1), M(["#4f8a4a", "#5f9a4a", "#3f7a42"][i % 3]))); top.position.y = 3.2; tr.add(top); }
      const pond = new T.Mesh(new T.CircleGeometry(4, 24), M("#5a9ac8")); pond.rotation.x = -Math.PI / 2; pond.position.set(-6, 0.01, -8); park.add(pond);
      bx(park, 1.6, 0.08, 0.5, "#6a4028", 2.4, 0.45, -2); [1.8, 3.0].forEach((x) => bx(park, 0.08, 0.45, 0.4, "#2a2a2e", x, 0, -2));
      const ball = new T.Mesh(new T.SphereGeometry(0.06, 12, 10), M("#d8e84a")); scene.add(ball); ball.visible = false;
      K.onReset(() => (ball.visible = false));
      return { group: park, pond, ball };
    };

    // THE BEACH: sand at y 0, the sea from z -3.2 back (foam line at z -3.2), rocks, a low sun disc at (-20, 12, -140).
    K.buildBeach = function () {
      const beach = group(); flat(beach, 300, 300, "#e8d4a8", 0, 0, 0); const sea = flat(beach, 300, 150, "#3a8ab0", 0, 0.02, -78); const foam = flat(beach, 300, 3, "#f4f8fa", 0, 0.025, -3.2);
      const br = rng(41); for (let i = 0; i < 14; i++) { const rk = sh(new T.Mesh(LP.lumpy(0.4 + br() * 0.6, 500 + i, 1), M("#8a8478"))); rk.position.set((br() - 0.5) * 30, 0.1, br() * 8); rk.scale.y = 0.6; beach.add(rk); }
      const sunDisc = glow(30, "#ffb070", -20, 12, -140, beach);
      return { group: beach, sea, foam, sunDisc };
    };


    /* ================= BATH-TIME KIT (water, wet fur, bathroom, stairs, laundry, garden) ================= */
    LIGHTS.bath = ["#f4f8ff", 1.2, [2, 9, 8], "#f0f6ff", "#b8c8d0", 1.6, "#cfe4ec", "#cfe4ec"];
    LIGHTS.boss = ["#c8d0ff", 0.55, [-3, 8, 6], "#8a94c8", "#20141c", 0.85, "#10101c", "#10101c"];
    LIGHTS.evening = ["#ffc890", 1.5, [-8, 7, 10], "#c8d0f0", "#6a5a3a", 1.4, "#e8b890", "#d8b0a0"];

    // Coat tint: amt 0..1 of colour c over Marsh's own colours (wet = dark and slick, mud = brown).
    const MARSH_MATS = []; { const pm = new Set(); puddle.traverse((m) => m.material && pm.add(m.material)); const seen = new Set();
      marsh.traverse((m) => { if (m.isMesh && m.material && m.material.color && !pm.has(m.material) && !seen.has(m.material)) { seen.add(m.material); m.material.userData.dry = m.material.color.clone(); MARSH_MATS.push(m.material); } }); }
    const MARSH_S = marsh.scale.x, TINT = new T.Color();
    function coatTint(c, amt) { TINT.set(c); MARSH_MATS.forEach((m) => { const d = m.userData.dry; if (d.r + d.g + d.b < 0.25 || d.r + d.g + d.b > 2.8 || (d.r > 0.85 && d.g < 0.6 && d.b > 0.4) || (d.b > 0.8 && d.r < 0.3)) return; m.color.copy(d).lerp(TINT, amt); }); }
    // Wet fur: w 0..1 slims him (flat fur) and darkens the coat. puff > 0 makes him extra fluffy after the shake.
    function wetMarsh(w, puff) { const p = puff || 0; const sx = MARSH_S * (1 - 0.34 * w + 0.12 * p), sy = MARSH_S * (1 - 0.12 * w + 0.08 * p); marsh.scale.set(sx, sy, MARSH_S * (1 - 0.2 * w + 0.1 * p)); puddle.scale.set(0.85 * MARSH_S / sx, 0.85 * MARSH_S / sy, 0.85); if (w > 0) coatTint("#4a2c18", w * 0.62); }
    Object.assign(K, { coatTint, wetMarsh });

    // Spray: ballistic droplets from a pool, re-used each frame. spray(age, x, y, z, { n, speed, up, spread, g, life, size, col, seed, radial, dir:[x,y,z] })
    const SPN = 1400, spMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff", emissive: "#2a4a60", transparent: true, opacity: 0.85 }), SPN); spMesh.frustumCulled = false; scene.add(spMesh);
    for (let i = 0; i < SPN; i++) spMesh.setColorAt(i, COL.set("#9ad4ff"));
    let spCur = 0; const SPV = new T.Vector3();
    function spray(age, x, y, z, o) {
      o = o || {}; const n = o.n || 60, r = rng(o.seed || 7), life = o.life || 1.2, g = o.g === undefined ? 9.8 : o.g, sz = o.size || 0.025; spMesh.visible = true;
      if (o.col) COL.set(o.col);
      for (let i = 0; i < n && spCur < SPN; i++) {
        const a = r() * 6.283, el = r(), sp = (o.speed || 3) * (0.5 + r() * 0.7), delay = r() * (o.stagger || 0), ttl = life * (0.6 + r() * 0.5);
        let tt = age - delay; if (o.loop) tt = ((tt % o.loop) + o.loop) % o.loop; if (tt < 0 || tt > ttl) continue;
        if (o.radial) SPV.set(Math.cos(a), (o.up || 0.25) + (el - 0.5) * 0.5, Math.sin(a)); else if (o.dir) SPV.set(o.dir[0] + (r() - 0.5) * (o.spread || 0.5), o.dir[1] + (r() - 0.5) * (o.spread || 0.5), o.dir[2] + (r() - 0.5) * (o.spread || 0.5));
        else SPV.set(Math.cos(a) * (o.spread || 0.5) * el, o.up || 1, Math.sin(a) * (o.spread || 0.5) * el);
        SPV.normalize().multiplyScalar(sp);
        D.position.set(x + SPV.x * tt, y + SPV.y * tt - 0.5 * g * tt * tt, z + SPV.z * tt); if (o.floor !== undefined && D.position.y < o.floor) continue;
        const s = sz * (0.6 + r() * 0.8) * (1 - 0.4 * tt / ttl); D.rotation.set(tt * 5 + i, i, 0); D.scale.set(s, s * (1 + Math.min(2, sp * 0.15)), s); D.updateMatrix();
        spMesh.setMatrixAt(spCur, D.matrix); spMesh.setColorAt(spCur, COL.set(o.col || (i % 3 ? "#9ad4ff" : "#e8f6ff"))); spCur++;
      }
    }
    // Bubbles: pool of shiny spheres. bubble(x, y, z, r) places one; foamBox(t, cx, cy, cz, w, d, n, rmax, seed) a wobbling heap; rise(t, ...) floats them up.
    const BBN = 500, bbMesh = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({ color: "#f4fbff", emissive: "#5a7a98", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.78, flatShading: true }), BBN); bbMesh.frustumCulled = false; scene.add(bbMesh);
    let bbCur = 0;
    function bubble(x, y, z, rad) { if (bbCur >= BBN || rad <= 0.001) return; bbMesh.visible = true; D.position.set(x, y, z); D.rotation.set(0, 0, 0); D.scale.setScalar(rad); D.updateMatrix(); bbMesh.setMatrixAt(bbCur++, D.matrix); }
    function foamBox(t, cx, cy, cz, w, d, n, rmax, seed) { const r = rng(seed || 9); for (let i = 0; i < n; i++) { const u = r() - 0.5, v = r() - 0.5, rr = rmax * (0.35 + r() * 0.65); bubble(cx + u * w, cy + r() * rmax * 0.6 + Math.sin(t * 2.2 + i) * 0.006, cz + v * d, rr * (1 + 0.06 * Math.sin(t * 3 + i * 1.7))); } }
    function rise(t, cx, cy, cz, w, h, d, n, rmax, seed) { const r = rng(seed || 13); for (let i = 0; i < n; i++) { const u = r() - 0.5, v = r() - 0.5, sp = 0.2 + r() * 0.4, ph = r(); const k = fract(ph + t * sp / h); bubble(cx + u * w + Math.sin(t * 2 + i) * 0.05, cy + k * h, cz + v * d, rmax * (0.4 + r() * 0.6) * Math.min(1, (1 - k) * 6)); } }
    // Steam: soft white puffs rising and spreading. steam(t, cx, cy, cz, w, amount)
    const STEAM = []; for (let i = 0; i < 40; i++) { const s = LP9.glow(1, "#ffffff"); s.material.opacity = 0; scene.add(s); STEAM.push(s); }
    function steam(t, cx, cy, cz, w, amount) { const r = rng(17); STEAM.forEach((s, i) => { const u = r() - 0.5, v = r() - 0.5, sp = 0.25 + r() * 0.2, k = fract(r() + t * sp * 0.35); s.visible = true; s.position.set(cx + u * w + Math.sin(t * 0.6 + i) * 0.15 * k, cy + k * 1.6, cz + v * w * 0.5); s.scale.setScalar(0.35 + k * 1.2); s.material.opacity = (amount === undefined ? 1 : amount) * 0.12 * Math.sin(Math.PI * k); }); }
    // Lens drops: water on the camera lens, drawn on #world-lens (1080x1920). K.LENS = 0..1 each frame.
    const lensC = document.querySelector("#world-lens"), lensX = lensC && lensC.getContext("2d");
    function lensPass(t) { if (!lensX) return; lensX.clearRect(0, 0, 1080, 1920); const a = K.LENS; if (!(a > 0)) return; const r = rng(K.LENSSEED || 23), n = Math.round(46 * Math.min(1, a));
      for (let i = 0; i < n; i++) { const x = r() * 1080, y0 = r() * 1920, rad = 10 + r() * r() * 70, slide = r() < 0.3 ? (t * 40 * (0.5 + r())) % 400 : 0, y = y0 + slide;
        const g = lensX.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad); g.addColorStop(0, "rgba(255,255,255,0.32)"); g.addColorStop(0.55, "rgba(200,230,255,0.08)"); g.addColorStop(0.85, "rgba(20,30,50,0.22)"); g.addColorStop(1, "rgba(255,255,255,0.35)");
        lensX.globalAlpha = Math.min(1, a * 1.2); lensX.fillStyle = g; lensX.beginPath(); lensX.ellipse(x, y, rad, rad * (slide ? 1.25 : 1), 0, 0, 6.283); lensX.fill();
        lensX.fillStyle = "rgba(255,255,255,0.75)"; lensX.beginPath(); lensX.ellipse(x - rad * 0.35, y - rad * 0.4, rad * 0.18, rad * 0.11, -0.6, 0, 6.283); lensX.fill(); } lensX.globalAlpha = 1; }
    const baseRender = K.render; K.render = function () { baseRender(); lensPass(K.TIME || 0); };
    Object.assign(K, { spray, spMesh, bubble, foamBox, rise, bbMesh, STEAM, steam, lensPass, LENS: 0 });

    // Accessories: a striped sock draped on Marsh's head, a towel over him, a foam crown.
    const sockHat = new T.Group(); marsh.head.add(sockHat); sockHat.position.set(0.02, 0.15, 0); sockHat.rotation.z = -0.25;
    [0, 1, 2, 3, 4].forEach((i) => bx(sockHat, 0.13, 0.05, 0.12, i % 2 ? "#ffffff" : "#e84a5a", 0.0 + i * 0.012, i * 0.045 - 0.03, 0)); bx(sockHat, 0.13, 0.09, 0.2, "#e84a5a", 0.06, 0.2, 0.05).rotation.x = 0.3; bx(sockHat, 0.13, 0.05, 0.12, "#e84a5a", -0.06, -0.08, 0.02);
    const foamHat = new T.Group(); marsh.head.add(foamHat); foamHat.position.set(0, 0.13, 0); { const fr = rng(5); for (let i = 0; i < 14; i++) { const b = new T.Mesh(new T.IcosahedronGeometry(0.035 + fr() * 0.03, 1), M("#ffffff", { emissive: "#6a7a8a", flatShading: true })); b.position.set((fr() - 0.5) * 0.24, fr() * 0.08, (fr() - 0.5) * 0.22); foamHat.add(b); } }
    const towel = new T.Group(); scene.add(towel); { const tw = M("#3a7ad8"); bx(towel, 0.62, 0.04, 0.78, tw, 0, 0.42, 0); [-1, 1].forEach((s) => { const sd = bx(towel, 0.04, 0.34, 0.78, tw, s * 0.3, 0.1, 0); sd.rotation.z = -s * 0.15; }); bx(towel, 0.62, 0.3, 0.04, tw, 0, 0.12, -0.38); bx(towel, 0.64, 0.05, 0.05, "#ffffff", 0, 0.4, 0.39); }
    ACCESSORIES.push(sockHat, foamHat, towel);
    Object.assign(K, { sockHat, foamHat, towel });

    // THE BATHROOM: 4 m wide (x -2..2), back wall z -1.8, open toward +z. Tub along the back wall, centre (0, 0, -1.3), water at y 0.44.
    // Returns { group, show(t, mode), tub, water, tapHandle, spout, shower, showerEyes, tubEyes, tubGlow, shampoo, door, mirror, ... }.
    K.buildBathroom = function () {
      const bath = group(), T2 = [];
      const WX = 2, BZ = -1.8, H = 2.7;
      // Wall tiles (mint and white rows, darker band) and a chequered floor.
      for (let y = 0; y < H; y += 0.2) for (let x = -WX; x < WX; x += 0.2) T2.push([x + 0.1, y + 0.005, BZ + 0.01, 0.19, 0.19, 0.02, y > 1.15 && y < 1.3 ? "#2a5a8a" : (Math.round(x / 0.2 + y / 0.2) % 2 ? "#dde8f0" : "#f2f6fa")]);
      [-1, 1].forEach((s) => { for (let y = 0; y < H; y += 0.2) for (let z = BZ; z < 2.2; z += 0.2) T2.push([s * (WX - 0.01), y + 0.005, z + 0.1, 0.02, 0.19, 0.19, y > 1.15 && y < 1.3 ? "#2a5a8a" : (Math.round(z / 0.2 + y / 0.2) % 2 ? "#dde8f0" : "#f2f6fa")]); });
      for (let x = -WX; x < WX; x += 0.3) for (let z = BZ; z < 2.4; z += 0.3) T2.push([x + 0.15, 0, z + 0.15, 0.3, 0.01, 0.3, Math.round(x / 0.3 + z / 0.3) % 2 ? "#2a3a4a" : "#e8ecef"]);
      blocks(bath, T2, false);
      bx(bath, 4.2, 3, 0.1, "#a8b8c8", 0, 0, BZ - 0.06).castShadow = false; [-1, 1].forEach((s) => (bx(bath, 0.1, 3, 4.4, "#a8b8c8", s * (WX + 0.06), 0, 0.2).castShadow = false)); bx(bath, 4.2, 0.1, 4.4, "#f4f6f4", 0, H, 0.2).castShadow = false;
      // Tub: white sides, rolled rim, gold claw feet, water and bubbles.
      const tub = new T.Group(); tub.position.set(0, 0, -1.3); bath.add(tub);
      const TW = "#f6f8fa"; bx(tub, 1.7, 0.08, 0.8, TW, 0, 0.1, 0); bx(tub, 1.7, 0.5, 0.08, TW, 0, 0.1, 0.36); bx(tub, 1.7, 0.5, 0.08, TW, 0, 0.1, -0.36); bx(tub, 0.08, 0.5, 0.8, TW, 0.81, 0.1, 0); bx(tub, 0.08, 0.5, 0.8, TW, -0.81, 0.1, 0);
      [[0, 0.42], [0, -0.42]].forEach(([x, z]) => bx(tub, 1.78, 0.06, 0.1, "#ffffff", x, 0.58, z)); [[0.86, 0], [-0.86, 0]].forEach(([x, z]) => bx(tub, 0.1, 0.06, 0.94, "#ffffff", x, 0.58, z));
      [[-0.7, 0.3], [0.7, 0.3], [-0.7, -0.3], [0.7, -0.3]].forEach(([x, z]) => { bx(tub, 0.1, 0.12, 0.1, "#e0b84a", x, 0, z); bx(tub, 0.14, 0.03, 0.14, "#c8982a", x, 0, z); });
      const water = new T.Mesh(new T.PlaneGeometry(1.56, 0.66, 12, 6), new T.MeshStandardMaterial({ color: "#7ac8e8", emissive: "#1a5a7a", roughness: 0.1, transparent: true, opacity: 0.82, flatShading: true })); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.44, 0); tub.add(water);
      const WPOS = water.geometry.attributes.position, WBASE = WPOS.array.slice();
      function ripple(t, amp) { for (let i = 0; i < WPOS.count; i++) { const x = WBASE[i * 3], y = WBASE[i * 3 + 1]; WPOS.array[i * 3 + 2] = (amp || 0.012) * Math.sin(x * 9 + t * 4) * Math.cos(y * 11 - t * 3); } WPOS.needsUpdate = true; water.geometry.computeVertexNormals(); }
      // Boss eyes on the tub's front panel and an underglow.
      const tubEyes = new T.Group(); tub.add(tubEyes); [-1, 1].forEach((s) => { const e = new T.Mesh(new T.BoxGeometry(0.22, 0.06, 0.01), ADDM("#ff2a3a", 1)); e.position.set(s * 0.3, 0.38, 0.405); e.rotation.z = s * 0.28; tubEyes.add(e); const e2 = new T.Mesh(new T.BoxGeometry(0.24, 0.025, 0.012), new T.MeshBasicMaterial({ color: "#3a0810" })); e2.position.set(s * 0.32, 0.45, 0.407); e2.rotation.z = s * 0.4; tubEyes.add(e2); });
      const tubGlow = [glow(0.5, "#ff2a5a", 0, 0.03, -0.86, bath), glow(0.35, "#8a3aff", -0.6, 0.03, -0.86, bath), glow(0.35, "#ff6a2a", 0.6, 0.03, -0.86, bath)];
      const tubLight = new T.PointLight("#ff3a4a", 0, 2.2, 2); tubLight.position.set(0, 0.36, -1.3); // inside the tub, under the water bath.add(tubLight);
      // Taps at the left end on the back wall: riser, spout, hot and cold handles.
      const tapG = new T.Group(); tapG.position.set(-0.6, 0.62, BZ + 0.05); bath.add(tapG); const CH = M("#d8dce4", { emissive: "#3a3e48" });
      bx(tapG, 0.08, 0.18, 0.08, CH, 0, 0, 0.04); const spout = bx(tapG, 0.06, 0.06, 0.24, CH, 0, 0.14, 0.18); bx(tapG, 0.07, 0.05, 0.05, CH, 0, 0.1, 0.29);
      const handles = [-1, 1].map((s) => { const h = new T.Group(); h.position.set(s * 0.16, 0.16, 0.08); tapG.add(h); bx(h, 0.04, 0.06, 0.04, CH, 0, 0, 0); [0, 1].forEach((k) => { const arm = bx(h, 0.14, 0.025, 0.025, CH, 0, 0.06, 0); arm.rotation.y = k * Math.PI / 2; }); bx(h, 0.04, 0.02, 0.04, s < 0 ? "#e83a3a" : "#3a7ae8", 0, 0.085, 0); return h; });
      // Shower: hose from the riser up to a wall bracket; the head is its own group so it can rise up like a boss.
      const shower = new T.Group(); shower.position.set(0.55, 1.85, BZ + 0.12); bath.add(shower);
      const shHead = new T.Group(); shower.add(shHead); cy(shHead, 0.035, 0.035, 0.3, CH, 0, -0.3, 0, 8); cy(shHead, 0.13, 0.09, 0.06, CH, 0, 0, 0, 14);
      const shFace = new T.Mesh(new T.CircleGeometry(0.12, 14), M("#9aa4b4")); shFace.rotation.x = Math.PI / 2; shFace.position.y = -0.002; shHead.add(shFace);
      const showerEyes = new T.Group(); shHead.add(showerEyes); [-1, 1].forEach((s) => { const e = new T.Mesh(new T.BoxGeometry(0.07, 0.02, 0.03), ADDM("#ff2a3a", 1)); e.position.set(s * 0.05, -0.012, 0.03); e.rotation.y = s * 0.3; showerEyes.add(e); }); showerEyes.add(glow(0.5, "#ff2a3a", 0, -0.03, 0.03));
      const hose = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 1, 6), CH); bath.add(hose); const HA = new T.Vector3(), HB = new T.Vector3();
      function hoseTo() { shHead.updateMatrixWorld(true); shHead.localToWorld(HB.set(0, -0.3, 0)); tapG.localToWorld(HA.set(0, 0.0, 0.08)); hose.position.copy(HA).add(HB).multiplyScalar(0.5); hose.scale.y = HA.distanceTo(HB); hose.quaternion.setFromUnitVectors(UP, LD.copy(HB).sub(HA).normalize()); }
      bx(bath, 0.08, 0.08, 0.1, CH, 0.55, 1.6, BZ + 0.05);
      // Shampoo bottle on the right end of the rim, a toy boat, a sponge.
      const shampoo = new T.Group(); shampoo.position.set(0.68, 0.61, -1.12); bath.add(shampoo); bx(shampoo, 0.1, 0.24, 0.07, "#e85aa8", 0, 0, 0); bx(shampoo, 0.06, 0.06, 0.05, "#ffffff", 0, 0.24, 0); bx(shampoo, 0.02, 0.04, 0.02, "#ffffff", 0, 0.3, 0.0); bx(shampoo, 0.08, 0.1, 0.005, "#fff4c8", 0, 0.07, 0.036);
      const boat = new T.Group(); bath.add(boat); bx(boat, 0.16, 0.05, 0.08, "#e84a3a", 0, 0, 0); bx(boat, 0.012, 0.12, 0.012, "#6a4a2a", 0, 0.05, 0); { const sail = new T.Mesh(new T.PlaneGeometry(0.08, 0.09), M("#ffffff", { side: T.DoubleSide })); sail.position.set(0.04, 0.11, 0); boat.add(sail); }
      bx(bath, 0.14, 0.06, 0.09, "#f2d23a", -0.66, 0.61, -0.95);
      // Toilet, sink and mirror, towel rail with towel, bath mat, frosted window, plant, light.
      const loo = new T.Group(); loo.position.set(1.55, 0, -1.4); bath.add(loo); bx(loo, 0.36, 0.4, 0.5, TW, 0, 0, 0.05); bx(loo, 0.4, 0.04, 0.54, "#ffffff", 0, 0.4, 0.06); bx(loo, 0.4, 0.42, 0.18, TW, 0, 0.42, -0.25); bx(loo, 0.06, 0.03, 0.03, CH, 0.12, 0.76, -0.15);
      const sink = new T.Group(); sink.position.set(-1.6, 0, 0.1); sink.rotation.y = Math.PI / 2; bath.add(sink); bx(sink, 0.12, 0.8, 0.12, TW, 0, 0, -0.1); bx(sink, 0.56, 0.12, 0.42, TW, 0, 0.8, -0.05); bx(sink, 0.04, 0.12, 0.04, CH, 0, 0.92, -0.2);
      const mirror = bx(bath, 0.04, 0.8, 0.6, M("#bcd8e8", { emissive: "#3a5868" }), -1.97, 1.15, 0.1); bx(bath, 0.05, 0.86, 0.66, "#e0b84a", -1.99, 1.12, 0.1);
      [[0.04, "#e8c84a"], [-0.04, "#5ac8e8"]].forEach(([dz, c]) => bx(bath, 0.02, 0.18, 0.02, c, -1.75, 0.92, 0.32 + dz)); cy(bath, 0.04, 0.035, 0.1, "#ffffff", -1.75, 0.92, 0.32, 8);
      bx(bath, 0.7, 0.03, 0.03, CH, 1.97 - 0.06, 1.25, 0.6).rotation.y = Math.PI / 2; const rTowel = bx(bath, 0.04, 0.7, 0.55, "#f2a8b8", 1.92, 0.58, 0.6); bx(bath, 0.042, 0.06, 0.56, "#ffffff", 1.92, 0.7, 0.6);
      flat(bath, 0.9, 0.55, "#5ab8b8", 0.1, 0.012, -0.5); flat(bath, 0.8, 0.45, "#7ad8d0", 0.1, 0.014, -0.5);
      bx(bath, 0.9, 0.7, 0.02, M("#e8f4ff", { emissive: "#8aa8c0" }), 1.2, 1.55, BZ + 0.03); bx(bath, 0.98, 0.06, 0.06, "#ffffff", 1.2, 1.52, BZ + 0.05);
      cy(bath, 0.08, 0.06, 0.14, "#c8784a", 1.55, 0.8, -1.65, 8); cone(bath, 0.12, 0.3, "#3a8a4a", 1.55, 0.94, -1.65, 6);
      cy(bath, 0.2, 0.25, 0.08, "#ffffff", 0, H - 0.08, 0, 12).castShadow = false; const ceilGlow = glow(1.6, "#fff8e8", 0, H - 0.12, 0, bath);
      const bLight = new T.PointLight("#fff4e0", 1.2, 8, 1.3); bLight.position.set(0, 2.3, 0.3); bath.add(bLight);
      // Door in the right wall (hinge at z 1.2), opening inward.
      const door = new T.Group(); door.position.set(WX - 0.06, 0, 1.2); bath.add(door); bx(door, 0.06, 2.05, 0.85, "#f4f2ea", 0, 0, 0.425); { const kn = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), M("#e0b84a")); kn.position.set(-0.05, 1.0, 0.75); door.add(kn); }
      function show(t, mode) { bath.visible = true; light(mode || "bath", 0, -0.5, 4, 40); ripple(t, mode === "boss" ? 0.02 : 0.01); hoseTo(); boat.position.set(0.25 + Math.sin(t * 0.7) * 0.15, 0.47 + Math.sin(t * 2.3) * 0.01, -1.15 + Math.sin(t * 0.5) * 0.06); boat.rotation.set(Math.sin(t * 2.1) * 0.08, t * 0.3, Math.sin(t * 1.7) * 0.1);
        const boss = mode === "boss"; tubEyes.visible = boss; showerEyes.visible = false; tubGlow.forEach((g, i) => { g.visible = boss; g.material.opacity = 0.3 + 0.15 * Math.sin(t * 5 + i * 2); }); tubLight.intensity = boss ? 1.3 + Math.sin(t * 7) * 0.3 : 0; ceilGlow.material.opacity = boss ? 0.25 : 0.9; bLight.intensity = boss ? 0.35 : 1.2; }
      K.onReset(() => { shower.position.set(0.55, 1.85, BZ + 0.12); shower.rotation.set(0, 0, 0); shHead.rotation.set(0, 0, 0); shampoo.rotation.set(0, 0, 0); shampoo.scale.set(1, 1, 1); handles.forEach((h) => h.rotation.set(0, 0, 0)); door.rotation.y = 0; water.position.y = 0.44; tub.position.y = 0; tub.rotation.set(0, 0, 0); });
      return { group: bath, show, tub, water, ripple, tapG, spout, handles, shower, shHead, showerEyes, hoseTo, tubEyes, tubGlow, tubLight, shampoo, boat, door, mirror, rTowel, loo, sink, ceilGlow, bLight };
    };

    // THE STAIRS: 13 steps rising toward -z from z 2.0 (y 0) to the landing at y 2.6, z -1.25; 1 m wide at x -0.5..0.5.
    // stepY(z) gives the tread height under z. Bathroom door at the landing (x 0, z -2.2) with light under it.
    K.buildStairs = function () {
      const st = group(), N = 13, R = 0.2, TR = 0.25, Z0 = 2.0, L = [];
      for (let i = 0; i < N; i++) { const z = Z0 - i * TR; L.push([0, 0, z - TR / 2, 1.0, (i + 1) * R, TR, "#f4efe4"]); L.push([0, (i + 1) * R, z - TR / 2, 0.6, 0.012, TR, "#b8323a"]); L.push([0, (i + 1) * R - 0.02, z - 0.01, 0.62, 0.02, 0.02, "#e0b84a"]); }
      L.push([0, 0, Z0 - N * TR - 0.6, 3, N * R, 1.2, "#f4efe4"]); L.push([0, N * R, Z0 - N * TR - 0.6, 3, 0.01, 1.2, "#b8323a"]);
      blocks(st, L);
      flat(st, 8, 10, "#8a5a3a", 0, 0, 2); const wallM = "#e8d8bc";
      bx(st, 0.1, 6, 6, wallM, -0.56, 0, 0).castShadow = false; bx(st, 3, 6, 0.1, wallM, 0, 0, -2.25).castShadow = false; bx(st, 0.1, 6, 6, "#d8c8a8", 2.8, 0, -0.5).castShadow = false;
      // Picture frames up the wall (a Marsh portrait among them), banister and spindles.
      const FR = []; [[0.9, 1.6, "#5a8ac8"], [-0.4, 2.3, "#e8a83a"], [-1.6, 3.1, "#c84a5a"]].forEach(([z, y, c], i) => { bx(st, 0.03, 0.5, 0.42, "#3a2a1a", -0.5, y, z); FR.push(bx(st, 0.035, 0.4, 0.32, c, -0.5, y + 0.05, z)); if (i === 1) { bx(st, 0.04, 0.16, 0.2, "#c98a4a", -0.49, y + 0.12, z); bx(st, 0.041, 0.06, 0.06, "#f6d24a", -0.49, y + 0.28, z); } });
      for (let i = 0; i < N; i += 1) { const z = Z0 - i * TR - TR / 2; bx(st, 0.035, 0.85, 0.035, "#ffffff", 0.47, (i + 1) * R, z); }
      const rail = bx(st, 0.07, 0.06, Math.hypot(N * TR, N * R) + 0.2, "#6a4028", 0.47, 0, 0); rail.position.set(0.47, 0.85 + N * R / 2 + 0.1, Z0 - N * TR / 2); rail.rotation.x = Math.atan2(N * R, N * TR);
      bx(st, 0.12, 1.1, 0.12, "#6a4028", 0.47, 0, Z0 + 0.05);
      // Bathroom door at the top, light spilling under it, and a hall light.
      bx(st, 1.0, 2.05, 0.06, "#f4f2ea", 0, N * R, -2.18); bx(st, 1.12, 2.15, 0.04, "#ffffff", 0, N * R, -2.2); const doorGlow = glow(1.4, "#bfe8ff", 0, N * R + 0.05, -2.1, st); const keyhole = bx(st, 0.03, 0.06, 0.01, "#1a1a1a", 0.35, N * R + 1.0, -2.14);
      const hall = new T.PointLight("#ffd8a0", 1.4, 9, 1.4); hall.position.set(0, 4.4, 0.5); st.add(hall); glow(1.0, "#ffe0a8", 0, 5.0, 0.5, st);
      const stepY = (z) => { const i = Math.floor((Z0 - z) / TR); return i < 0 ? 0 : Math.min(N, i + 1) * R; };
      function show(t, mode) { st.visible = true; light(mode || "cosy", 0, 0, 5, 40); doorGlow.material.opacity = 0.6 + 0.25 * Math.sin(t * 3); }
      return { group: st, show, stepY, N, R, TR, Z0, FR, doorGlow, keyhole };
    };

    // LAUNDRY BASKET: wicker slats with a heap of clothes. laundryBasket(parent, x, z) → group (clothes in .heap).
    K.laundryBasket = function (parent, x, z) {
      const g = new T.Group(); g.position.set(x || 0, 0, z || 0); (parent || scene).add(g); const W = "#c8a46a", W2 = "#a8844a";
      bx(g, 0.62, 0.04, 0.44, W2, 0, 0, 0); for (let i = 0; i < 6; i++) { const y = 0.04 + i * 0.075; bx(g, 0.62, 0.05, 0.03, i % 2 ? W : W2, 0, y, 0.21); bx(g, 0.62, 0.05, 0.03, i % 2 ? W2 : W, 0, y, -0.21); bx(g, 0.03, 0.05, 0.44, i % 2 ? W : W2, 0.3, y, 0); bx(g, 0.03, 0.05, 0.44, i % 2 ? W2 : W, -0.3, y, 0); }
      bx(g, 0.66, 0.04, 0.48, "#8a6a3a", 0, 0.48, 0); const heap = new T.Group(); g.add(heap); const hr = rng(71);
      for (let i = 0; i < 12; i++) { const c = ["#3a5aa8", "#f4f2ea", "#e84a5a", "#3a8a5a", "#f2c83a", "#6a6a7a"][i % 6], m = bx(heap, 0.16 + hr() * 0.14, 0.05 + hr() * 0.04, 0.12 + hr() * 0.12, c, (hr() - 0.5) * 0.44, 0.38 + hr() * 0.16, (hr() - 0.5) * 0.3); m.rotation.y = hr() * 3; m.rotation.z = (hr() - 0.5) * 0.4; }
      const sleeve = bx(heap, 0.1, 0.32, 0.08, "#3a5aa8", 0.31, 0.24, 0.1); sleeve.rotation.z = 0.25; g.heap = heap; return g;
    };

    // THE GARDEN: lawn, fences, the back of the house with its door open at (0, 0, 3), a muddy flowerbed centred (0, 0, -3) and a shed.
    K.buildGarden = function () {
      const gd = group(); flat(gd, 60, 60, "#6aa84a", 0, 0, 0); const gr = rng(91), G2 = [];
      for (let i = 0; i < 340; i++) { const x = (gr() - 0.5) * 12, z = (gr() - 0.5) * 12; if (Math.abs(x) < 1.6 && z < -1.8 && z > -4.2) continue; G2.push([x, 0, z, 0.03, 0.05 + gr() * 0.07, 0.03, gr() > 0.5 ? "#5a9a3a" : "#7ab84a"]); }
      for (let x = -6; x <= 6; x += 0.3) { G2.push([x, 0, -6, 0.28, 1.6, 0.04, Math.round(x / 0.3) % 2 ? "#a8784a" : "#9a6a3a"]); } [-6, 6].forEach((s) => { for (let z = -6; z <= 3; z += 0.3) G2.push([s, 0, z, 0.04, 1.6, 0.28, Math.round(z / 0.3) % 2 ? "#a8784a" : "#9a6a3a"]); });
      blocks(gd, G2);
      // House back wall with open door, warm light inside, step.
      bx(gd, 14, 5, 0.3, "#a0583f", 0, 0, 3.2).castShadow = false; bx(gd, 1.1, 2.1, 0.32, "#ffd8a0", 0, 0, 3.19); bx(gd, 1.2, 0.12, 0.6, "#c8c4b8", 0, 0, 2.8); const dGlow = glow(2.2, "#ffd890", 0, 1.0, 2.95, gd);
      const backDoor = new T.Group(); backDoor.position.set(-0.55, 0, 3.02); gd.add(backDoor); bx(backDoor, 1.05, 2.05, 0.06, "#2f5f3a", 0.52, 0, 0); backDoor.rotation.y = 1.3;
      [[-2.5, 1.2], [2.5, 1.2]].forEach(([x, y]) => { bx(gd, 1.2, 1.1, 0.33, "#ffd890", x, y, 3.19); bx(gd, 1.3, 0.08, 0.4, "#ffffff", x, y - 0.06, 3.1); });
      // Flowerbed: brick edge, glossy mud, flowers.
      const bed = new T.Group(); bed.position.set(0, 0, -3); gd.add(bed); [[0, 1.12, 3.2, 0.24], [0, -1.12, 3.2, 0.24]].forEach(([x, z, w, d]) => bx(bed, w, 0.14, d, "#a85a3a", x, 0, z)); [-1.6, 1.6].forEach((x) => bx(bed, 0.24, 0.14, 2.48, "#a85a3a", x, 0, 0));
      const mud = new T.Mesh(new T.PlaneGeometry(3.0, 2.0, 14, 10), new T.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.35, metalness: 0.05, flatShading: true })); mud.rotation.x = -Math.PI / 2; mud.position.y = 0.09; bed.add(mud); { const p = mud.geometry.attributes.position, mr = rng(3); for (let i = 0; i < p.count; i++) p.setZ(i, mr() * 0.04); mud.geometry.computeVertexNormals(); mud.receiveShadow = true; }
      const FLOW = []; const fr = rng(95); for (let i = 0; i < 22; i++) { const f = new T.Group(); const x = (fr() - 0.5) * 2.8, z = fr() > 0.5 ? -0.75 - fr() * 0.2 : (fr() - 0.5) * 1.6; f.position.set(x, 0.09, z); bed.add(f); bx(f, 0.02, 0.3 + fr() * 0.15, 0.02, "#3a7a3a", 0, 0, 0); const c = ["#ff5a8a", "#ffd23a", "#c85aff", "#ff8a3a", "#ffffff"][i % 5]; const hd = bx(f, 0.1, 0.06, 0.1, c, 0, 0.3, 0); hd.position.y = f.children[0].scale.y * 0 + 0.33; bx(f, 0.04, 0.03, 0.04, "#ffe08a", 0, 0.38, 0); FLOW.push(f); }
      const shed = new T.Group(); shed.position.set(4.2, 0, -4.4); gd.add(shed); bx(shed, 2, 2.0, 1.6, "#6a8a6a", 0, 0, 0); bx(shed, 2.2, 0.12, 1.8, "#3a3a3a", 0, 2.0, 0); bx(shed, 0.6, 1.6, 0.04, "#4a6a4a", 0, 0, 0.82);
      const trees = []; [[-4.5, -4.8], [-5.2, 0.5]].forEach(([x, z], i) => { const tr = new T.Group(); tr.position.set(x, 0, z); gd.add(tr); cy(tr, 0.12, 0.16, 1.8, "#5a4030", 0, 0, 0, 6); const top = sh(new T.Mesh(LP.lumpy(1.2, 600 + i, 1), M("#4f8a4a"))); top.position.y = 2.5; tr.add(top); trees.push(tr); });
      function show(t, mode) { gd.visible = true; light(mode || "evening", 0, -1, 7, 60); FLOW.forEach((f, i) => (f.rotation.z = Math.sin(t * 1.6 + i) * 0.08)); trees.forEach((tr, i) => (tr.rotation.z = Math.sin(t * 0.8 + i) * 0.02)); }
      return { group: gd, show, bed, mud, FLOW, backDoor, dGlow, shed };
    };

    K.onReset(() => { spCur = 0; spMesh.count = SPN; for (let i = 0; i < SPN; i++) spMesh.setMatrixAt(i, ZERO); spMesh.instanceMatrix.needsUpdate = true; spMesh.instanceColor.needsUpdate = true; spMesh.visible = false;
      bbCur = 0; for (let i = 0; i < BBN; i++) bbMesh.setMatrixAt(i, ZERO); bbMesh.instanceMatrix.needsUpdate = true; bbMesh.visible = false;
      STEAM.forEach((s) => (s.visible = false)); K.LENS = 0; marsh.scale.setScalar(MARSH_S); MARSH_MATS.forEach((m) => m.color.copy(m.userData.dry)); towel.position.set(0, 0, 0); towel.rotation.set(0, 0, 0); });
    const ZERO = new T.Matrix4().makeScale(0, 0, 0);

    return K;
  }
  window.LPM = { setup };
})();
