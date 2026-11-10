/* lowpoly-sanctuary.js: the dog sanctuary kit for the Marsh "Day N" series.
   Load after lowpoly-marsh.js, then LPS.install(K) after LPM.setup.
   K.buildSanctuary(opts): grounds, lane, gate with sign, 200 kennels. opts.open: open-top kennels (low walls, a bed inside, no roof) so dogs inside show.
     opts.town: clears the trees east of the fence and opens the fence for the town street (see lowpoly-town.js). Both default off, so old videos are unchanged. .wave(r) lights kennels out to radius r from the gate, .colour(k) grey 0..1 full colour.
   K.breed(name): a posable hero dog. Names in K.BREED_NAMES. Same pose() as LP9.dog.
   K.dogCrowd(n, kennels): instanced dogs of mixed breeds. .update(t, t0, t1) runs them through the gate into the kennels between t0 and t1. */
(function () {
  function install(K) {
    const { T, M, flat, blocks, group, canvasBoard, D, COL, rng, sized } = K;
    const box = (g, w, h, d, c, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

    /* ---- Breeds: colours and proportions (w width, h height, z length, s overall height in metres) ---- */
    const TABLE = {
      golden: { coat: "#d9a24a", dark: "#b07a30", belly: "#ecc27a", w: 1, h: 1, z: 1, s: 0.62 },
      lab: { coat: "#2c2826", dark: "#1a1716", belly: "#3c3633", w: 1, h: 1, z: 1, s: 0.6 },
      chocolate: { coat: "#5e3a22", dark: "#402614", belly: "#744a2e", w: 1, h: 1, z: 1, s: 0.6 },
      dalmatian: { coat: "#f2efe8", dark: "#22201e", belly: "#ffffff", w: 0.95, h: 1.05, z: 1, s: 0.66 },
      dachshund: { coat: "#7a3f1e", dark: "#4e2710", belly: "#a0602e", w: 0.9, h: 0.55, z: 1.75, s: 0.34 },
      corgi: { coat: "#e09238", dark: "#b86c24", belly: "#fff4e4", w: 1.15, h: 0.62, z: 1.1, s: 0.4 },
      husky: { coat: "#7e8894", dark: "#4c545e", belly: "#f4f4f4", w: 1.05, h: 1.05, z: 1, s: 0.66 },
      pug: { coat: "#d8bd92", dark: "#2a2420", belly: "#e8d2ae", w: 1.25, h: 0.72, z: 0.75, s: 0.36 },
      poodle: { coat: "#fbf6f0", dark: "#e4dcd2", belly: "#ffffff", w: 0.9, h: 1.15, z: 0.9, s: 0.6 },
      shepherd: { coat: "#b57a3a", dark: "#2a211a", belly: "#d29a5a", w: 1.05, h: 1.05, z: 1.05, s: 0.7 },
      beagle: { coat: "#fbf3e4", dark: "#6e4220", belly: "#ffffff", w: 1, h: 0.82, z: 0.95, s: 0.44 },
      chihuahua: { coat: "#d9b078", dark: "#a67a48", belly: "#f0d6ae", w: 0.8, h: 0.8, z: 0.7, s: 0.24 },
    };
    const NAMES = Object.keys(TABLE);
    function breed(name) {
      const b = TABLE[name], root = group();
      const d = sized(LP9.dog({ coat: b.coat, dark: b.dark, belly: b.belly, collar: "#c5242b" }), b.s);
      const s = d.scale.x; d.scale.set(s * b.w, s * b.h, s * b.z); root.add(d);
      const body = d.children[0].children[0], head = d.head, drop = head.children.filter((c) => c.side !== undefined);
      const upright = () => { drop.forEach((e) => (e.visible = false)); [-1, 1].forEach((x) => { box(head, 0.09, 0.2, 0.08, b.dark, x * 0.12, 0.24, -0.02); box(head, 0.05, 0.08, 0.05, b.coat, x * 0.12, 0.34, -0.02); }); };
      if (name === "dalmatian") { [[-0.1, 0.2, 0.1], [0.14, 0.19, 0.3], [-0.05, 0.18, 0.5], [0.08, 0.1, 0.0], [-0.18, 0.06, 0.32], [0.18, 0.02, 0.5]].forEach((p) => box(body, 0.1, 0.05, 0.1, "#22201e", p[0], p[1], p[2])); box(head, 0.09, 0.03, 0.09, "#22201e", 0.08, 0.16, 0.03); box(head, 0.06, 0.03, 0.06, "#22201e", -0.08, 0.16, -0.06); }
      if (name === "husky") { upright(); box(head, 0.3, 0.1, 0.02, "#f4f4f4", 0, -0.02, 0.15); box(head, 0.07, 0.12, 0.02, "#f4f4f4", 0, 0.1, 0.155); }
      if (name === "shepherd") { upright(); box(body, 0.3, 0.05, 0.6, "#2a211a", 0, 0.24, 0.26); }
      if (name === "corgi") { upright(); box(head, 0.1, 0.2, 0.02, "#fff4e4", 0, 0.05, 0.155); }
      if (name === "chihuahua") upright();
      if (name === "pug") { box(head, 0.23, 0.17, 0.08, "#2a2420", 0, -0.07, 0.3); box(head, 0.36, 0.03, 0.02, "#b89a72", 0, 0.08, 0.152); }
      if (name === "poodle") { box(head, 0.4, 0.2, 0.36, "#fffaf4", 0, 0.2, -0.02); drop.forEach((e) => e.scale.set(2, 1, 1.3)); box(body, 0.44, 0.42, 0.34, "#fffaf4", 0, 0.1, 0.56); box(body, 0.18, 0.18, 0.18, "#fffaf4", 0, 0.34, -0.3); }
      if (name === "beagle") { box(head, 0.1, 0.28, 0.02, "#fbf3e4", 0, 0.03, 0.155); box(body, 0.3, 0.05, 0.5, "#2a211a", 0, 0.24, 0.2); box(head, 0.36, 0.12, 0.3, "#8a5428", 0, 0.1, -0.01); }
      root.dog = d; root.head = head; root.neck = head.parent;
      // The dog's own collar (first child of the neck): goldCollar(k) turns it gold, k 0..1.
      const cm = root.neck.children[0], tagM = root.neck.children[1]; cm.material = new T.MeshLambertMaterial({ color: "#c5242b" });
      root.collar = cm; root.goldCollar = (k) => { cm.material.color.set(k ? "#ffc21a" : "#c5242b"); cm.material.emissive.set(k ? "#8a5a00" : "#000000"); cm.scale.set(k ? 1.08 : 1, k ? 1.5 : 1, k ? 1.08 : 1); tagM.scale.setScalar(k ? 1.8 : 1); };
      root.put = (x, y, z, ry, p) => { root.visible = true; root.position.set(x, y, z); root.rotation.set(0, ry || 0, 0); d.pose(Object.assign({ wag: 0, mouth: 0.2 }, p)); };
      return root;
    }

    /* ---- The grounds ---- */
    function buildSanctuary(opts) {
      const O = opts || {}, g = group(), r = rng(907);
      const grass = flat(g, 520, 520, "#78c05c", 0, 0, -30);
      const far = flat(g, 9000, 9000, "#78c05c", 0, -0.08, -30); far.receiveShadow = false; // Far ground to the horizon (below the grass, so no flicker). grass.material = new T.MeshLambertMaterial({ color: "#78c05c" });
      const lane = flat(g, 4.4, 140, "#ecdfbc", 0, 0.012, -36); lane.material = new T.MeshLambertMaterial({ color: "#ecdfbc" });
      const out = flat(g, 4.4, 60, "#ecdfbc", 0, 0.012, 52); out.material = new T.MeshLambertMaterial({ color: "#ecdfbc" });
      const GRASS_ON = new T.Color("#78c05c"), GRASS_OFF = new T.Color("#7f8a78"), LANE_ON = new T.Color("#ecdfbc"), LANE_OFF = new T.Color("#a8a59c");
      const kennels = [], bodies = [], doors = [], roofs = [], ridge = [], lamps = [];
      const ROOF = ["#e2483a", "#2f8fe0", "#f0b52e", "#27b39a", "#ee6f9b", "#7a58d8"];
      for (let j = 0; j < 20; j++) for (let i = 0; i < 5; i++) [-1, 1].forEach((sd) => {
        const x = sd * (4.6 + i * 3.5), z = 15 - j * 4.4;
        kennels.push({ x, z, d: Math.hypot(x, z - 22), roof: ROOF[(i * 2 + j + (sd > 0 ? 3 : 0)) % ROOF.length] });
        if (!O.open) { bodies.push([x, 0, z, 1.9, 1.15, 1.9, "#f4ead6"]); doors.push([x, 0, z + 0.96, 0.82, 0.86, 0.03, "#2a2230"]); }
      });
      kennels.forEach((k) => { roofs.push([k.x, 1.15, k.z, 2.4, 0.4, 2.4, k.roof]); ridge.push([k.x, 1.55, k.z, 1.5, 0.3, 2.4, k.roof]); lamps.push([k.x, 0.94, k.z + 1.0, 0.34, 0.14, 0.06, "#ffffff"]); });
      if (O.open) kennels.forEach((k) => { const { x, z } = k, H = 0.62, c = "#f4ead6";
        bodies.push([x, 0, z, 1.9, 0.06, 1.9, "#c9a46a"], [x, 0.06, z - 0.15, 1.3, 0.12, 1.1, k.roof], [x, 0, z - 0.89, 1.9, H, 0.12, c], [x - 0.89, 0, z, 0.12, H, 1.9, c], [x + 0.89, 0, z, 0.12, H, 1.9, c], [x - 0.62, 0, z + 0.89, 0.66, H, 0.12, c], [x + 0.62, 0, z + 0.89, 0.66, H, 0.12, c]);
        bodies.push([x, H, z - 0.89, 2.0, 0.1, 0.18, k.roof], [x - 0.89, H, z, 0.18, 0.1, 2.0, k.roof], [x + 0.89, H, z, 0.18, 0.1, 2.0, k.roof], [x - 0.62, H, z + 0.89, 0.7, 0.1, 0.18, k.roof], [x + 0.62, H, z + 0.89, 0.7, 0.1, 0.18, k.roof]); });
      blocks(g, bodies); if (doors.length) blocks(g, doors, false);
      const roofM = blocks(g, roofs), ridgeM = blocks(g, ridge), lampM = blocks(g, lamps, false);
      if (O.open) [roofM, ridgeM, lampM].forEach((m) => (m.visible = false));
      lampM.material = new T.MeshBasicMaterial({ color: "#ffffff" });
      [roofM, ridgeM, lampM].forEach((m) => (m.frustumCulled = false));
      // Trees and fence.
      const tr = [];
      for (let n = 0; n < 340; n++) { const sd = n % 2 ? 1 : -1, x = sd * (24 + r() * 90), z = -110 + r() * 190; if (sd > 0 && (O.town ? z > -52 && z < 30 && x < 100 : z > -22 && z < 24 && x < 74)) continue; const s = 1 + r() * 1.5; tr.push([x, 0, z, 0.6 * s, 1.8 * s, 0.6 * s, "#7a5230"]); tr.push([x, 1.5 * s, z, 2.8 * s, 2 * s, 2.8 * s, ["#3f9a4a", "#2f8a44", "#58ab4a"][n % 3]]); tr.push([x, 3.3 * s, z, 1.7 * s, 1.3 * s, 1.7 * s, ["#58ab4a", "#3f9a4a", "#2f8a44"][n % 3]]); }
      for (let n = 0; n < 36; n++) { const z = 22 - n * 3.6; [-23, 23].forEach((x) => { if (O.town && x > 0 && n < 2) return; tr.push([x, 0, z, 0.22, 1.2, 0.22, "#8a5a32"]); tr.push([x, 0.8, z - 1.8, 0.1, 0.16, 3.6, "#a06c3c"]); }); }
      for (let n = 0; n < 7; n++) [-1, 1].forEach((sd) => { const x = sd * (3.2 + n * 3.3); tr.push([x, 0, 22, 0.22, 1.2, 0.22, "#8a5a32"]); tr.push([x + sd * 1.65, 0.8, 22, 3.3, 0.16, 0.1, "#a06c3c"]); });
      blocks(g, tr);
      // Detail: flowers, lamp posts, bunting, bowls and bones, bushes, balloons and clouds.
      const dec = [], glowy = [], FL = ["#ff5a7a", "#ffd23a", "#ffffff", "#b07aff", "#ff8a3a", "#5ac8ff"];
      const flower = (x, z, n) => { dec.push([x, 0, z, 0.22, 0.05, 0.22, "#4f9a3c"]); dec.push([x, 0.06, z, 0.13, 0.13, 0.13, FL[n % FL.length]]); };
      for (let n = 0; n < 700; n++) { const sd = n % 2 ? 1 : -1, band = n % 3; let x, z = 21 - r() * 108; if (band === 0) x = sd * (2.5 + r() * 0.6); else if (band === 1) x = sd * (20.2 + r() * 2.2); else { const k = kennels[Math.floor(r() * kennels.length)]; x = k.x + (r() - 0.5) * 2.4; z = k.z - 1.5 - r() * 0.6; } if (!(O.town && x > 19 && z > 16)) flower(x, z, n); }
      for (let z = 19; z > -90; z -= 7.5) [-1, 1].forEach((sd) => { dec.push([sd * 2.75, 0, z, 0.14, 2.7, 0.14, "#3a3a44"]); dec.push([sd * 2.55, 2.6, z, 0.5, 0.08, 0.1, "#3a3a44"]); glowy.push([sd * 2.35, 2.42, z, 0.36, 0.2, 0.3, "#ffe4a0"]); });
      const BUNT = ["#ff4a5a", "#ffd23a", "#3aa8ff", "#5ad86a", "#ff8ad8"];
      [14, 1, -12, -25, -38, -51].forEach((z, bi) => { for (let f = 0; f < 11; f++) { const x = -2.6 + f * 0.52, y = 3.0 - 0.45 * (1 - Math.pow(x / 2.7, 2)); dec.push([x, y - 0.32, z, 0.3, 0.3, 0.03, BUNT[(f + bi) % BUNT.length]]); dec.push([x, y, z, 0.54, 0.03, 0.03, "#f4ead6"]); } });
      kennels.forEach((k, i) => { dec.push([k.x - 0.62, 0, k.z + 1.35, 0.34, 0.1, 0.34, ["#e2483a", "#2f8fe0", "#27b39a", "#f0b52e"][i % 4]]); dec.push([k.x + 0.6, 0, k.z + 1.4, 0.36, 0.07, 0.1, "#fff8ea"]); dec.push([k.x + 0.6, 0, k.z + 1.4, 0.1, 0.08, 0.16, "#fff8ea"]); dec.push([k.x - 0.62, 0.1, k.z + 1.35, 0.26, 0.04, 0.26, "#a8703a"]); });
      for (let z = 21; z > -105; z -= 1.9) [-1, 1].forEach((sd) => { const s = 0.7 + r() * 0.6; if (!(O.town && sd > 0 && z > 14)) dec.push([sd * 23.8, 0, z, s * 1.1, s, s * 1.3, ["#3f9a4a", "#58ab4a"][Math.floor(r() * 2)]]); });
      [-3.1, 3.1].forEach((x, si) => { for (let b = 0; b < 6; b++) { const bx2 = x + (b % 3 - 1) * 0.42, by = 7.3 + Math.floor(b / 3) * 0.55 + (b % 2) * 0.2; dec.push([bx2, by, 22 + (b % 2 ? 0.25 : -0.2), 0.48, 0.58, 0.48, ["#ff4a5a", "#ffd23a", "#3aa8ff", "#5ad86a", "#ff8ad8", "#ffffff"][(b + si) % 6]]); dec.push([bx2 * 0.98 + x * 0.02, 6.6, 22, 0.02, by - 6.6, 0.02, "#ffffff"]); } });
      blocks(g, dec);
      const lampHeads = blocks(g, glowy, false); lampHeads.material = new T.MeshBasicMaterial({ color: "#ffffff" });
      const cl = []; for (let n = 0; n < 22; n++) { const cx = -120 + r() * 240, cz = -170 + r() * 170, cyy = 26 + r() * 22, s = 3 + r() * 4; for (let p = 0; p < 5; p++) cl.push([cx + (p - 2) * s * 0.8, cyy + (p % 2) * s * 0.35, cz + (r() - 0.5) * s, s * (1.2 + r() * 0.6), s * (0.6 + (p % 3) * 0.25), s * 1.2, "#ffffff"]); }
      const clouds = blocks(g, cl, false); clouds.material = new T.MeshBasicMaterial({ color: "#ffffff", fog: false });
      // Gate.
      [-3.1, 3.1].forEach((x) => { box(g, 1.2, 6.2, 1.2, "#f4ead6", x, 3.1, 22); box(g, 1.5, 0.4, 1.5, "#d4483a", x, 6.4, 22); });
      box(g, 7.4, 1.9, 0.4, "#7a4a28", 0, 5.1, 22);
      const sign = canvasBoard(7, 1.7, 1120, 272); sign.position.set(0, 5.1, 22.23); g.add(sign);
      { const c = sign.cx; c.fillStyle = "#2f7a4a"; c.fillRect(0, 0, 1120, 272); c.fillStyle = "#fff8e6"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = '900 84px "Helvetica Neue", Arial, sans-serif'; c.fillText("MARSH'S", 560, 88); c.fillText("DOG SANCTUARY", 560, 186); sign.tex.needsUpdate = true; }
      const doorL = new T.Group(), doorR = new T.Group(); doorL.position.set(-2.5, 0, 22); doorR.position.set(2.5, 0, 22); g.add(doorL, doorR);
      box(doorL, 2.5, 2.1, 0.14, "#9a6636", 1.25, 1.1, 0); box(doorR, 2.5, 2.1, 0.14, "#9a6636", -1.25, 1.1, 0);
      // SOLD board, slammed over the sign.
      const sold = canvasBoard(4.4, 1.7, 704, 272, { transparent: true }); sold.position.set(0, 5.1, 22.4); sold.visible = false; g.add(sold);
      { const c = sold.cx; c.strokeStyle = "#e0242e"; c.lineWidth = 24; c.strokeRect(16, 16, 672, 240); c.fillStyle = "#fff"; c.fillRect(28, 28, 648, 216); c.fillStyle = "#e0242e"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = '900 176px "Helvetica Neue", Arial, sans-serif'; c.fillText("SOLD", 352, 146); sold.tex.needsUpdate = true; }

      let last = null;
      function wave(radius, amp) {
        if (last === radius) return; last = radius;
        kennels.forEach((k, i) => {
          const on = radius >= k.d, past = radius - k.d, bump = on && amp ? Math.exp(-past * 0.09) * Math.sin(Math.min(Math.PI, past * 0.25)) * 1.2 : 0;
          D.rotation.set(0, 0, 0);
          D.position.set(k.x, 1.15 + bump, k.z); D.scale.set(2.4, 0.4, 2.4); D.updateMatrix(); roofM.setMatrixAt(i, D.matrix);
          D.position.set(k.x, 1.55 + bump, k.z); D.scale.set(1.5, 0.3, 2.4); D.updateMatrix(); ridgeM.setMatrixAt(i, D.matrix);
          roofM.setColorAt(i, COL.set(on ? k.roof : "#83838a")); ridgeM.setColorAt(i, COL.set(on ? k.roof : "#83838a")); lampM.setColorAt(i, COL.set(on ? "#ffe07a" : "#55555e"));
        });
        [roofM, ridgeM].forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }); lampM.instanceColor.needsUpdate = true;
      }
      function colour(k) { grass.material.color.copy(GRASS_OFF).lerp(GRASS_ON, k); far.material = grass.material; lane.material.color.copy(LANE_OFF).lerp(LANE_ON, k); out.material.color.copy(k > 0.5 ? LANE_ON : LANE_OFF); }
      wave(1e6);
      return { group: g, kennels, wave, colour, doorL, doorR, sold, sign };
    }

    /* ---- Crowd: instanced mixed-breed dogs ---- */
    const PARTS = [[0, 0.46, 0, 0.34, 0.32, 0.82, 0], [0, 0.74, 0.46, 0.34, 0.32, 0.32, 0], [0, 0.66, 0.67, 0.2, 0.13, 0.16, 2], [-0.2, 0.74, 0.44, 0.06, 0.26, 0.15, 1], [0.2, 0.74, 0.44, 0.06, 0.26, 0.15, 1], [-0.12, 0.2, 0.3, 0.1, 0.4, 0.11, 0], [0.12, 0.2, 0.3, 0.1, 0.4, 0.11, 0], [-0.12, 0.2, -0.3, 0.1, 0.4, 0.11, 0], [0.12, 0.2, -0.3, 0.1, 0.4, 0.11, 0], [0, 0.68, -0.46, 0.08, 0.26, 0.08, 1], [0, 0.7, 0.76, 0.08, 0.06, 0.03, 3]];
    function dogCrowd(n, kennels) {
      const g = group(), P = PARTS.length, r = rng(421);
      const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff" }), n * P); mesh.frustumCulled = false; mesh.castShadow = true; g.add(mesh);
      const dogs = [];
      for (let i = 0; i < n; i++) {
        const b = TABLE[NAMES[i % NAMES.length]], k = kennels[i], order = r();
        const dest = k ? { x: k.x + (r() - 0.5) * 0.5, z: k.z + 1.7 + r() * 0.4 } : { x: (r() < 0.5 ? -1 : 1) * (1 + r() * 18), z: 19 - r() * 88 };
        dogs.push({ b, order, dest, jit: (r() - 0.5) * 3.4, dur: 0.6 + r() * 0.5, ph: r() * 6.28, big: 1.5 * (0.55 + b.s * 0.8) });
        PARTS.forEach((p, j) => mesh.setColorAt(i * P + j, COL.set([b.coat, b.dark, b.belly, "#14100e"][p[6]])));
      }
      mesh.instanceColor.needsUpdate = true;
      const off = new T.Matrix4().makeScale(0, 0, 0);
      // clear: optional list of [x, z, radius] spots kept free of dogs (for hero close-ups).
      function update(t, t0, t1, clear) {
        dogs.forEach((d, i) => {
          const a = t0 + (t1 - t0 - d.dur) * Math.pow(d.order, 0.85), u = (t - a) / d.dur;
          const blocked = clear && u >= 1 && clear.some(([cx, cz, cr]) => Math.hypot(d.dest.x - cx, d.dest.z - cz) < cr);
          if (u < 0 || blocked) { for (let j = 0; j < P; j++) mesh.setMatrixAt(i * P + j, off); return; }
          const sx = d.jit, sz = 36, cz = d.dest.z, L1 = Math.abs(sz - cz), L2 = Math.abs(d.dest.x - sx), s = Math.min(1, u) * (L1 + L2);
          let x, z, yaw, run = u < 1 ? 1 : 0;
          if (s < L1) { x = sx; z = sz - s; yaw = Math.PI; } else { x = sx + Math.sign(d.dest.x - sx) * (s - L1); z = cz; yaw = Math.sign(d.dest.x - sx) * Math.PI / 2; }
          if (!run) yaw = 0;
          const sw = Math.sin(t * 26 + d.ph), hop = run ? Math.abs(sw) * 0.3 : Math.max(0, Math.sin(t * 7 + d.ph)) * 0.09, cs = Math.cos(yaw), sn = Math.sin(yaw), S = d.big;
          PARTS.forEach((p, j) => {
            const lx = p[0] * d.b.w * S, lz = p[2] * d.b.z * S, isLeg = j >= 5 && j <= 8, sq = isLeg ? 1 - (run ? Math.abs(sw) * 0.35 : 0) : 1;
            D.position.set(x + lx * cs + lz * sn, (p[1] * d.b.h * S) + hop, z - lx * sn + lz * cs); D.rotation.set(0, yaw + (j === 9 && !run ? Math.sin(t * 20 + d.ph) * 0.5 : 0), 0);
            D.scale.set(p[3] * d.b.w * S, p[4] * d.b.h * S * sq, p[5] * d.b.z * S); D.updateMatrix(); mesh.setMatrixAt(i * P + j, D.matrix);
          });
        });
        mesh.instanceMatrix.needsUpdate = true; g.visible = true;
      }
      update(0, 1e6, 1e6 + 1);
      return { group: g, update };
    }
    /* ---- Life: butterflies and birds. life(t, cx, cz, radius, birds) after place() each frame. ---- */
    const lifeG = group(), BF = [], BIRDS = [];
    { const r = rng(77); for (let i = 0; i < 26; i++) { const b = new T.Group(), c = ["#ffd23a", "#ff8ad8", "#5ac8ff", "#ffffff", "#ff8a3a"][i % 5];
        [-1, 1].forEach((s) => { const w = new T.Mesh(new T.PlaneGeometry(0.09, 0.07), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); w.position.x = s * 0.045; const p = new T.Group(); p.add(w); b.add(p); }); b.seed = [r(), r(), r(), r()]; lifeG.add(b); BF.push(b); }
      for (let i = 0; i < 9; i++) { const b = new T.Group(); [-1, 1].forEach((s) => { const p = new T.Group(); const w = new T.Mesh(new T.BoxGeometry(0.7, 0.05, 0.25), M("#3a3a48")); w.position.x = s * 0.35; p.add(w); b.add(p); }); b.add(new T.Mesh(new T.BoxGeometry(0.18, 0.14, 0.5), M("#3a3a48"))); b.seed = [r(), r(), r()]; lifeG.add(b); BIRDS.push(b); } }
    function life(t, cx, cz, rad, birds, cy0) {
      lifeG.visible = true; const y0 = cy0 || 0;
      BF.forEach((b, i) => { const [a, c, e, f] = b.seed, ang = a * 6.28 + t * (0.4 + c * 0.5) * (i % 2 ? 1 : -1); b.visible = true;
        b.position.set(cx + Math.cos(ang) * rad * (0.3 + e * 0.7), y0 + 0.35 + f * 1.2 + Math.sin(t * 3 + i) * 0.15, cz + Math.sin(ang) * rad * (0.3 + e * 0.7)); b.rotation.y = -ang;
        const fl = Math.sin(t * 28 + i) * 1.1; b.children[0].rotation.y = fl; b.children[1].rotation.y = -fl; b.scale.setScalar(Math.max(1, rad / 6)); });
      BIRDS.forEach((b, i) => { const [a, c, e] = b.seed; b.visible = !!birds; const x = -70 + ((t * (7 + c * 4) + a * 140) % 140); b.position.set(cx + x, 16 + e * 10 + Math.sin(t * 2 + i) * 0.5, cz - 30 - c * 40); b.rotation.y = Math.PI / 2; const fl = Math.sin(t * 9 + i) * 0.6; b.children[0].rotation.z = fl; b.children[1].rotation.z = -fl; });
    }

    /* ---- Confetti bursts: burst(t, [[t0, x, y, z, spread], ...]) ---- */
    const CN = 420, conf = new T.InstancedMesh(new T.PlaneGeometry(0.09, 0.06), new T.MeshLambertMaterial({ color: "#ffffff", side: T.DoubleSide, emissive: "#222222" }), CN); conf.frustumCulled = false; const confG = group(); confG.add(conf);
    const CSEED = []; { const r = rng(55); for (let i = 0; i < CN; i++) { CSEED.push([r(), r(), r(), r(), r()]); conf.setColorAt(i, COL.set(["#ff4a5a", "#ffd23a", "#3aa8ff", "#5ad86a", "#ff8ad8", "#ffffff", "#ffc21a"][i % 7])); } }
    const zero = new T.Matrix4().makeScale(0, 0, 0);
    function burst(t, list) {
      confG.visible = true; const per = Math.floor(CN / Math.max(1, list.length));
      for (let i = 0; i < CN; i++) { const L = list[Math.min(list.length - 1, Math.floor(i / per))], a = t - L[0], [u, v, w, s, q] = CSEED[i], sp = L[4] || 1;
        if (a < 0 || a > 2.6) { conf.setMatrixAt(i, zero); continue; }
        const ang = u * 6.28, up = (3 + v * 5) * sp, out = (1 + w * 3) * sp, drag = Math.min(a, 0.5) + Math.max(0, a - 0.5) * 0.3;
        D.position.set(L[1] + Math.cos(ang) * out * drag, Math.max(0.02, L[2] + up * Math.min(a, 0.6) - 4.9 * Math.pow(Math.min(a, 0.6), 2) - Math.max(0, a - 0.6) * (0.9 + q * 0.6) * sp), L[3] + Math.sin(ang) * out * drag);
        D.rotation.set(a * (6 + s * 8) + u * 6, a * (4 + q * 6), a * 5 + v * 3); D.scale.setScalar(sp * (1 - Math.max(0, a - 2.1) / 0.5)); D.updateMatrix(); conf.setMatrixAt(i, D.matrix); }
      conf.instanceMatrix.needsUpdate = true; conf.instanceColor.needsUpdate = true;
    }
    // Light beam from the sky (gold, additive). beam.visible = true, beam.position.set(x, 0, z).
    const beamG = group(), beam = new T.Mesh(new T.CylinderGeometry(0.45, 0.9, 14, 24, 1, true), new T.MeshBasicMaterial({ color: "#ffd86a", transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false })); beam.position.y = 7; beamG.add(beam);

    /* ---- Build ideas (for the vote): each returns { group, anim(t) }, placed at (ox, oz). ---- */
    function buildWaterpark(ox, oz) {
      const g = group(); g.position.set(ox, 0, oz); const L = [], r = rng(31);
      flat(g, 15, 13, "#efe6d4", 0, 0.025, 0); const pool = flat(g, 9, 6, "#3ab4ee", 0.8, 0.06, 1); pool.material = new T.MeshLambertMaterial({ color: "#3ab4ee", emissive: "#0a3a5a" });
      for (let i = 0; i < 6; i++) L.push([0.8 - 4.2 + i * 1.6, 0.061, 1, 0.9, 0.005, 5.6, "#62c8f4"]);
      [[0.8, 4.1, 9.4, 0.2], [0.8, -2.1, 9.4, 0.2]].forEach(([x, z, w, d]) => L.push([x, 0, z, w, 0.22, d, "#ffffff"])); [[-3.9, 1], [5.5, 1]].forEach(([x, z]) => L.push([x, 0, z, 0.2, 0.22, 6.4, "#ffffff"]));
      L.push([-5.6, 0, -3.5, 1.6, 4.2, 1.6, "#ffd23a"], [-5.6, 4.2, -3.5, 2.0, 0.3, 2.0, "#ff5a5a"]);
      for (let s = 0; s < 12; s++) { const a = s / 12 * Math.PI * 1.6, rr = 1.6; L.push([-5.6 + Math.cos(a) * rr * (1 - s / 16) + s * 0.42, 4.0 - s * 0.33, -3.5 + Math.sin(a) * rr * 0.8 + s * 0.22, 0.9, 0.22, 0.9, s % 2 ? "#ff5a5a" : "#3aa8ff"]); }
      L.push([6.2, 0, -4.2, 1.2, 3.0, 1.2, "#5ad86a"]); for (let s = 0; s < 8; s++) L.push([6.2 - s * 0.4, 2.8 - s * 0.34, -3.3 + s * 0.5, 0.9, 0.2, 0.9, "#ff8ad8"]);
      for (let i = 0; i < 4; i++) { const x = -5 + i * 3.4; L.push([x, 0, 5.4, 0.08, 2.0, 0.08, "#ffffff"]); L.push([x, 1.9, 5.4, 1.8, 0.25, 1.8, ["#ff4a5a", "#3aa8ff", "#ffd23a", "#5ad86a"][i]]); L.push([x + 0.6, 0, 5.0, 1.1, 0.12, 0.5, "#ffffff"]); }
      const rings = []; for (let i = 0; i < 6; i++) rings.push([0.8 - 3 + (i % 3) * 2.6, 0.07, -0.2 + Math.floor(i / 3) * 2.4, 0.9, 0.16, 0.9, ["#ff8a3a", "#ff4a5a", "#ffd23a"][i % 3]]);
      blocks(g, L); const ringM = blocks(g, rings);
      const sprays = []; for (let i = 0; i < 18; i++) sprays.push(LP9.glow(0.28, "#e8f8ff")); sprays.forEach((s) => g.add(s));
      function anim(t) { sprays.forEach((s, i) => { const a = ((t * 1.4 + i / 18) % 1); s.position.set(0.8 + (i % 2 ? 3.6 : -2.2), 0.1 + Math.sin(a * Math.PI) * 2.4, 1 + (a - 0.5) * 1.6 * (i % 3 - 1)); s.material.opacity = 0.8 * (1 - a); });
        rings.forEach((rg, i) => { D.position.set(rg[0], 0.07 + Math.sin(t * 3 + i) * 0.05, rg[2]); D.rotation.set(0, t * 0.5 + i, 0); D.scale.set(0.9, 0.16, 0.9); D.updateMatrix(); ringM.setMatrixAt(i, D.matrix); }); ringM.instanceMatrix.needsUpdate = true; }
      return { group: g, anim };
    }
    function buildRave(ox, oz) {
      const g = group(); g.position.set(ox, 0, oz); const L = [], r = rng(32);
      flat(g, 16, 14, "#1a1424", 0, 0.03, 0);
      L.push([0, 0, -4, 9, 1.0, 3.4, "#14101c"], [0, 1.0, -5.4, 9, 0.12, 0.6, "#ff3ad8"]);
      [-5.2, 5.2].forEach((x) => { L.push([x, 0, -4.5, 1.4, 3.6, 1.2, "#0e0c14"]); for (let k = 0; k < 3; k++) L.push([x, 0.5 + k * 1.1, -3.88, 0.8, 0.8, 0.02, "#2a2638"]); });
      [-4.6, 4.6].forEach((x) => L.push([x, 0, -5.8, 0.25, 6.2, 0.25, "#5a5a6a"])); L.push([0, 6.0, -5.8, 9.5, 0.3, 0.3, "#5a5a6a"]);
      const crowd = []; for (let i = 0; i < 90; i++) { const x = -6 + r() * 12, z = -1.5 + r() * 6.5, c = Object.values(TABLE)[i % 12]; crowd.push([x, 0, z, 0.34, 0.36, 0.5, c.coat], [x, 0.36, z - 0.15, 0.3, 0.28, 0.3, c.coat]); }
      blocks(g, L); const crowdM = blocks(g, crowd);
      const wall = canvasBoard(8, 3.6, 800, 360); wall.position.set(0, 3.4, -5.65); wall.material = new T.MeshBasicMaterial({ map: wall.tex }); g.add(wall);
      { const c = wall.cx, gr = c.createLinearGradient(0, 0, 800, 360); gr.addColorStop(0, "#ff2ad8"); gr.addColorStop(0.5, "#7a3aff"); gr.addColorStop(1, "#2ad8ff"); c.fillStyle = gr; c.fillRect(0, 0, 800, 360); c.fillStyle = "#ffffff"; c.font = '900 120px "Helvetica Neue", Arial'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("MARSH FEST", 400, 190); wall.tex.needsUpdate = true; }
      const lasers = []; for (let i = 0; i < 10; i++) { const m = new T.Mesh(new T.BoxGeometry(0.05, 0.05, 22), new T.MeshBasicMaterial({ color: ["#2affd8", "#ff2ad8", "#7aff2a"][i % 3], transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false })); m.geometry.translate(0, 0, 11); m.position.set(-4.5 + i, 6.0, -5.6); g.add(m); lasers.push(m); }
      const orbs = []; for (let i = 0; i < 12; i++) { const o = LP9.glow(0.7, ["#ff2ad8", "#2ad8ff", "#ffd23a"][i % 3]); o.position.set(-4.5 + (i % 6) * 1.8, 5.6, -5.6 + Math.floor(i / 6) * 0.3); g.add(o); orbs.push(o); }
      function anim(t) { lasers.forEach((m, i) => { m.rotation.set(-0.35 + Math.sin(t * 2.2 + i) * 0.25, Math.sin(t * 1.7 + i * 0.7) * 0.7, 0); });
        orbs.forEach((o, i) => (o.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 6 + i))));
        crowd.forEach((c, i) => { const h = Math.max(0, Math.sin(t * 9 + (i >> 1) * 1.7)) * 0.25; D.position.set(c[0], c[1] + h, c[2]); D.rotation.set(0, 0, 0); D.scale.set(c[3], c[4], c[5]); D.updateMatrix(); crowdM.setMatrixAt(i, D.matrix); }); crowdM.instanceMatrix.needsUpdate = true; }
      return { group: g, anim };
    }
    function buildStadium(ox, oz) {
      const g = group(); g.position.set(ox, 0, oz); const L = [], r = rng(33);
      for (let i = 0; i < 8; i++) L.push([-7 + i * 2, 0.03, 0, 2, 0.01, 10, i % 2 ? "#4aae4a" : "#56bc56"]);
      [[0, -5, 16, 0.12], [0, 5, 16, 0.12], [0, 0, 0.12, 10]].forEach(([x, z, w, d]) => L.push([x, 0.045, z, w, 0.01, d, "#ffffff"])); [[-8, 0], [8, 0]].forEach(([x, z]) => L.push([x, 0.045, z, 0.12, 0.01, 10, "#ffffff"]));
      [-8.2, 8.2].forEach((x) => { L.push([x, 0, -1.2, 0.12, 1.2, 0.12, "#ffffff"], [x, 0, 1.2, 0.12, 1.2, 0.12, "#ffffff"], [x, 1.15, 0, 0.12, 0.12, 2.5, "#ffffff"]); });
      const fans = [];
      for (let tier = 0; tier < 4; tier++) { const y = tier * 0.6, off = 6 + tier * 0.9; L.push([0, y, -off, 18 + tier * 2, 0.6, 0.9, ["#c8323a", "#e8e8f0"][tier % 2]], [-(9.5 + tier * 0.9), y, 0, 0.9, 0.6, 12 + tier * 2, ["#c8323a", "#e8e8f0"][tier % 2]], [9.5 + tier * 0.9, y, 0, 0.9, 0.6, 12 + tier * 2, ["#c8323a", "#e8e8f0"][tier % 2]]);
        for (let f = 0; f < 34; f++) { const c = Object.values(TABLE)[(f + tier) % 12].coat; fans.push([-8.5 + f * 0.52, y + 0.6, -off, 0.3, 0.32, 0.3, c]); if (f < 22) { fans.push([-(9.5 + tier * 0.9), y + 0.6, -5.5 + f * 0.52, 0.3, 0.32, 0.3, c], [9.5 + tier * 0.9, y + 0.6, -5.5 + f * 0.52, 0.3, 0.32, 0.3, c]); } } }
      [[-11, -8], [11, -8], [-11, 7], [11, 7]].forEach(([x, z]) => L.push([x, 0, z, 0.35, 9, 0.35, "#6a6a78"], [x, 8.8, z, 1.8, 1.0, 0.3, "#3a3a44"]));
      blocks(g, L); const fanM = blocks(g, fans);
      const heads = []; [[-11, -8], [11, -8], [-11, 7], [11, 7]].forEach(([x, z]) => { const h = LP9.glow(2.6, "#fff8e0"); h.position.set(x, 9.3, z + 0.3); g.add(h); heads.push(h); });
      const ball = new T.Mesh(new T.BoxGeometry(0.4, 0.4, 0.4), M("#ffffff")); g.add(ball);
      function anim(t) { ball.position.set(Math.sin(t * 1.6) * 5, 0.25 + Math.abs(Math.sin(t * 5)) * 0.6, Math.cos(t * 1.1) * 2.5); ball.rotation.set(t * 5, t * 3, 0);
        fans.forEach((c, i) => { const h = Math.max(0, Math.sin(t * 8 + i * 0.4)) * 0.18; D.position.set(c[0], c[1] + h, c[2]); D.rotation.set(0, 0, 0); D.scale.set(c[3], c[4], c[5]); D.updateMatrix(); fanM.setMatrixAt(i, D.matrix); }); fanM.instanceMatrix.needsUpdate = true; }
      return { group: g, anim };
    }

    Object.assign(K, { buildSanctuary, breed, dogCrowd, BREED_NAMES: NAMES, BREEDS: TABLE, boxAt: box, life, lifeG, burst, beamG, beam, buildWaterpark, buildRave, buildStadium });
  }
  window.LPS = { install };
})();
