/* Marsh's Dog Sanctuary website.
   The 3D world is the same kit as the videos (lib/lowpoly-*.js). Everything on show comes from data/sanctuary.json,
   which tools/add-day.py updates each day. Add ?demo to the URL to fill the grounds with sample dogs. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const DEMO = params.has("demo");
  const phone = matchMedia("(pointer: coarse)").matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const norm = (s) => String(s || "").trim().replace(/^@+/, "").toLowerCase();
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ================= Stage ================= */
  const canvas = $("view");
  const K = LPM.setup(canvas, { pixelRatio: 1 });
  LPS.install(K); LPT.install(K);
  const { T, scene, camera, renderer } = K;
  // Phones get a smaller shadow map and a lower resolution; shadows are only redrawn when something needs them.
  const SHADOW = phone ? 1024 : 2048;
  K.sun.shadow.mapSize.set(SHADOW, SHADOW); K.sun.shadow.normalBias = 0.03;
  renderer.shadowMap.autoUpdate = false;
  // The kit's camera is set up for close video shots; a free camera needs a sane depth range (no road flicker)
  // and a sky that travels with it (the 3000 m sky sphere otherwise gets clipped to black at the edges).
  camera.near = 0.3; camera.far = 1500; camera.updateProjectionMatrix();
  K.sky.scale.setScalar(0.3); K.sky.frustumCulled = false;
  let pixelRatio = Math.min(devicePixelRatio || 1, phone ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);

  // Marsh Town: blocks of kennels around streets, with a district for each building (lowpoly-town.js buildCity).
  const CITY = K.buildCity();
  const BUILDERS = K.TOWN_BUILDS; // supermarket, library, gym, cinema
  const PLOTS = CITY.PLOTS;       // 8 plots; the first four are reserved for their districts
  K.reset();
  CITY.group.visible = true;
  K.light("day", 0, -30, 75, 420);
  K.marsh.scale.multiplyScalar(1.9); // same size as the residents
  K.puddleHome();

  // Kennels numbered from the gate outwards: early followers live nearest the entrance.
  const KENNELS = CITY.kennels.map((k, i) => ({ ...k, i })).sort((a, b) => a.d - b.d);

  /* ================= Data ================= */
  let DATA, DOGS = [], BYNAME = new Map(), BUILDS = [];
  const ACTS = {
    nap: { text: "Napping outside the kennel", pose: "lie", zz: true },
    sun: { text: "Sunbathing on the grass", pose: "lie", zz: true },
    guard: { text: "Guarding the kennel", pose: "sit" },
    treats: { text: "Waiting very politely for treats", pose: "sit" },
    butterflies: { text: "Chasing butterflies", pose: "roam" },
    zoomies: { text: "Doing zoomies round the block", pose: "lane" },
    fetch: { text: "Playing fetch", pose: "hop" },
    dig: { text: "Digging a hole by the kennel", pose: "dig" },
    supermarket: { text: "Shopping at Marsh Mart", pose: "build", build: "supermarket" },
    library: { text: "Reading at the library", pose: "build", build: "library" },
    gym: { text: "Working out at Muscle Mutts gym", pose: "build", build: "gym" },
    cinema: { text: "Watching The Good Boy at the cinema", pose: "build", build: "cinema" },
  };
  const BASE_ACTS = ["nap", "sun", "guard", "treats", "butterflies", "zoomies", "fetch", "dig", "butterflies", "fetch"];

  function demoData() {
    const words = ["sample", "demo", "test"], bits = ["pup", "woof", "bark", "paws", "tail", "bone", "zoom", "fluff"];
    const dogs = []; const r = K.rng(5);
    for (let n = 1; n <= 360; n++) {
      const model = K.BREED_NAMES[Math.floor(r() * K.BREED_NAMES.length)];
      const d = { handle: `${words[n % 3]}_${bits[Math.floor(r() * bits.length)]}${n}`, breed: model[0].toUpperCase() + model.slice(1), model, n, day: 2 + Math.floor((n / 360) * 4) };
      if (r() < 0.06) d.collar = "rainbow";
      if (r() < 0.1) d.hat = ["party", "crown", "tophat", "shades"][Math.floor(r() * 4)];
      dogs.push(d);
    }
    return {
      day: 6, updated: "demo", instagram: "marshwhatif", goldCollars: 100, silverCollars: 1000, dogs,
      builds: [{ type: "supermarket", day: 2, slot: 0 }, { type: "library", day: 2, slot: 1 }, { type: "gym", day: 2, slot: 2 }, { type: "cinema", day: 2, slot: 3 }],
      log: [6, 5, 4, 3, 2, 1].map((d) => ({ day: d, title: `Sample day ${d}`, text: "Demo text. Real days come from data/sanctuary.json.", reel: "" })),
      shop: { enabled: true, note: "Demo shop: links are empty.", items: [{ id: "rainbow", name: "Rainbow collar", price: "£2", link: "" }, { id: "party", name: "Party hat", price: "£1", link: "" }] },
      ads: {},
    };
  }

  /* ================= Residents: one instanced mesh for every dog ================= */
  // Parts in dog space (faces +z): [x, y centre, z, w, h, d, colour, kind]. Colour 0 coat, 1 dark, 2 belly, 3 black, 4 collar.
  const PARTS = [
    [0, 0.46, 0, 0.34, 0.32, 0.82, 0, "body"], [0, 0.33, 0.05, 0.28, 0.04, 0.6, 2, "body"],
    [0, 0.74, 0.46, 0.34, 0.32, 0.32, 0, "head"], [0, 0.66, 0.67, 0.2, 0.13, 0.16, 2, "head"], [0, 0.71, 0.755, 0.07, 0.05, 0.03, 3, "head"],
    [-0.09, 0.8, 0.625, 0.05, 0.05, 0.02, 3, "head"], [0.09, 0.8, 0.625, 0.05, 0.05, 0.02, 3, "head"],
    [-0.2, 0.74, 0.44, 0.06, 0.26, 0.15, 1, "head"], [0.2, 0.74, 0.44, 0.06, 0.26, 0.15, 1, "head"],
    [0, 0.6, 0.33, 0.37, 0.07, 0.12, 4, "collar"],
    [-0.12, 0.2, 0.3, 0.1, 0.4, 0.11, 0, "fl"], [0.12, 0.2, 0.3, 0.1, 0.4, 0.11, 0, "fr"],
    [-0.12, 0.2, -0.3, 0.1, 0.4, 0.11, 0, "rl"], [0.12, 0.2, -0.3, 0.1, 0.4, 0.11, 0, "rr"],
    [0, 0.68, -0.46, 0.08, 0.26, 0.08, 1, "tail"],
  ];
  const HATS = {
    party: [[0, 0.08, 0, 0.22, 0.16, 0.22, "#ff4a8a"], [0, 0.2, 0, 0.14, 0.12, 0.14, "#ffd23a"], [0, 0.3, 0, 0.07, 0.1, 0.07, "#3aa8ff"], [0, 0.38, 0, 0.08, 0.08, 0.08, "#ffffff"]],
    crown: [[0, 0.05, 0, 0.3, 0.1, 0.3, "#ffc21a"], [-0.11, 0.14, -0.11, 0.07, 0.1, 0.07, "#ffc21a"], [0.11, 0.14, -0.11, 0.07, 0.1, 0.07, "#ffc21a"], [-0.11, 0.14, 0.11, 0.07, 0.1, 0.07, "#ffc21a"], [0.11, 0.14, 0.11, 0.07, 0.1, 0.07, "#ffc21a"], [0, 0.05, 0.155, 0.06, 0.06, 0.02, "#e0243a"]],
    tophat: [[0, 0.015, 0, 0.38, 0.03, 0.38, "#1a1a22"], [0, 0.17, 0, 0.24, 0.28, 0.24, "#1a1a22"], [0, 0.06, 0, 0.25, 0.05, 0.25, "#c5242b"]],
    shades: [[0, -0.1, 0.175, 0.36, 0.035, 0.02, "#111111"], [-0.09, -0.11, 0.18, 0.12, 0.08, 0.025, "#111111"], [0.09, -0.11, 0.18, 0.12, 0.08, 0.025, "#111111"]],
  };
  const HAT_NAMES = { party: "Party hat", crown: "Crown", tophat: "Top hat", shades: "Sunglasses" };

  let dogMesh = null, accMesh = null, blingMesh = null, medalMesh = null, sparkMesh = null, TIERED = [];
  const SPARKS = 5;
  // Earned collars: gold for the first goldCollars followers, silver up to silverCollars. Paid upgrades never change the tier.
  const TIER = {
    gold: { collar: "#ffc61a", medal: "#ffd23a", spark: ["#fff7c0", "#ffd84a"], face: ["#fff4b0", "#f0b400", "#b07800", "#4a3000"], name: "Gold" },
    silver: { collar: "#e4eaf2", medal: "#eef2f8", spark: ["#ffffff", "#d4e8ff"], face: ["#ffffff", "#c8d2de", "#8a98aa", "#26303c"], name: "Silver" },
  };
  // The medal face with the dog's number, shown only on the selected dog.
  const FACES = [];
  for (let i = 0; i < 1; i++) { // only the selected dog's medal shows its number
    const c = document.createElement("canvas"); c.width = c.height = 128; const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const f = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex, transparent: true, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); f.matrixAutoUpdate = false; f.visible = false; f.cx = c.getContext("2d"); f.tex = tex; scene.add(f); FACES.push(f);
  }
  function drawFace(f, d) {
    const c = f.cx, [hi, mid, rim, ink] = TIER[d.tier].face, gr = c.createRadialGradient(48, 44, 6, 64, 64, 64);
    gr.addColorStop(0, hi); gr.addColorStop(0.75, mid); gr.addColorStop(1, rim);
    c.clearRect(0, 0, 128, 128); c.fillStyle = gr; c.beginPath(); c.arc(64, 64, 62, 0, 6.3); c.fill();
    c.strokeStyle = rim; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 54, 0, 6.3); c.stroke();
    const n = String(d.n); c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `900 ${n.length < 3 ? 66 : n.length < 4 ? 52 : 40}px "Helvetica Neue", Arial, sans-serif`; c.fillText(n, 64, 68);
    f.tex.needsUpdate = true;
  }
  const tierOf = (d) => (d.n <= DATA.goldCollars ? "gold" : d.n <= DATA.silverCollars ? "silver" : null);
  const vR = new T.Vector3(), vU = new T.Vector3(), vF = new T.Vector3(), vC = new T.Vector3(), qR = new THREE.Quaternion(), AXZ = new THREE.Vector3(0, 0, 1), Q45 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4), mDog = new T.Matrix4(), mTmp = new T.Matrix4(), mPart = new T.Matrix4(), vP = new T.Vector3(), vS = new T.Vector3(), qI = new T.Quaternion(), qT = new T.Quaternion(), ZERO = new T.Matrix4().makeScale(0, 0, 0), AX = new T.Vector3(0, 1, 0), COL = new T.Color();

  const VISITS = {}; let FRAME = 0;
  function setupDogs() {
    if (dogMesh) { dogMesh.parent.remove(dogMesh); dogMesh.dispose(); }
    if (accMesh) { accMesh.parent.remove(accMesh); accMesh.dispose(); accMesh = null; }
    const P = PARTS.length, n = Math.max(1, DOGS.length);
    dogMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff" }), n * P);
    dogMesh.castShadow = true; dogMesh.receiveShadow = true; dogMesh.frustumCulled = false; scene.add(dogMesh);
    let accCount = 0;
    DOGS.forEach((d, i) => {
      const b = K.BREEDS[d.model] || K.BREEDS.golden;
      d.b = b; d.scale = 0.9 * (0.55 + b.s * 0.8);
      d.tier = tierOf(d);
      d.collarCol = d.collar === "rainbow" ? "rainbow" : d.tier ? TIER[d.tier].collar : "#c5242b";
      PARTS.forEach((p, j) => dogMesh.setColorAt(i * P + j, COL.set(p[6] === 4 ? (d.collarCol === "rainbow" ? "#ff4a4a" : d.collarCol) : [b.coat, b.dark, b.belly, "#14100e"][p[6]])));
      const k = KENNELS[(d.n - 1) % KENNELS.length], slot = Math.floor((d.n - 1) / KENNELS.length);
      d.kennel = KENNELS.indexOf(k) + 1;
      // the first dog of each kennel lives inside it; later ones in the front yard
      // kennel frame: f points out of the door, s along the street
      const fx = k.fx, fz = k.fz, sx = fz, sz = -fx; d.k = k; d.kyaw = k.yaw;
      if (slot === 0) { d.hx = k.x - fx * 0.1; d.hz = k.z - fz * 0.1; } else { const a = (((slot - 1) % 3) - 1) * 0.78, b2 = 1.6 + Math.floor((slot - 1) / 3) * 0.55; d.hx = k.x + sx * a + fx * b2; d.hz = k.z + sz * a + fz * b2; }
      d.yx = k.x + fx * 1.6; d.yz = k.z + fz * 1.6;
      // Most dogs spend the day at home; about 1 in 7 is out at one of the buildings, and only while it has room inside.
      const h = hash(d.handle + ":" + DATA.day), builtTypes = BUILDS.map((x) => x.type).filter((t) => ACTS[t] && BUILT[t]);
      d.ph = (h % 1000) / 159; d.dir = h & 1 ? 1 : -1; d.spot = null;
      let act = d.actId || BASE_ACTS[h % BASE_ACTS.length];
      if (!d.actId && builtTypes.length && (h >>> 8) % 100 < 14) {
        const bt = builtTypes[(h >>> 16) % builtTypes.length], bl = BUILT[bt], n = VISITS[bt] || 0;
        if (n < bl.spots.length) { VISITS[bt] = n + 1; act = bt; d.spot = bl.spots[n]; d.bc = bl.centre; d.bf = bl.front; }
      }
      d.act = ACTS[act];
      if (d.hat && HATS[d.hat]) { d.acc0 = accCount; accCount += HATS[d.hat].length; }
    });
    if (!DOGS.length) for (let j = 0; j < P; j++) { dogMesh.setMatrixAt(j, ZERO); dogMesh.setColorAt(j, COL.set("#ffffff")); }
    dogMesh.instanceColor.needsUpdate = true;
    // Gold and silver dogs: a slim shiny band, a round medal with their number on the chest, and little sparkles circling the collar.
    [blingMesh, medalMesh, sparkMesh].forEach((m) => { if (m) { m.parent.remove(m); m.dispose(); } }); blingMesh = medalMesh = sparkMesh = null;
    TIERED = DOGS.filter((d) => d.tier);
    if (TIERED.length) {
      const N = TIERED.length;
      blingMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff", emissive: "#3a3020" }), N); blingMesh.frustumCulled = false; scene.add(blingMesh);
      medalMesh = new T.InstancedMesh(new T.CylinderGeometry(0.5, 0.5, 1, 14).rotateX(Math.PI / 2), new T.MeshLambertMaterial({ color: "#ffffff", emissive: "#3a3020" }), N); medalMesh.frustumCulled = false; scene.add(medalMesh);
      const st = new T.Shape(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, r = k % 2 ? 0.16 : 0.5; st[k ? "lineTo" : "moveTo"](Math.sin(a) * r, Math.cos(a) * r); }
      sparkMesh = new T.InstancedMesh(new T.ShapeGeometry(st), new T.MeshBasicMaterial({ color: "#ffffff", side: T.DoubleSide, fog: false }), N * SPARKS); sparkMesh.frustumCulled = false; sparkMesh.renderOrder = 3; scene.add(sparkMesh);
      TIERED.forEach((d, i) => { const c = TIER[d.tier];
        blingMesh.setColorAt(i, COL.set(d.collarCol === "rainbow" ? "#ff4a4a" : c.collar)); medalMesh.setColorAt(i, COL.set(c.medal));
        for (let k = 0; k < SPARKS; k++) sparkMesh.setColorAt(i * SPARKS + k, COL.set(c.spark[k % 2])); });
      [blingMesh, medalMesh, sparkMesh].forEach((m) => (m.instanceColor.needsUpdate = true));
    }
    if (accCount) {
      accMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff" }), accCount);
      accMesh.castShadow = true; accMesh.frustumCulled = false; scene.add(accMesh);
      DOGS.forEach((d) => { if (d.acc0 !== undefined) HATS[d.hat].forEach((a, j) => accMesh.setColorAt(d.acc0 + j, COL.set(a[6]))); });
      accMesh.instanceColor.needsUpdate = true;
    }
  }

  const pingpong = (x) => { const f = x - Math.floor(x / 2) * 2; return f < 1 ? f : 2 - f; };
  // Where a dog is and what it is doing at time t.
  const PO = {};
  function place(d, t) {
    const a = d.act, o = PO; o.x = d.hx; o.z = d.hz; o.y = 0; o.drop = 0; o.pitch = 0; o.hop = 0; o.run = 0; o.ph = t * 12 + d.ph;
    const k = d.k, fx = k.fx, fz = k.fz, sx = fz, sz = -fx;
    o.yaw = d.kyaw;
    if (a.pose === "lie") { o.drop = 1; o.yaw += Math.sin(d.ph) * 0.6; }
    else if (a.pose === "sit") { o.pitch = -0.45; o.yaw += Math.sin(t * 0.4 + d.ph) * 0.3; }
    else if (a.pose === "roam") { // trot back and forth in the front yard
      const an = t * 0.9 * d.dir + d.ph, u = Math.cos(an) * 1.2, v = Math.sin(an) * 0.3, du = -Math.sin(an) * d.dir * 1.2, dv = Math.cos(an) * d.dir * 0.3;
      o.x = d.yx + sx * u + fx * v; o.z = d.yz + sz * u + fz * v; o.yaw = Math.atan2(sx * du + fx * dv, sz * du + fz * dv); o.run = 1; o.hop = Math.abs(Math.sin(o.ph)) * 0.1;
    } else if (a.pose === "lane") { // zoomies round the pavement of their own block
      const RX = k.hw + 1.25, RZ = k.hd + 1.25, len = [2 * RX, 2 * RZ, 2 * RX, 2 * RZ], P = 4 * (RX + RZ);
      let s = ((((t * 4.2) / P + d.ph * 0.13) % 1 + 1) % 1) * P; if (d.dir < 0) s = P - s;
      let side = 0; while (s > len[side]) { s -= len[side]; side = (side + 1) % 4; } const f = s / len[side];
      const C = [[-RX, RZ], [RX, RZ], [RX, -RZ], [-RX, -RZ]], A = C[side], B = C[(side + 1) % 4];
      o.x = k.bx + A[0] + (B[0] - A[0]) * f; o.z = k.bz + A[1] + (B[1] - A[1]) * f; o.yaw = Math.atan2((B[0] - A[0]) * d.dir, (B[1] - A[1]) * d.dir); o.run = 1; o.hop = Math.abs(Math.sin(o.ph)) * 0.12;
    } else if (a.pose === "hop") { o.x = d.yx + sx * 0.4; o.z = d.yz + fz * 0.1; o.hop = Math.max(0, Math.sin(t * 5 + d.ph)) * 0.45; o.yaw += Math.sin(t * 0.7 + d.ph) * 1.2; } // fetch in the front yard
    else if (a.pose === "dig") { o.x = d.yx + sx * 0.5; o.z = d.yz; o.yaw += 1.2 * d.dir; o.pitch = 0.22; o.hop = Math.abs(Math.sin(t * 9 + d.ph)) * 0.05; } // digging by the kennel
    else if (a.pose === "build") {
      const sp = d.spot;
      if (!sp) { // more visitors than places inside: mill about out front
        const c = d.bc, F = d.bf, an = t * 0.3 * d.dir + d.ph * 3, u = Math.cos(an) * (1.5 + (d.ph % 1) * 3), v = 6.6 + Math.sin(an) * 0.6, du = -Math.sin(an) * d.dir, dv = Math.cos(an) * d.dir * 0.2;
        o.x = c[0] + F[1] * u + F[0] * v; o.z = c[1] - F[0] * u + F[1] * v; o.yaw = Math.atan2(F[1] * du + F[0] * dv, -F[0] * du + F[1] * dv); o.run = 1; o.hop = Math.abs(Math.sin(o.ph)) * 0.1;
      } else {
        o.x = sp.x; o.z = sp.z; o.y = sp.y; o.yaw = sp.yaw;
        if (sp.pose === "sit") o.pitch = -0.45;
        else if (sp.pose === "lie") o.drop = 1;
        else if (sp.pose === "run") { o.run = 1; o.hop = Math.abs(Math.sin(o.ph)) * 0.08; }
        else if (sp.pose === "hop") { o.hop = Math.max(0, Math.sin(t * 5 + d.ph)) * 0.35; }
        else if (sp.pose === "stand") { o.yaw += Math.sin(t * 0.5 + d.ph) * 0.25; }
        else if (sp.pose === "pace") { const u = Math.sin(t * 0.45 + d.ph * 2), v = Math.cos(t * 0.45 + d.ph * 2); o.x += sp.dx * u; o.z += sp.dz * u; o.yaw = Math.atan2(sp.dx * v, sp.dz * v); o.run = Math.abs(v) > 0.2 ? 0.7 : 0; o.ph = t * 9 + d.ph; }
      }
    }
    return o;
  }

  function updateDogs(t, focus) {
    if (!DOGS.length) return;
    const P = PARTS.length, rb = (t * 0.25) % 1, cp0 = camera.position; FRAME++;
    let rainbow = false;
    DOGS.forEach((d, i) => {
      // dogs far from the camera move every third frame (staggered), which nobody can see at that distance
      const far = (d.wx - cp0.x) ** 2 + (d.wz - cp0.z) ** 2 > 45 * 45;
      d.far = far; if (far && d !== focus && (i + FRAME) % 3) { d.upd = false; return; }
      d.upd = true;
      const o = place(d, t), b = d.b, s = d.scale * (d === focus ? 1 + Math.max(0, Math.sin(t * 6)) * 0.08 : 1);
      d.wx = o.x; d.wz = o.z; d.wy = o.y + (0.95 * b.h + o.hop) * s;
      // dog matrix: translate, yaw, pitch about the hips, scale
      mDog.makeTranslation(o.x, o.y + o.hop * s, o.z).multiply(mTmp.makeRotationY(o.yaw));
      if (o.pitch) { const py = 0.25 * b.h * s, pz = (o.pitch < 0 ? -0.35 : 0.3) * b.z * s; mDog.multiply(mTmp.makeTranslation(0, py, pz)).multiply(mTmp.makeRotationX(o.pitch)).multiply(mTmp.makeTranslation(0, -py, -pz)); }
      mDog.multiply(mTmp.makeScale(s * b.w, s * b.h, s * b.z));
      if (d.tier) { d.m = d.m || new T.Matrix4(); d.m.copy(mDog); d.dropv = o.drop; }
      const sw = Math.sin(o.ph) * o.run, drop = o.drop * 0.24;
      PARTS.forEach((p, j) => {
        let x = p[0], y = p[1], z = p[2], h = p[4]; const kind = p[7];
        if (kind.length === 2) { // legs
          if (o.drop) { h = 0.12; y = 0.06; z += kind[0] === "f" ? 0.14 : -0.06; }
          else if (o.pitch < 0 && kind[0] === "r") { h = 0.26; y = 0.13; }
          else if (o.run) { const lg = (kind === "fl" || kind === "rr" ? sw : -sw); z += lg * 0.09; h *= 1 - Math.abs(lg) * 0.2; y = h / 2; }
        } else y -= drop;
        if (kind === "collar" && d.tier) { vP.set(x, y, z); vS.set(p[3] * 1.12, h * 2.1, p[5] * 1.5); } else { vP.set(x, y, z); vS.set(p[3], h, p[5]); }
        let q = qI;
        if (kind === "tail") { qT.setFromAxisAngle(AX, Math.sin(t * (o.drop ? 3 : 18) + d.ph) * 0.6); q = qT; }
        mPart.compose(vP, q, vS); mTmp.multiplyMatrices(mDog, mPart); dogMesh.setMatrixAt(i * P + j, mTmp);
      });
      if (d.collarCol === "rainbow") { dogMesh.setColorAt(i * P + 9, COL.setHSL((rb + i * 0.13) % 1, 0.9, 0.55)); rainbow = true; }
      if (d.acc0 !== undefined) {
        HATS[d.hat].forEach((a, j) => { vP.set(a[0], 0.9 + a[1] - drop, 0.46 + a[2]); vS.set(a[3] / b.w, a[4] / b.h, a[5] / b.z); mPart.compose(vP, qI, vS); mTmp.multiplyMatrices(mDog, mPart); accMesh.setMatrixAt(d.acc0 + j, mTmp); });
      }
    });
    const cp = camera.position, near = [];
    TIERED.forEach((d, i) => {
      if (!d.upd) return;
      const m = d.m, b = d.b, drop = d.dropv * 0.24;
      vP.set(0, 0.6 - drop, 0.35); vS.set(0.43 / b.w, 0.085 / b.h, 0.17 / b.z); mPart.compose(vP, qI, vS); mTmp.multiplyMatrices(m, mPart); blingMesh.setMatrixAt(i, mTmp);
      vP.set(0, 0.46 - drop, 0.425); vS.set(0.2 / b.w, 0.2 / b.h, 0.035 / b.z); mPart.compose(vP, qI, vS); mTmp.multiplyMatrices(m, mPart); medalMesh.setMatrixAt(i, mTmp);
      // sparkles: little four-point stars orbiting the collar, each twinkling on its own beat (off when too far away to see)
      if (d.far) { if (!d.sparkOff) { for (let k = 0; k < SPARKS; k++) sparkMesh.setMatrixAt(i * SPARKS + k, ZERO); d.sparkOff = true; } if (d === focus) near.push([0, d]); return; }
      d.sparkOff = false;
      const e = m.elements; vR.set(e[0], e[1], e[2]).normalize(); vU.set(e[4], e[5], e[6]).normalize(); vF.set(e[8], e[9], e[10]).normalize();
      vC.set(0, 0.6 - drop, 0.36).applyMatrix4(m); const R = 0.3 * d.scale;
      for (let k = 0; k < SPARKS; k++) {
        const a = t * 1.7 + (k * Math.PI * 2) / SPARKS + d.ph, tw = Math.max(0, Math.sin(t * 3.4 + k * 2.3 + d.ph * 3));
        vP.copy(vC).addScaledVector(vR, Math.cos(a) * R).addScaledVector(vU, Math.sin(a) * R * 0.8).addScaledVector(vF, 0.05 + Math.sin(a) * 0.04);
        const sz = (d.tier === "gold" ? 0.17 : 0.13) * d.scale * (0.2 + 0.8 * tw * tw);
        qT.copy(camera.quaternion).multiply(qR.setFromAxisAngle(AXZ, t * 2 + k)); vS.set(sz, sz, sz); mTmp.compose(vP, qT, vS); sparkMesh.setMatrixAt(i * SPARKS + k, mTmp);
      }
      if (d === focus) near.push([0, d]);
    });
    if (blingMesh) [blingMesh, medalMesh, sparkMesh].forEach((x) => (x.instanceMatrix.needsUpdate = true));
    // the selected dog's medal shows its collar number
    FACES.forEach((f, i) => {
      const it = near[i]; if (!it) { f.visible = false; f.dog = null; return; }
      const d = it[1], b = d.b, drop = d.dropv * 0.24;
      if (f.dog !== d) { f.dog = d; drawFace(f, d); }
      vP.set(0, 0.46 - drop, 0.4445); vS.set(0.17 / b.w, 0.17 / b.h, 1); mPart.compose(vP, qI, vS); f.matrix.multiplyMatrices(d.m, mPart); f.matrixWorldNeedsUpdate = true; f.visible = true;
    });
    dogMesh.instanceMatrix.needsUpdate = true; if (rainbow) dogMesh.instanceColor.needsUpdate = true;
    if (accMesh) accMesh.instanceMatrix.needsUpdate = true;
  }

  /* ================= Marsh walks the lane ================= */
  const MARSH = { handle: "marsh", isMarsh: true };
  function updateMarsh(t) {
    const [z0, z1] = CITY.avenue, L = z0 - z1, u = (t * 1.5) / L, back = Math.floor(u) % 2 === 1, z = z0 - pingpong(u) * L;
    const mx = CITY.gate[0] - 0.5, cp = camera.position, far = (mx - cp.x) ** 2 + (z - cp.z) ** 2 > 80 * 80 && !followMarsh && selected !== MARSH;
    if (far) K.marsh.visible = false; else K.putMarsh(mx, 0, z, back ? 0 : Math.PI, { run: 1, phase: t * 11, wag: K.wag(t) }); // ~40 draw calls, so only when close
    MARSH.wx = mx; MARSH.wz = z; MARSH.wy = 1.15;
  }

  /* ================= Builds and the "next build" sign ================= */
  const animBuilds = [], BUILT = {}, ROOFS = [], LOD = [];
  // Staff dogs are detailed models (~30 draw calls each), and the cinema screen redraws a canvas, so each building only
  // shows its staff and runs its animations when the camera is within 55 m.
  function updateBuilds(t) {
    const cp = camera.position;
    LOD.forEach((b) => {
      const near = (cp.x - b.centre[0]) ** 2 + (cp.z - b.centre[1]) ** 2 < 55 * 55;
      if (b.near !== near) { b.near = near; (b.staff || []).forEach((d) => (d.visible = near)); shadowDirty = true; }
      if (near || b.always) b.anim(t);
    });
  }
  function setupBuilds() {
    // each build goes to its own district's plot; anything else takes the next free unreserved plot
    const used = new Set();
    BUILDS.forEach((b) => {
      const f = BUILDERS[b.type]; if (!f) return;
      let pi = PLOTS.findIndex((p) => p.for === b.type); if (pi < 0 || used.has(pi)) pi = PLOTS.findIndex((p, i) => !p.for && !used.has(i));
      if (pi < 0) return; used.add(pi); const p = PLOTS[pi];
      const set = f(p.x, p.z, p.yaw); set.group.visible = true; LOD.push(set); BUILT[b.type] = set; if (set.roof) ROOFS.push(set);
    });
    // the next plot to fill gets the building site and its crane
    const next = PLOTS.findIndex((p, i) => !used.has(i));
    if (next >= 0) { const p = PLOTS[next]; const site = K.buildSite(p.x, p.z, p.yaw); site.group.visible = true; site.always = true; LOD.push(site); } // the crane keeps swinging from afar
    animBuilds.push(CITY.anim);
  }

  /* ================= Camera: drag to orbit, pinch or wheel to zoom, two fingers or right-drag to pan ================= */
  const HOME = { tx: 0, tz: -27, dist: 100, yaw: 0, pitch: 0.82 }; // from the gate side, so every building faces you
  const cam = { tx: 0, ty: 0, tz: -6, dist: 150, yaw: -0.5, pitch: 1.1 };
  let fly = null, followMarsh = false, selected = null, trackSel = false;
  function flyTo(to, dur) { fly = { from: { ...cam }, to: { ...cam, ...to }, t0: performance.now(), dur: dur || 1400 }; }
  function applyCam() {
    cam.pitch = clamp(cam.pitch, 0.1, 1.45); cam.dist = clamp(cam.dist, 3, 190); cam.tx = clamp(cam.tx, -100, 100); cam.tz = clamp(cam.tz, -120, 60);
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty + Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }
  const ptrs = new Map(); let down = null, pinch0 = null;
  const stopAuto = () => { fly = null; if (followMarsh) setFollow(false); };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, pan: e.button === 2 || e.shiftKey };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    hideHint();
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (down && down.moved < 4) return;
    stopAuto();
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.dist = pinch0.dist * (pinch0.d / Math.max(20, d)); pan(mx - pinch0.mx, my - pinch0.my); pinch0.mx = mx; pinch0.my = my;
    } else if (down && down.pan) pan(dx, dy);
    else { cam.yaw -= dx * 0.006; cam.pitch += dy * 0.004; }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null;
    if (down && ptrs.size === 0) { if (down.moved < 8 && performance.now() - down.t < 450) pick(e.clientX, e.clientY); down = null; }
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); stopAuto(); cam.dist *= Math.exp(e.deltaY * 0.0012); hideHint(); }, { passive: false });
  function pan(dx, dy) { trackSel = false; const k = cam.dist * 0.0016, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); cam.tx -= (dx * c + dy * s) * k; cam.tz -= (-dx * s + dy * c) * k; }
  $("zin").onclick = () => { stopAuto(); flyTo({ dist: cam.dist * 0.6 }, 400); };
  $("zout").onclick = () => { stopAuto(); flyTo({ dist: cam.dist / 0.6 }, 400); };
  $("home").onclick = () => { stopAuto(); select(null); flyTo(HOME, 1300); };
  function setFollow(on) { followMarsh = on; $("tour").classList.toggle("on", on); if (on) { select(MARSH); } }
  $("tour").onclick = () => { if (followMarsh) return setFollow(false); fly = null; setFollow(true); flyTo({ dist: 13, pitch: 0.62 }, 1200); };
  window.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT") return; if (e.key === "Escape") { closeAll(); select(null); } });

  /* ================= Name tags and picking ================= */
  const tagsEl = $("tags"), POOL = [], V = new T.Vector3();
  for (let i = 0; i < 48; i++) { const el = document.createElement("div"); el.className = "tag"; el.hidden = true; el.addEventListener("click", () => el.dog && select(el.dog, true)); tagsEl.appendChild(el); POOL.push(el); }
  let W = innerWidth, H = innerHeight;
  function toScreen(x, y, z) { V.set(x, y, z).project(camera); return V.z > 1 ? null : { x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H }; }
  function updateTags() {
    const cp = camera.position, range = 30, list = [];
    if (cam.dist < 50) DOGS.forEach((d) => { const dd = Math.hypot(d.wx - cp.x, d.wy - cp.y, d.wz - cp.z); if (dd < range || d === selected) list.push([dd, d]); });
    else if (selected && !selected.isMarsh) list.push([0, selected]);
    list.sort((a, b) => a[0] - b[0]);
    const show = list.slice(0, 40); if (selected && selected !== MARSH && !show.some((x) => x[1] === selected)) show.push([0, selected]);
    const md = Math.hypot(MARSH.wx - cp.x, MARSH.wy - cp.y, MARSH.wz - cp.z); if (md < 60 || selected === MARSH) show.push([md, MARSH]);
    POOL.forEach((el, i) => {
      const it = show[i]; if (!it) { el.hidden = true; el.dog = null; return; }
      const [dd, d] = it, s = toScreen(d.wx, d.wy + 0.35, d.wz);
      if (!s) { el.hidden = true; return; }
      if (el.dog !== d) {
        el.dog = d; el.className = "tag" + (d.isMarsh ? " marsh" : d.tier ? " " + d.tier : d.collarCol === "rainbow" ? " rainbow" : "");
        el.textContent = d.isMarsh ? "👑 Marsh" : (d.tier === "gold" ? "🥇 " : d.tier === "silver" ? "🥈 " : "") + "@" + d.handle + (d.act && d.act.zz ? " 💤" : "");
      }
      el.classList.toggle("me", d === selected && !d.isMarsh);
      el.hidden = false; el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      el.style.opacity = d === selected ? 1 : clamp(1.4 - dd / range, 0.35, 1);
    });
  }
  function pick(x, y) {
    let best = null, bd = 34;
    DOGS.concat([MARSH]).forEach((d) => { const s = toScreen(d.wx, d.wy * 0.6, d.wz); if (!s) return; const dd = Math.hypot(s.x - x, s.y - y); if (dd < bd) { bd = dd; best = d; } });
    if (best) select(best, true);
    else if (selected && !followMarsh) select(null); // tap on empty ground closes the card
  }

  /* ================= Selection and the dog card ================= */
  function collarName(d) { // short: the badge already says gold or silver and the number
    const tier = d.tier ? TIER[d.tier].name : "";
    return d.collarCol === "rainbow" ? "Rainbow" + (tier ? ` + ${tier.toLowerCase()} medal` : "") : tier || "Red";
  }
  function select(d, fly2) {
    selected = d; trackSel = true; const card = $("card");
    document.body.classList.toggle("picked", !!d); requestAnimationFrame(measureGap);
    K.beamG.visible = !!d && !d.isMarsh;
    if (!d) { card.hidden = true; if (location.search.includes("dog=")) history.replaceState(null, "", DEMO ? "?demo" : location.pathname); return; }
    closeAll(); card.hidden = false; hideHint();
    if (d.isMarsh) {
      $("cBadge").className = "badge marsh"; $("cBadge").textContent = "Owner";
      $("cName").textContent = "Marsh"; $("cBreed").textContent = "Terrier. Puddle the duckling rides on his head.";
      $("cDoing").textContent = "Doing his rounds of the sanctuary"; $("cJoined").textContent = "1"; $("cKennel").textContent = "All of them"; $("cCollar").textContent = "Red";
      $("upgrade").hidden = true; $("share").textContent = "Share the sanctuary";
    } else {
      $("cBadge").className = "badge" + (d.tier ? " " + d.tier : d.collarCol === "rainbow" ? " rainbow" : "");
      $("cBadge").textContent = d.tier ? `${TIER[d.tier].name} collar · #${d.n}` : d.collarCol === "rainbow" ? "Rainbow collar" : `Dog #${d.n}`;
      $("cName").textContent = "@" + d.handle; $("cBreed").textContent = d.breed + (d.hat ? ` · ${HAT_NAMES[d.hat] || d.hat}` : "");
      $("cDoing").textContent = d.act.text; $("cJoined").textContent = d.day; $("cKennel").textContent = `#${d.kennel}`; $("cCollar").textContent = collarName(d);
      $("upgrade").hidden = !(DATA.shop && DATA.shop.enabled); $("share").textContent = "Share my dog";
      history.replaceState(null, "", `?dog=${encodeURIComponent(d.handle)}${DEMO ? "&demo" : ""}`);
    }
    if (fly2 && !followMarsh) { const want = d.isMarsh ? cam.yaw : (d.wx > 0 ? -0.35 : 0.35), yaw = want + Math.PI * 2 * Math.round((cam.yaw - want) / (Math.PI * 2)); const inside = d.act && d.act.pose === "build" && d.spot; flyTo({ tx: d.wx, tz: d.wz, yaw: inside ? yaw * 0.3 : yaw, dist: inside ? 15 : Math.min(Math.max(cam.dist, 11), 12), pitch: inside ? 1.18 : 1.05 }, 1300); } // steep enough to see over buildings and the gate, and into the kennels
  }
  $("card").querySelector("[data-close]").onclick = () => { select(null); if (followMarsh) setFollow(false); };
  $("upgrade").onclick = () => open("shop");
  $("share").onclick = async () => {
    const d = selected; if (!d) return;
    const url = `${location.origin}${location.pathname}?dog=${encodeURIComponent(d.handle)}`;
    const text = d.isMarsh ? "Come and see Marsh's Dog Sanctuary!" : `Meet my ${d.breed.toLowerCase()} in Marsh's Dog Sanctuary!`;
    if (navigator.share) { try { await navigator.share({ title: "Marsh's Dog Sanctuary", text, url }); } catch (e) { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) { toast(url, 6000); } // no clipboard: show the link to copy by hand
  };

  /* ================= Search ================= */
  $("find").addEventListener("submit", (e) => {
    e.preventDefault(); const q = norm($("q").value); if (!q) return;
    if (q === "marsh") { select(MARSH, true); return; }
    let d = BYNAME.get(q); if (!d) d = DOGS.find((x) => x.handle.startsWith(q)) || DOGS.find((x) => x.handle.includes(q));
    if (d) { stopAuto(); select(d, true); $("q").blur(); if (norm(d.handle) !== q) toast(`Closest match: @${d.handle}`); }
    else toast(`No dog for @${q} yet. New dogs move in with each video. Follow and comment your breed on the newest reel!`, 4200);
  });

  /* ================= Sheets, toast, hint ================= */
  const SHEETS = ["info", "log", "shop"];
  function closeAll() { SHEETS.forEach((s) => ($(s).hidden = true)); }
  function open(id) { const was = !$(id).hidden; closeAll(); $("card").hidden = true; if (!was) $(id).hidden = false; }
  document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => open(b.dataset.open)));
  SHEETS.forEach((s) => ($(s).querySelector("[data-close]").onclick = () => ($(s).hidden = true)));
  let toastT = 0; function toast(msg, ms) { const el = $("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms || 2200); }
  let hinted = false; function hideHint() { if (hinted) return; hinted = true; $("hint").style.opacity = 0; }

  function fillPage() {
    const ig = DATA.instagram || "marshwhatif", igUrl = `https://www.instagram.com/${ig}/`;
    $("follow").href = igUrl; document.querySelectorAll(".ig").forEach((el) => (el.textContent = "@" + ig));
    $("goldN").textContent = DATA.goldCollars; $("silverA").textContent = (DATA.goldCollars + 1).toLocaleString(); $("silverB").textContent = DATA.silverCollars.toLocaleString();
    const gold = DOGS.filter((d) => d.tier === "gold").length, silver = DOGS.filter((d) => d.tier === "silver").length, silverN = DATA.silverCollars - DATA.goldCollars;
    $("stats").innerHTML = `<b>Day ${DATA.day}</b> · <b>${DOGS.length.toLocaleString()}</b> ${DOGS.length === 1 ? "dog" : "dogs"} · 🥇 <b>${gold}/${DATA.goldCollars}</b> · 🥈 <b>${silver}/${silverN}</b>`;
    if (!DOGS.length) $("hint").textContent = "No dogs yet. Follow to be the first!";
    $("names").innerHTML = DOGS.length < 3000 ? DOGS.map((d) => `<option value="@${esc(d.handle)}">`).join("") : "";
    $("logList").innerHTML = DATA.log.slice().sort((a, b) => b.day - a.day).map((l) => `<li><div class="d">Day ${l.day}${l.date ? " · " + esc(l.date) : ""}</div><h3>${esc(l.title)}</h3>${l.text ? `<p>${esc(l.text)}</p>` : ""}${l.reel ? `<a href="${esc(l.reel)}" target="_blank" rel="noopener">Watch Day ${l.day} ↗</a>` : ""}</li>`).join("");
    const shop = DATA.shop || {};
    $("shopBtn").hidden = !shop.enabled;
    $("shopNote").textContent = shop.note || "";
    $("shopList").innerHTML = (shop.items || []).map((it) => it.link ? `<li><a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.name)}<b>${esc(it.price)}</b></a></li>` : `<li><span>${esc(it.name)}<b>Coming soon</b></span></li>`).join("");
    $("demo").hidden = !DEMO;
    const ads = DATA.ads || {};
    if (ads.adsenseClient && !DEMO) {
      const s = document.createElement("script"); s.async = true; s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ads.adsenseClient)}`; document.head.appendChild(s);
      const box = $("adLog"); box.hidden = false;
      box.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.adsenseClient)}" data-ad-slot="${esc(ads.slot || "")}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }

  /* ================= Loop ================= */
  function resize() { requestAnimationFrame(measureGap); W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W < H ? 58 : 46; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize);
  let viewOff = 0, shadowDirty = true, lightKey = "";
  const CARD = $("card"), TOPBAR = document.querySelector(".top"), GAP = { mid: 0 };
  // measured only when the card opens or the screen turns, never per frame (reading layout every frame is slow)
  function measureGap() { if (CARD.hidden) return; GAP.mid = (TOPBAR.getBoundingClientRect().bottom + CARD.getBoundingClientRect().top) / 2; }
  const PERF = { js: 0, gap: 16, last: 0 };
  const LAST = { dogs: 0, render: 0, tags: 0 };
  let lastInput = 0, skip = 0, slow = 0;
  ["pointerdown", "pointermove", "wheel", "keydown"].forEach((ev) => addEventListener(ev, () => (lastInput = performance.now()), { passive: true }));
  function frame(now) {
    // on phones, draw every other frame (30 fps) when nobody has touched the screen for 2.5 s: half the battery
    const idle = phone && !fly && !followMarsh && now - lastInput > 2500;
    if (idle && (skip++ & 1)) { requestAnimationFrame(frame); return; }
    const t0 = performance.now(), gap = now - (PERF.last || now);
    PERF.gap = PERF.gap * 0.95 + gap * 0.05; PERF.last = now;
    // if frames keep taking longer than ~33 ms while in use, lower the resolution a step (down to 1x), then drop shadows
    if (!idle && gap > 0 && gap < 500) { slow = gap > 34 ? slow + 1 : Math.max(0, slow - 2); if (slow > 90) { slow = 0; if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); } else if (K.sun.castShadow) K.sun.castShadow = false; } }
    frameSteps(now);
    PERF.js = PERF.js * 0.95 + (performance.now() - t0) * 0.05;
    requestAnimationFrame(frame);
  }
  function frameSteps(now) {
    const t = now / 1000;
    if (fly) { const u = clamp((now - fly.t0) / fly.dur, 0, 1), e = ease(u); for (const k in fly.to) cam[k] = fly.from[k] + (fly.to[k] - fly.from[k]) * e; if (u >= 1) fly = null; }
    updateMarsh(t); const tA = performance.now(); updateDogs(t, selected); LAST.dogs = performance.now() - tA;
    if (followMarsh) { cam.tx += (MARSH.wx - cam.tx) * 0.08; cam.tz += (MARSH.wz - cam.tz) * 0.08; }
    else if (selected && trackSel && !fly && !selected.isMarsh && selected.act.pose !== "lie" && selected.act.pose !== "sit") { cam.tx += (selected.wx - cam.tx) * 0.05; cam.tz += (selected.wz - cam.tz) * 0.05; }
    if (selected && !selected.isMarsh) K.beam.position.set(selected.wx, 7, selected.wz);
    animBuilds.forEach((f) => f(t)); updateBuilds(t);
    // on phones, keep the picked dog in the middle of the clear gap between the top bar and the card
    const off = !CARD.hidden && W < 700 && H > W ? H / 2 - GAP.mid : 0; viewOff += (off - viewOff) * 0.12;
    if (Math.abs(viewOff) > 0.5) camera.setViewOffset(W, H, 0, viewOff, W, H); else camera.clearViewOffset();
    // roofs lift off when you zoom in on a building, so you can see who's inside
    ROOFS.forEach((b) => (b.roof.visible = !(cam.dist < 36 && Math.hypot(cam.tx - b.centre[0], cam.tz - b.centre[1]) < 15)));
    applyCam();
    // the sun's shadow box follows the camera, snapped to its texels so shadows don't shimmer
    // the shadow box follows the camera in steps; shadows are redrawn when it moves, and otherwise only as often as the
    // dogs nearby need (every 2nd frame up close, every 8th from afar)
    { const size = Math.round(clamp(cam.dist * 0.8, 16, 90) / 4) * 4, step = (8 * size) / SHADOW, sx = Math.round(cam.tx / step) * step, sz = Math.round(cam.tz / step) * step, key = sx + "," + sz + "," + size;
      if (key !== lightKey) { lightKey = key; K.light("day", sx, sz, size, 420); shadowDirty = true; } }
    if (shadowDirty || FRAME % (cam.dist < 40 ? 2 : 8) === 0) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    K.sky.position.copy(camera.position);
    if (cam.dist < 45) K.life(t, cam.tx, cam.tz, clamp(cam.dist * 0.25, 4, 14), true); else K.lifeG.visible = false; // butterflies are invisible from far away
    const tR = performance.now(); K.stage.render(); LAST.render = performance.now() - tR;
    const tT = performance.now(); updateTags(); LAST.tags = performance.now() - tT;
  }

  /* ================= Boot ================= */
  async function boot() {
    try {
      DATA = DEMO ? demoData() : await fetch("data/sanctuary.json", { cache: "no-cache" }).then((r) => r.json());
    } catch (e) { DATA = { day: 1, dogs: [], builds: [], log: [], goldCollars: 100 }; toast("Couldn't load today's dogs. Try refreshing."); }
    DATA.goldCollars = DATA.goldCollars || 100; DATA.silverCollars = DATA.silverCollars || 1000;
    DATA.log = Array.isArray(DATA.log) ? DATA.log : []; DATA.day = DATA.day || 1;
    // tolerate hand-edited data: drop duplicates, give missing numbers the next free one, fill in breed and day
    const seen = new Set(); let maxN = 0;
    DOGS = (Array.isArray(DATA.dogs) ? DATA.dogs : []).filter((d) => d && typeof d.handle === "string" && d.handle.trim() && !d.removed && !seen.has(norm(d.handle)) && seen.add(norm(d.handle)));
    DOGS.forEach((d) => { d.n = Number.isFinite(+d.n) && +d.n > 0 ? +d.n : 0; maxN = Math.max(maxN, d.n); });
    DOGS.forEach((d) => { if (!d.n) d.n = ++maxN; });
    DOGS.sort((a, b) => a.n - b.n);
    DOGS.forEach((d) => { d.handle = d.handle.trim().replace(/^@+/, ""); d.model = K.BREEDS[d.model] ? d.model : "golden"; d.breed = String(d.breed || d.model[0].toUpperCase() + d.model.slice(1)); d.day = d.day || DATA.day; BYNAME.set(norm(d.handle), d); });
    const bseen = new Set(); BUILDS = (Array.isArray(DATA.builds) ? DATA.builds : []).filter((b) => b && BUILDERS[b.type] && !bseen.has(b.type) && bseen.add(b.type)); // each kind once
    window.SANCTUARY = { DOGS, select: (h) => select(BYNAME.get(norm(h)), true), view: (o) => { fly = null; Object.assign(cam, o); }, bench: (n = 60) => { // runs n frames back to back and times each step (CPU only; the GPU work isn't counted)
      const T0 = performance.now(), r = { dogs: 0, render: 0, tags: 0, rest: 0 };
      for (let i = 0; i < n; i++) { const now = T0 + i * 16.7, a = performance.now(); frameSteps(now); r.rest += performance.now() - a - (LAST.dogs + LAST.render + LAST.tags); r.dogs += LAST.dogs; r.render += LAST.render; r.tags += LAST.tags; }
      for (const k in r) r[k] = +(r[k] / n).toFixed(2); r.calls = renderer.info.render.calls; r.tris = renderer.info.render.triangles; return r; },
    perf: () => ({ cpuMs: +PERF.js.toFixed(2), frameMs: +PERF.gap.toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr: renderer.getPixelRatio() }) };
    setupBuilds(); setupDogs(); fillPage(); resize();
    updateMarsh(0); updateDogs(0); applyCam();
    requestAnimationFrame(frame);
    setTimeout(() => $("loading").classList.add("gone"), 150);
    const want = norm(params.get("dog"));
    const target = want && (want === "marsh" ? MARSH : BYNAME.get(want));
    if (target) { setTimeout(() => select(target, true), 300); hideHint(); }
    else { flyTo(HOME, 2600); if (want) toast(`No dog for @${want} yet. New dogs move in with each video.`, 3500); }
  }
  boot();
})();
