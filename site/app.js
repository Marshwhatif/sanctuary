/* Marsh's Dog Sanctuary website.
   The 3D world is the same kit as the videos (lib/lowpoly-*.js). Everything on show comes from data/sanctuary.json,
   which tools/add-day.py updates each day. Add ?demo to the URL to fill the grounds with sample dogs. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const DEMO = params.has("demo"); // ?demo: the next day's real data (data/preview.json) before it goes live, or sample dogs if there is none
  const phone = matchMedia("(pointer: coarse)").matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const norm = (s) => String(s || "").trim().replace(/^@+/, "").toLowerCase();
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ================= Stage ================= */
  const canvas = $("view");
  const K = LPM.setup(canvas, { pixelRatio: 1, stage: { preserve: false } }); // no preserved drawing buffer: much cheaper on phones
  LPS.install(K); LPT.install(K);
  const { T, scene, camera, renderer } = K;
  // Phones get a smaller shadow map and a lower resolution; shadows are only redrawn when something needs them.
  const SHADOW = phone ? 1024 : 2048;
  K.sun.shadow.mapSize.set(SHADOW, SHADOW); K.sun.shadow.normalBias = 0.03;
  renderer.shadowMap.autoUpdate = false;
  if (phone) renderer.shadowMap.type = T.PCFShadowMap; // plain (not soft) shadow edges: far fewer texture reads per pixel
  // The kit's camera is set up for close video shots; a free camera needs a sane depth range (no road flicker)
  // and a sky that travels with it (the 3000 m sky sphere otherwise gets clipped to black at the edges).
  camera.near = 0.3; camera.far = 1500; camera.updateProjectionMatrix();
  K.sky.scale.setScalar(0.3); K.sky.frustumCulled = false;
  let pixelRatio = Math.min(devicePixelRatio || 1, phone ? 1.3 : 2);
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
  let DATA, DOGS = [], BYNAME = new Map(), BUILDS = [], SHOP = [];
  const ACTS = {
    nap: { text: "Napping outside the kennel", pose: "lie", zz: true },
    snooze: { text: "Snoozing inside the kennel", pose: "lie", zz: true },
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
    waterpark: { text: "Splashing about at the waterpark", pose: "build", build: "waterpark" },
  };
  const BASE_ACTS = ["nap", "sun", "guard", "treats", "butterflies", "zoomies", "fetch", "dig", "butterflies", "fetch"];

  function demoData() {
    const words = ["sample", "demo", "test"], bits = ["pup", "woof", "bark", "paws", "tail", "bone", "zoom", "fluff"];
    const dogs = []; const r = K.rng(5);
    for (let n = 1; n <= 360; n++) {
      const model = LPB.NAMES[Math.floor(r() * LPB.NAMES.length)];
      const d = { handle: `${words[n % 3]}_${bits[Math.floor(r() * bits.length)]}${n}`, breed: LPB.LABEL[model], model, look: "", n, day: 2 + Math.floor((n / 360) * 4) };
      if (r() < 0.06) d.collar = "rainbow";
      if (r() < 0.1) d.hat = ["party", "crown", "tophat", "shades", "propeller"][Math.floor(r() * 5)];
      dogs.push(d);
    }
    return {
      day: 6, updated: "demo", instagram: "marshwhatif", goldCollars: 100, silverCollars: 600, dogs,
      builds: [{ type: "supermarket", day: 2, slot: 0 }, { type: "library", day: 2, slot: 1 }, { type: "gym", day: 2, slot: 2 }, { type: "cinema", day: 2, slot: 3 }, { type: "waterpark", day: 6, slot: 4 }],
      log: [6, 5, 4, 3, 2, 1].map((d) => ({ day: d, title: `Sample day ${d}`, text: "Demo text. Real days come from data/sanctuary.json.", reel: "" })),
      shop: { enabled: true, note: "Demo shop: the buy links are empty.", items: SHOP_DEFAULT },
    };
  }

  /* ================= Residents ================= */
  // Every dog is built from boxes on 7 bones by lib/lowpoly-breeds.js (LPB). All dogs share two instanced meshes:
  // "core" (body, head, snout, ears, legs, tail, collar: about 13 boxes a dog, always drawn) and "detail" (eyes, markings,
  // fur: drawn only for dogs near the camera). From far away the core alone reads as the right breed and colour.
  const HATS = {
    party: [[0, 0.08, 0, 0.22, 0.16, 0.22, "#ff4a8a"], [0, 0.2, 0, 0.14, 0.12, 0.14, "#ffd23a"], [0, 0.3, 0, 0.07, 0.1, 0.07, "#3aa8ff"], [0, 0.38, 0, 0.08, 0.08, 0.08, "#ffffff"]],
    crown: [[0, 0.05, 0, 0.3, 0.1, 0.3, "#ffc21a"], [-0.11, 0.14, -0.11, 0.07, 0.1, 0.07, "#ffc21a"], [0.11, 0.14, -0.11, 0.07, 0.1, 0.07, "#ffc21a"], [-0.11, 0.14, 0.11, 0.07, 0.1, 0.07, "#ffc21a"], [0.11, 0.14, 0.11, 0.07, 0.1, 0.07, "#ffc21a"], [0, 0.05, 0.155, 0.06, 0.06, 0.02, "#e0243a"]],
    tophat: [[0, 0.015, 0, 0.38, 0.03, 0.38, "#1a1a22"], [0, 0.17, 0, 0.24, 0.28, 0.24, "#1a1a22"], [0, 0.06, 0, 0.25, 0.05, 0.25, "#c5242b"]],
    shades: [[0, -0.1, 0.175, 0.36, 0.035, 0.02, "#111111"], [-0.09, -0.11, 0.18, 0.12, 0.08, 0.025, "#111111"], [0.09, -0.11, 0.18, 0.12, 0.08, 0.025, "#111111"]],
    wizard: [[0, 0.015, 0, 0.44, 0.03, 0.44, "#3a2a8a"], [0, 0.1, 0, 0.27, 0.16, 0.27, "#4a3aa8"], [0, 0.24, -0.01, 0.19, 0.14, 0.19, "#4a3aa8"], [0, 0.36, -0.03, 0.12, 0.12, 0.12, "#4a3aa8"], [0, 0.46, -0.06, 0.06, 0.1, 0.06, "#4a3aa8"], [0.07, 0.13, 0.136, 0.05, 0.05, 0.01, "#ffd23a"], [-0.05, 0.26, 0.096, 0.04, 0.04, 0.01, "#ffd23a"]],
    chef: [[0, 0.05, 0, 0.3, 0.1, 0.3, "#ffffff"], [0, 0.17, 0, 0.36, 0.15, 0.36, "#f8f8f8"], [0, 0.27, 0, 0.3, 0.07, 0.3, "#ffffff"], [0, 0.04, 0.151, 0.3, 0.02, 0.005, "#d8d8d8"]],
    bobble: [[0, 0.03, 0, 0.36, 0.08, 0.36, "#c8303a"], [0, 0.12, 0, 0.33, 0.12, 0.33, "#e2483a"], [0, 0.095, 0, 0.335, 0.03, 0.335, "#ffffff"], [0, 0.2, 0, 0.24, 0.05, 0.24, "#e2483a"], [0, 0.26, 0, 0.11, 0.11, 0.11, "#ffffff"]],
    // propeller beanie: four colour panels, a visor, and two blades that spin (parts marked "spin" turn round the hat's centre)
    propeller: [[-0.0875, 0.05, -0.0875, 0.175, 0.12, 0.175, "#e2483a"], [0.0875, 0.05, -0.0875, 0.175, 0.12, 0.175, "#f0b52e"], [-0.0875, 0.05, 0.0875, 0.175, 0.12, 0.175, "#2f8fe0"], [0.0875, 0.05, 0.0875, 0.175, 0.12, 0.175, "#27b39a"], [-0.0725, 0.135, -0.0725, 0.145, 0.05, 0.145, "#e2483a"], [0.0725, 0.135, -0.0725, 0.145, 0.05, 0.145, "#f0b52e"], [-0.0725, 0.135, 0.0725, 0.145, 0.05, 0.145, "#2f8fe0"], [0.0725, 0.135, 0.0725, 0.145, 0.05, 0.145, "#27b39a"], [-0.05, 0.18, -0.05, 0.1, 0.04, 0.1, "#e2483a"], [0.05, 0.18, -0.05, 0.1, 0.04, 0.1, "#f0b52e"], [-0.05, 0.18, 0.05, 0.1, 0.04, 0.1, "#2f8fe0"], [0.05, 0.18, 0.05, 0.1, 0.04, 0.1, "#27b39a"], [0, 0.0, 0.21, 0.28, 0.025, 0.12, "#2f8fe0"], [0, 0.23, 0, 0.035, 0.06, 0.035, "#f6f4ee"], [0, 0.27, 0, 0.065, 0.03, 0.065, "#f0b52e"], [-0.13, 0.285, 0, 0.22, 0.014, 0.07, "#e2483a", "spin"], [0.13, 0.285, 0, 0.22, 0.014, 0.07, "#2f8fe0", "spin"]],
    cowboy: [[0, 0.02, 0, 0.58, 0.03, 0.48, "#a0683a"], [-0.26, 0.04, 0, 0.06, 0.04, 0.48, "#a0683a"], [0.26, 0.04, 0, 0.06, 0.04, 0.48, "#a0683a"], [0, 0.12, 0, 0.28, 0.18, 0.26, "#a0683a"], [0, 0.05, 0, 0.285, 0.04, 0.265, "#5a3a20"], [0, 0.2, 0, 0.1, 0.03, 0.27, "#8a5830"]],
  };
  const HAT_NAMES = { party: "Party hat", crown: "Crown", tophat: "Top hat", shades: "Sunglasses", wizard: "Wizard hat", chef: "Chef's hat", bobble: "Bobble hat", cowboy: "Cowboy hat", propeller: "Propeller hat" };
  // The shop's line-up. Live items need a Ko-fi link in data/sanctuary.json; "soon" ones show as coming soon.
  // Shop-only models (outfits aren't worn by dogs yet; they're coming soon). Same format as HATS: x, bottom y, z, w, h, d, colour.
  const PREVIEW = {
    jumper: [[0, 0.06, 0, 0.5, 0.36, 0.18, "#c8283a"], [0, 0, 0, 0.51, 0.06, 0.19, "#2a8a4a"], [-0.33, 0.1, 0, 0.16, 0.32, 0.16, "#c8283a"], [0.33, 0.1, 0, 0.16, 0.32, 0.16, "#c8283a"],
      [-0.33, 0.06, 0, 0.17, 0.05, 0.17, "#2a8a4a"], [0.33, 0.06, 0, 0.17, 0.05, 0.17, "#2a8a4a"], [0, 0.42, 0, 0.22, 0.05, 0.19, "#2a8a4a"], [0, 0.29, 0, 0.51, 0.05, 0.19, "#ffffff"],
      [-0.15, 0.3, 0.096, 0.03, 0.03, 0.01, "#c8283a"], [0, 0.3, 0.096, 0.03, 0.03, 0.01, "#c8283a"], [0.15, 0.3, 0.096, 0.03, 0.03, 0.01, "#c8283a"],
      [0, 0.09, 0.095, 0.14, 0.05, 0.01, "#2a8a4a"], [0, 0.14, 0.095, 0.1, 0.05, 0.01, "#2a8a4a"], [0, 0.19, 0.095, 0.05, 0.05, 0.01, "#2a8a4a"], [0, 0.24, 0.096, 0.04, 0.04, 0.01, "#ffd23a"]],
    suit: [[0, 0, 0, 0.5, 0.44, 0.18, "#22283a"], [-0.33, 0.08, 0, 0.16, 0.36, 0.16, "#22283a"], [0.33, 0.08, 0, 0.16, 0.36, 0.16, "#22283a"],
      [-0.33, 0.04, 0, 0.15, 0.04, 0.15, "#ffffff"], [0.33, 0.04, 0, 0.15, 0.04, 0.15, "#ffffff"], [0, 0.2, 0.091, 0.13, 0.24, 0.01, "#ffffff"],
      [-0.09, 0.2, 0.095, 0.05, 0.24, 0.012, "#151a28"], [0.09, 0.2, 0.095, 0.05, 0.24, 0.012, "#151a28"], [0, 0.2, 0.097, 0.05, 0.18, 0.012, "#c8283a"], [0, 0.37, 0.098, 0.06, 0.05, 0.012, "#a01e2e"],
      [0, 0.44, 0, 0.24, 0.04, 0.19, "#ffffff"], [0, 0.06, 0.096, 0.03, 0.03, 0.01, "#d8b04a"], [0, 0.13, 0.096, 0.03, 0.03, 0.01, "#d8b04a"], [0.16, 0.32, 0.096, 0.07, 0.04, 0.01, "#ffffff"]],
    request: [[0, 0, 0, 0.36, 0.3, 0.36, "#3aa8ff"], [0, 0.3, 0, 0.4, 0.08, 0.4, "#2a88dd"], [0, 0, 0, 0.365, 0.385, 0.07, "#ffd23a"], [0, 0.38, 0, 0.07, 0.006, 0.405, "#ffd23a"],
      [-0.07, 0.38, 0, 0.11, 0.08, 0.06, "#ffd23a"], [0.07, 0.38, 0, 0.11, 0.08, 0.06, "#ffd23a"],
      [0, 0.23, 0.186, 0.1, 0.035, 0.012, "#ffffff"], [-0.05, 0.2, 0.186, 0.035, 0.05, 0.012, "#ffffff"], [0.05, 0.16, 0.186, 0.035, 0.09, 0.012, "#ffffff"],
      [0.015, 0.13, 0.186, 0.065, 0.035, 0.012, "#ffffff"], [0, 0.09, 0.186, 0.035, 0.05, 0.012, "#ffffff"], [0, 0.03, 0.186, 0.035, 0.035, 0.012, "#ffffff"]],
  };
  // The shop's line-up. Live items need a Ko-fi link in data/sanctuary.json; "soon" ones show as coming soon; "request" opens an Instagram DM.
  const SHOP_DEFAULT = [
    { id: "rainbow", kind: "collar", name: "Rainbow collar", price: "£5" }, { id: "party", kind: "hat", name: "Party hat", price: "£3" },
    { id: "propeller", kind: "hat", name: "Propeller hat", price: "£3" }, { id: "request", kind: "request", name: "Something else?" },
    { id: "crown", kind: "hat", name: "Crown", soon: true }, { id: "tophat", kind: "hat", name: "Top hat", soon: true }, { id: "shades", kind: "hat", name: "Sunglasses", soon: true },
    { id: "jumper", kind: "outfit", name: "Christmas jumper", soon: true }, { id: "suit", kind: "outfit", name: "Suit", soon: true },
  ];

  let coreMesh = null, detMesh = null, accMesh = null, blobMesh = null, farMesh = null, OVER = false, blingMesh = null, medalMesh = null, sparkMesh = null, TIERED = [];
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
  const vR = new T.Vector3(), vU = new T.Vector3(), vF = new T.Vector3(), vC = new T.Vector3(), qR = new THREE.Quaternion(), AXZ = new THREE.Vector3(0, 0, 1), Q45 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4), mDog = new T.Matrix4(), mTmp = new T.Matrix4(), mPart = new T.Matrix4(), vP = new T.Vector3(), vS = new T.Vector3(), qI = new T.Quaternion(), qT = new T.Quaternion(), ZERO = new T.Matrix4().makeScale(0, 0, 0), AX = new T.Vector3(0, 1, 0), AXX = new T.Vector3(1, 0, 0), COL = new T.Color();

  const VISITS = {}; let FRAME = 0;
  // The zoomed-out dog: legs, body and head merged into one shape (one instance a dog, 30 triangles, no undersides).
  // In unit space: 1 wide, 1 tall to the top of the back, 1 long; each breed stretches it (rig.far).
  const FARGEO = (() => {
    const parts = [[0, 0.3, 0, 0.8, 0.6, 0.75], [0, 0.78, 0, 1, 0.44, 1], [0, 1.05, 0.55, 0.85, 0.5, 0.42]], pos = [], nor = [];
    parts.forEach(([x, y, z, w, h, d]) => { const b = new T.BoxGeometry(w, h, d).toNonIndexed(); b.translate(x, y, z); const P = b.attributes.position.array, N = b.attributes.normal.array;
      for (let i = 0; i < P.length; i += 9) { if (N[i + 1] < -0.5) continue; for (let k = 0; k < 9; k++) { pos.push(P[i + k]); nor.push(N[i + k]); } } }); // drop the bottom faces
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3)); return g;
  })();
  // Soft round shadows under the dogs and Marsh. Moving things don't cast real (shadow-map) shadows any more: those could
  // only be redrawn every few frames, so they trailed behind the dogs. Buildings, kennels and trees still do.
  const BLOBGEO = new T.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), BLOBMAT = new T.MeshBasicMaterial({ color: "#1b2a12", transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const marshBlob = new T.Mesh(BLOBGEO, BLOBMAT); marshBlob.scale.set(1.3, 1, 1.9); marshBlob.renderOrder = 1; scene.add(marshBlob);
  const BONES = Array.from({ length: 7 }, () => new T.Matrix4()), BW = Array.from({ length: 7 }, () => new T.Matrix4()), POSE = {}, qColl = new T.Quaternion();
  const IN_ACTS = ["snooze", "guard", "snooze", "treats"], OUT_ACTS = ["sun", "butterflies", "zoomies", "fetch", "dig", "butterflies", "fetch", "zoomies"];
  function setupDogs() {
    [coreMesh, detMesh, accMesh, blobMesh, farMesh].forEach((m) => { if (m) { m.parent.remove(m); m.dispose(); } }); coreMesh = detMesh = accMesh = blobMesh = farMesh = null;
    // split each breed's boxes into core and detail once
    const split = (rg) => { if (!rg.far) { // the overview shape (see FARGEO) stretched to this breed: width, height to the back, length
        const sc = new T.Vector3(), pv = rg.pivots; rg.parts[0].m.decompose(new T.Vector3(), new T.Quaternion(), sc);
        rg.far = new T.Matrix4().makeScale(sc.x, pv[2].y + 0.05, pv[3].z - pv[5].z + 0.3); rg.farC = rg.parts[0].c;
      }
      if (!rg.core) { const pv = rg.pivots; rg.blobL = pv[3].z - pv[5].z + 0.55; rg.blobW = Math.abs(pv[4].x) * 2 + 0.34; rg.core = []; rg.det = []; rg.parts.forEach((p, i) => (p.core ? rg.core : rg.det).push(i)); rg.collarCore = rg.core.indexOf(rg.collarIdx); } return rg; };
    let nc = 0, accCount = 0;
    DOGS.forEach((d) => { const rg = split(LPB.rig(d.model, d.look)); d.rig = rg; d.scale = LPB.scaleOf(rg); d.c0 = nc; d.detAt = -1; nc += rg.core.length; });
    const mk = (n, shadow) => { const m = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff" }), Math.max(1, n)); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(m); return m; };
    coreMesh = mk(nc, false); detMesh = mk(DETCAP, false); detMesh.count = 0;
    farMesh = new T.InstancedMesh(FARGEO, new T.MeshLambertMaterial({ color: "#ffffff" }), Math.max(1, DOGS.length)); farMesh.frustumCulled = false; farMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); farMesh.visible = false; scene.add(farMesh);
    DOGS.forEach((d, i) => farMesh.setColorAt(i, COL.set(d.rig.farC)));
    if (!DOGS.length) farMesh.setMatrixAt(0, ZERO);
    blobMesh = new T.InstancedMesh(BLOBGEO, BLOBMAT, Math.max(1, DOGS.length)); blobMesh.frustumCulled = false; blobMesh.renderOrder = 1; blobMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(blobMesh);
    if (!DOGS.length) blobMesh.setMatrixAt(0, ZERO);
    if (!nc) { coreMesh.setMatrixAt(0, ZERO); coreMesh.setColorAt(0, COL.set("#ffffff")); } detMesh.setColorAt(0, COL.set("#ffffff"));
    // kennels: the first dogs get their own; later ones share. In a shared kennel one dog is inside today and the others are out
    // and about (who's inside changes every day).
    const byK = new Map();
    DOGS.forEach((d) => { const k = KENNELS[(d.n - 1) % KENNELS.length]; if (!byK.has(k)) byK.set(k, []); byK.get(k).push(d); });
    byK.forEach((list, k) => { const ins = list.length > 1 ? hash(k.i + ":" + DATA.day) % list.length : 0; let o = 0; list.forEach((d, j) => { d.k = k; d.shared = list.length > 1; d.inside = j === ins; d.slot = d.inside ? 0 : ++o; }); });
    DOGS.forEach((d, i) => {
      const rg = d.rig;
      d.tier = tierOf(d);
      d.collarCol = d.collar === "rainbow" ? "rainbow" : d.tier ? TIER[d.tier].collar : "#c5242b";
      rg.core.forEach((pi, j) => coreMesh.setColorAt(d.c0 + j, COL.set(pi === rg.collarIdx ? (d.collarCol === "rainbow" ? "#ff4a4a" : d.collarCol) : rg.parts[pi].c)));
      const k = d.k, slot = d.slot;
      d.kennel = KENNELS.indexOf(k) + 1;
      // kennel frame: f points out of the door, s along the street
      const fx = k.fx, fz = k.fz, sx = fz, sz = -fx; d.kyaw = k.yaw;
      if (slot === 0) { d.hx = k.x - fx * 0.1; d.hz = k.z - fz * 0.1; } else { const a = (((slot - 1) % 3) - 1) * 0.78, b2 = 1.6 + Math.floor((slot - 1) / 3) * 0.55; d.hx = k.x + sx * a + fx * b2; d.hz = k.z + sz * a + fz * b2; }
      d.yx = k.x + fx * 1.6; d.yz = k.z + fz * 1.6;
      // Most dogs spend the day at home; some are out at the buildings, while those have room inside.
      const h = hash(d.handle + ":" + DATA.day), builtTypes = BUILDS.map((x) => x.type).filter((t) => ACTS[t] && BUILT[t]).flatMap((t) => Array(BUILT[t].weight || 1).fill(t)); // (a build with lots of room, like the waterpark, counts several times)
      d.ph = (h % 1000) / 159; d.dir = h & 1 ? 1 : -1; d.spot = null;
      let act = d.actId || (d.shared ? (d.inside ? IN_ACTS : OUT_ACTS)[h % (d.inside ? IN_ACTS : OUT_ACTS).length] : BASE_ACTS[h % BASE_ACTS.length]);
      const visit = d.shared ? (d.inside ? 0 : 30) : 14;
      if (!d.actId && builtTypes.length && (h >>> 8) % 100 < visit) {
        const bt = builtTypes[(h >>> 16) % builtTypes.length], bl = BUILT[bt], n = VISITS[bt] || 0;
        if (n < bl.spots.length) { VISITS[bt] = n + 1; act = bt; d.spot = bl.spots[n]; d.bc = bl.centre; d.bf = bl.front; }
      }
      d.act = d.spot && d.spot.text ? { ...ACTS[act], text: d.spot.text } : ACTS[act];
      d.far = true;
      if (d.hat && HATS[d.hat]) { d.acc0 = accCount; accCount += HATS[d.hat].length; }
    });
    coreMesh.instanceColor.needsUpdate = true; detMesh.instanceColor.needsUpdate = true; farMesh.instanceColor.needsUpdate = true;
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
        for (let k = 0; k < SPARKS; k++) { sparkMesh.setColorAt(i * SPARKS + k, COL.set(c.spark[k % 2])); sparkMesh.setMatrixAt(i * SPARKS + k, ZERO); } });
      [blingMesh, medalMesh, sparkMesh].forEach((m) => (m.instanceColor.needsUpdate = true));
    }
    if (accCount) {
      accMesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: "#ffffff" }), accCount);
      accMesh.castShadow = false; accMesh.frustumCulled = false; scene.add(accMesh);
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
        if (sp.path) { const sink = sp.path(t, o); if (sink) o.y -= sink * d.rig.anchor.tag * d.scale; if (!Number.isFinite(o.x + o.y + o.z + o.yaw)) { o.x = sp.x; o.z = sp.z; o.y = 0; o.yaw = sp.yaw; } } // (never hand the camera a broken position) // waterpark routes: slides, rings, swimming
        else if (sp.pose === "shake") { const on = Math.max(0, Math.sin(t * 0.9 + d.ph)); o.yaw += Math.sin(t * 30 + d.ph) * 0.4 * on; o.hop = on * Math.abs(Math.sin(t * 30)) * 0.03; }
        else if (sp.pose === "sit") o.pitch = -0.45;
        else if (sp.pose === "lie") o.drop = 1;
        else if (sp.pose === "run") { o.run = 1; o.hop = Math.abs(Math.sin(o.ph)) * 0.08; }
        else if (sp.pose === "hop") { o.hop = Math.max(0, Math.sin(t * 5 + d.ph)) * 0.35; }
        else if (sp.pose === "stand") { o.yaw += Math.sin(t * 0.5 + d.ph) * 0.25; }
        else if (sp.pose === "pace") { const u = Math.sin(t * 0.45 + d.ph * 2), v = Math.cos(t * 0.45 + d.ph * 2); o.x += sp.dx * u; o.z += sp.dz * u; o.yaw = Math.atan2(sp.dx * v, sp.dz * v); o.run = Math.abs(v) > 0.2 ? 0.7 : 0; o.ph = t * 9 + d.ph; }
      }
    }
    return o;
  }

  // Details (eyes, markings, fur) are drawn only for on-screen dogs within NEAR of the camera, packed at the start of one small
  // instanced mesh, so the GPU never draws hidden boxes. Dogs further than FAR, or off screen, move less often.
  const NEAR2 = 20 * 20, FAR2 = 30 * 30, DETCAP = 2600, FRU = new T.Frustum(), mVP = new T.Matrix4(), SPH = new T.Sphere();
  function updateDogs(t, focus) {
    if (!DOGS.length) return;
    const rb = (t * 0.25) % 1, cp0 = camera.position; FRAME++;
    let rainbow = false;
    mVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); FRU.setFromProjectionMatrix(mVP);
    const farStride = cam.dist > 60 ? 4 : 3; // from the overview the dogs are tiny, so a quarter of them move each frame
    // Zoomed right out, every dog is a few pixels, and phones choke on thousands of tiny boxes: each dog becomes 4 boxes,
    // with no blob shadows, medals or details, and phones draw at 1x. Close in, the full dogs come back.
    // (No change of resolution and no shadow redraw here: both caused a visible hitch. The shadow map keeps the detailed
    // kennels' shadows, which still line up.)
    const over = OVER ? cam.dist > MAP_3D + 1 : cam.dist > MAP_3D + 5;
    let force = false;
    if (over !== OVER) {
      OVER = over; coreMesh.visible = detMesh.visible = blobMesh.visible = !over; farMesh.visible = over; CITY.kennelHi.visible = !over; CITY.kennelLo.visible = over; if (medalMesh) medalMesh.visible = sparkMesh.visible = !over; if (accMesh) accMesh.visible = !over;
      force = true; // move every dog into place this frame
    }
    let cur = 0, colDirty = false;
    if (MAP.full) { // flat map only: just move the dots (a quarter of the dogs each frame)
      for (let i = 0; i < DOGS.length; i++) { const d = DOGS[i]; if (d !== focus && d.wx !== undefined && (i + FRAME) % 4) continue; const o = place(d, t); d.wx = o.x; d.wz = o.z; d.wy = 1; mapDot(d, i); }
      MAP.dots.instanceMatrix.needsUpdate = MAP.rings.instanceMatrix.needsUpdate = true; DOGS.forEach((d) => (d.upd = false)); return;
    }
    for (let i = 0; i < DOGS.length; i++) {
      const d = DOGS[i];
      const known = d.wx !== undefined, dist2 = known ? (d.wx - cp0.x) ** 2 + (d.wz - cp0.z) ** 2 : 0;
      const seen = !known || d === focus || FRU.intersectsSphere(SPH.set(vC.set(d.wx, d.wy * 0.5, d.wz), 1.6 * d.scale));
      const far = dist2 > FAR2; d.far = far || !seen;
      const wantDet = seen && !OVER && (d === focus || dist2 < NEAR2) && cur + d.rig.det.length <= DETCAP;
      if (!force && d !== focus && known && (!seen ? (i + FRAME) % 8 : far && (i + FRAME) % farStride)) { d.upd = false; d.detAt = -1; continue; }
      d.upd = true;
      const o = place(d, t), rg = d.rig, s = d.scale * (d === focus ? 1 + Math.max(0, Math.sin(t * 6)) * 0.08 : 1);
      d.wx = o.x; d.wz = o.z; d.wy = o.y + (rg.anchor.tag * (1 - o.drop * 0.25) + o.hop) * s; if (MAP.fade > 0) mapDot(d, i);
      mDog.makeTranslation(o.x, o.y + o.hop * s, o.z).multiply(mTmp.makeRotationY(o.yaw)).multiply(mTmp.makeScale(s, s, s));
      if (o.pitch) { const pv = rg.pivots[o.pitch < 0 ? 5 : 3]; mDog.multiply(mTmp.makeTranslation(0, pv.y, pv.z)).multiply(mTmp.makeRotationX(o.pitch)).multiply(mTmp.makeTranslation(0, -pv.y, -pv.z)); }
      POSE.drop = o.drop; POSE.sit = o.pitch < 0 ? 1 : 0; POSE.run = o.run; POSE.ph = o.ph;
      POSE.wag = Math.sin(t * (o.drop ? 3 : 16) + d.ph) * 0.6; POSE.look = o.run ? 0 : Math.sin(t * 0.6 + d.ph * 2) * 0.35;
      if (OVER) { mTmp.multiplyMatrices(mDog, rg.far); farMesh.setMatrixAt(i, mTmp); if (d.tier) { d.m = d.m || new T.Matrix4(); d.m.copy(mDog); } d.detAt = -1; continue; }
      LPB.pose(rg, POSE, BONES);
      for (let b = 0; b < 7; b++) BW[b].multiplyMatrices(mDog, BONES[b]);
      const P = rg.parts;
      for (let j = 0; j < rg.core.length; j++) { const p = P[rg.core[j]]; mTmp.multiplyMatrices(BW[p.bone], p.m); coreMesh.setMatrixAt(d.c0 + j, mTmp); }
      if (wantDet) {
        if (d.detAt !== cur) { for (let j = 0; j < rg.det.length; j++) detMesh.setColorAt(cur + j, COL.set(P[rg.det[j]].c)); d.detAt = cur; colDirty = true; }
        for (let j = 0; j < rg.det.length; j++) { const p = P[rg.det[j]]; mTmp.multiplyMatrices(BW[p.bone], p.m); detMesh.setMatrixAt(cur + j, mTmp); }
        cur += rg.det.length;
      } else d.detAt = -1;
      { const lift = 1 / (1 + o.hop * 2), sh = o.drop ? 1.1 : 1; vP.set(o.x, o.y + 0.025, o.z); qT.setFromAxisAngle(AX, o.yaw); vS.set(rg.blobW * s * lift * sh, 1, rg.blobL * s * lift * sh); mTmp.compose(vP, qT, vS); blobMesh.setMatrixAt(i, mTmp); }
      if (d.tier || d.acc0 !== undefined) { d.m = d.m || new T.Matrix4(); d.m.copy(BW[0]); d.hm = d.hm || new T.Matrix4(); d.hm.copy(BW[1]); }
      if (d.collarCol === "rainbow") { coreMesh.setColorAt(d.c0 + rg.collarCore, COL.setHSL((rb + i * 0.13) % 1, 0.9, 0.55)); rainbow = true; }
      if (d.acc0 !== undefined) { // hats sit on the head bone, sized to the head
        const hat = rg.anchor.hat, kq = hat.w / 0.34;
        HATS[d.hat].forEach((a, j) => { vS.set(a[3] * kq, a[4] * kq, a[5] * kq);
          if (a[7] === "spin") { const an = t * 14 + d.ph, c = Math.cos(an), sn = Math.sin(an); vP.set((a[0] * c + a[2] * sn) * kq, hat.y + a[1] * kq, hat.z + (a[2] * c - a[0] * sn) * kq); qT.setFromAxisAngle(AX, an); mPart.compose(vP, qT, vS); }
          else { vP.set(a[0] * kq, hat.y + a[1] * kq, hat.z + a[2] * kq); mPart.compose(vP, qI, vS); } mTmp.multiplyMatrices(d.hm, mPart); accMesh.setMatrixAt(d.acc0 + j, mTmp); });
      }
    }
    const cp = camera.position, near = [];
    TIERED.forEach((d, i) => {
      if (!d.upd) return;
      const m = d.m, a = d.rig.anchor, c = a.collar;
      qColl.setFromAxisAngle(AXX, c.rx);
      vP.set(0, c.y, c.z); vS.set(c.w * 1.12, 0.075, 0.24); mPart.compose(vP, qColl, vS); mTmp.multiplyMatrices(m, mPart); blingMesh.setMatrixAt(i, mTmp);
      vP.set(a.medal[0], a.medal[1], a.medal[2]); vS.set(0.17, 0.17, 0.03); mPart.compose(vP, qI, vS); mTmp.multiplyMatrices(m, mPart); medalMesh.setMatrixAt(i, mTmp);
      // sparkles: little four-point stars orbiting the collar, each twinkling on its own beat (off when too far away to see)
      if (d.far) { if (!d.sparkOff) { for (let k = 0; k < SPARKS; k++) sparkMesh.setMatrixAt(i * SPARKS + k, ZERO); d.sparkOff = true; } if (d === focus) near.push([0, d]); return; }
      d.sparkOff = false;
      const e = m.elements; vR.set(e[0], e[1], e[2]).normalize(); vU.set(e[4], e[5], e[6]).normalize(); vF.set(e[8], e[9], e[10]).normalize();
      vC.set(0, c.y, c.z).applyMatrix4(m); const R = (c.w * 0.75 + 0.05) * d.scale;
      for (let k = 0; k < SPARKS; k++) {
        const an = t * 1.7 + (k * Math.PI * 2) / SPARKS + d.ph, tw = Math.max(0, Math.sin(t * 3.4 + k * 2.3 + d.ph * 3));
        vP.copy(vC).addScaledVector(vR, Math.cos(an) * R).addScaledVector(vU, Math.sin(an) * R * 0.8).addScaledVector(vF, 0.05 + Math.sin(an) * 0.04);
        const sz = (d.tier === "gold" ? 0.17 : 0.13) * d.scale * (0.2 + 0.8 * tw * tw);
        qT.copy(camera.quaternion).multiply(qR.setFromAxisAngle(AXZ, t * 2 + k)); vS.set(sz, sz, sz); mTmp.compose(vP, qT, vS); sparkMesh.setMatrixAt(i * SPARKS + k, mTmp);
      }
      if (d === focus) near.push([0, d]);
    });
    if (blingMesh) [blingMesh, medalMesh, sparkMesh].forEach((x) => (x.instanceMatrix.needsUpdate = true));
    // the selected dog's medal shows its collar number
    FACES.forEach((f, i) => {
      const it = near[i]; if (!it) { f.visible = false; f.dog = null; return; }
      const d = it[1], a = d.rig.anchor;
      if (f.dog !== d) { f.dog = d; drawFace(f, d); }
      vP.set(a.medal[0], a.medal[1], a.medal[2] + 0.017); vS.set(0.145, 0.145, 1); mPart.compose(vP, qI, vS); f.matrix.multiplyMatrices(d.m, mPart); f.matrixWorldNeedsUpdate = true; f.visible = true;
    });
    if (MAP.fade > 0) MAP.dots.instanceMatrix.needsUpdate = MAP.rings.instanceMatrix.needsUpdate = true;
    if (OVER) farMesh.instanceMatrix.needsUpdate = true; else { coreMesh.instanceMatrix.needsUpdate = true; blobMesh.instanceMatrix.needsUpdate = true; } detMesh.count = cur; if (cur) detMesh.instanceMatrix.needsUpdate = true; if (colDirty) detMesh.instanceColor.needsUpdate = true; if (rainbow) coreMesh.instanceColor.needsUpdate = true;
    if (accMesh) accMesh.instanceMatrix.needsUpdate = true;
  }

  /* ================= Marsh walks the lane ================= */
  const MARSH = { handle: "marsh", isMarsh: true };
  function updateMarsh(t) {
    const [z0, z1] = CITY.avenue, L = z0 - z1, u = (t * 1.5) / L, back = Math.floor(u) % 2 === 1, z = z0 - pingpong(u) * L;
    const mx = CITY.gate[0] - 0.5, cp = camera.position, far = (mx - cp.x) ** 2 + (z - cp.z) ** 2 > 48 * 48 && !followMarsh && selected !== MARSH;
    if (far) K.marsh.visible = false; else K.putMarsh(mx, 0, z, back ? 0 : Math.PI, { run: 1, phase: t * 11, wag: K.wag(t) }); // ~40 draw calls, so only when close
    MARSH.wx = mx; MARSH.wz = z; MARSH.wy = 1.15; marshBlob.position.set(mx, 0.025, z); marshBlob.visible = !far;
  }

  /* ================= Builds and the "next build" sign ================= */
  const animBuilds = [], BUILT = {}, ROOFS = [], LOD = [];
  // Staff dogs are detailed models (~30 draw calls each), and the cinema screen redraws a canvas, so each building only
  // shows its staff and runs its animations when the camera is within 34 m.
  function updateBuilds(t) {
    const cp = camera.position;
    LOD.forEach((b) => {
      const near = (cp.x - b.centre[0]) ** 2 + (cp.z - b.centre[1]) ** 2 < (b.near2 || 34 * 34);
      if (b.near !== near) { b.near = near; (b.staff || []).forEach((d) => (d.visible = near)); if (b.fx) b.fx.visible = near; }
      if (b.fx && near) b.fx.material.uniforms.uH.value = renderer.domElement.height * 0.5;
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
      if (set.pathSign) flatSign(SIGN_NAMES[b.type] || b.type.toUpperCase(), p.x, 0.04, p.z + 6.95, 8.5, 1.9, "#1f7fc0", "#ffffff"); // no roof: the name is painted on the path in front
      else roofSign(set, SIGN_NAMES[b.type] || b.type.toUpperCase());
    });
    // the next plot to fill gets the building site and its crane
    const next = PLOTS.findIndex((p, i) => !used.has(i));
    if (next >= 0) { const p = PLOTS[next]; const site = K.buildSite(p.x, p.z, p.yaw); site.group.visible = true; site.always = true; LOD.push(site); // the crane keeps swinging from afar
      flatSign("COMING SOON", p.x, 0.04, p.z + 6.95, 8.5, 1.9, "#e8a320", "#3a2a10"); } // painted on the path in front of the site
    animBuilds.push(CITY.anim);
  }

  // Flat signs on the roofs, facing the sky, so each building can be read from the top-down map (and from above in 3D)
  const SIGN_NAMES = { supermarket: "MARSH MART", library: "LIBRARY", gym: "MUSCLE MUTTS GYM", cinema: "CINEMA", waterpark: "WATERPARK" };
  const SIGNS = [];
  function flatSign(text, x, y, z, w, h, bg, fg) {
    const c = document.createElement("canvas"); c.width = 1024; c.height = Math.max(64, Math.round((1024 * h) / w)); const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = c.height * 0.07; g.strokeRect(g.lineWidth, g.lineWidth, c.width - g.lineWidth * 2, c.height - g.lineWidth * 2);
    let fs = c.height * 0.62; g.font = `900 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; const tw = g.measureText(text).width; if (tw > c.width * 0.86) { fs *= (c.width * 0.86) / tw; g.font = `900 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; }
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, c.height * 0.54);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); SIGNS.push(m); return m;
  }
  function roofSign(set, text) {
    set.group.updateWorldMatrix(true, true);
    const bb = new T.Box3().setFromObject(set.roof || set.group), w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z, sw = w * 0.82, sh = Math.min(d * 0.4, sw * 0.28);
    set.sign = flatSign(text, (bb.min.x + bb.max.x) / 2, bb.max.y + 0.05, (bb.min.z + bb.max.z) / 2, sw, sh, "#2f7a4a", "#fff8e6");
  }

  /* ================= Camera: drag to orbit, pinch or wheel to zoom, two fingers or right-drag to pan ================= */
  // Zoomed out past MAP_2D the sanctuary is a flat map (drawn once at load) with dogs as dots: smooth on any phone however
  // many dogs there are. Zoomed in past MAP_3D it's the full 3D world. In between, the camera tilts and the map fades.
  const MAP_3D = 58, MAP_2D = 72, mapK = () => { const u = clamp((cam.dist - MAP_3D) / (MAP_2D - MAP_3D), 0, 1); return u * u * (3 - 2 * u); };
  const HOME = { tx: 0, tz: -27, dist: 105, yaw: 0, pitch: 0.82 }; // the whole sanctuary, as the flat map
  const INTRO = { tx: 0, tz: -14, dist: 50, yaw: 0, pitch: 0.86 };  // first load: the map, then down into 3D by the gate
  const cam = { tx: 0, ty: 0, tz: -6, dist: 150, yaw: -0.5, pitch: 1.1 };
  let fly = null, followMarsh = false, selected = null, trackSel = false;
  function flyTo(to, dur) { fly = { from: { ...cam }, to: { ...cam, ...to }, t0: performance.now(), dur: dur || 1400 }; }
  // the furthest you can zoom out: the view's corners (turned any way) still on the baked map
  // (the view is a rectangle turned by the camera's yaw; ext() is how far it reaches along x and z per unit of distance)
  const ext = () => { const th = Math.tan((camera.fov * Math.PI) / 360), a = camera.aspect, c = Math.abs(Math.cos(cam.yaw)), s = Math.abs(Math.sin(cam.yaw)); return [th * (c * a + s), th * (s * a + c)]; };
  function mapMaxDist() { if (!MAP.box) return 190; const [ex, ez] = ext(); return Math.max(MAP_2D + 8, Math.min(MAP.box.w / 2 / ex, MAP.box.h / 2 / ez)); }
  function applyCam() {
    cam.pitch = clamp(cam.pitch, 0.1, 1.45); cam.tx = clamp(cam.tx, -100, 100); cam.tz = clamp(cam.tz, -120, 60);
    // never zoom or pan out past the edge of the map (the view's corners stay on it whichever way it's turned)
    if (MAP.box) {
      const B = MAP.box; cam.dist = clamp(cam.dist, 3, mapMaxDist());
      if (cam.dist > MAP_3D) { const [ex, ez] = ext(), rx = Math.max(0, B.w / 2 - ex * cam.dist), rz = Math.max(0, B.h / 2 - ez * cam.dist); cam.tx = clamp(cam.tx, B.cx - rx, B.cx + rx); cam.tz = clamp(cam.tz, B.cz - rz, B.cz + rz); }
    } else cam.dist = clamp(cam.dist, 3, 190);
    // between MAP_3D and MAP_2D the camera tilts towards straight down, so the switch to the flat map is seamless
    const k = mapK(), pitch = cam.pitch + (1.53 - cam.pitch) * k, cp = Math.cos(pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty + Math.sin(pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
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
    if (e.pointerType === "touch" && ptrs.size >= 2) return; // two-finger touch is handled by the touch events below
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
  // Two-finger pinch (zoom) and drag (pan) on phones, read straight from the touch events: this is what moves you between
  // the flat map and 3D, so it mustn't depend on pointer-event quirks.
  let tp = null;
  const tpOf = (e) => { const a = e.touches[0], b = e.touches[1]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2 }; };
  canvas.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { tp = { ...tpOf(e), dist: cam.dist }; if (down) down.moved = 99; } }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2 || !tp) return; e.preventDefault(); stopAuto(); hideHint();
    const n = tpOf(e); cam.dist = tp.dist * (tp.d / Math.max(20, n.d)); pan(n.mx - tp.mx, n.my - tp.my); tp.mx = n.mx; tp.my = n.my;
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => { if (e.touches.length < 2) tp = null; }, { passive: true });
  canvas.addEventListener("touchcancel", () => (tp = null), { passive: true });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); stopAuto(); cam.dist *= Math.exp(e.deltaY * 0.0012); hideHint(); }, { passive: false });
  function pan(dx, dy) { trackSel = false; const k = cam.dist * 0.0016, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); cam.tx -= (dx * c + dy * s) * k; cam.tz -= (-dx * s + dy * c) * k; }
  $("zin").onclick = () => { stopAuto(); flyTo({ dist: cam.dist * 0.6 }, 400); };
  $("zout").onclick = () => { stopAuto(); flyTo({ dist: cam.dist / 0.6 }, 400); };
  $("home").onclick = () => { stopAuto(); select(null); flyTo({ ...HOME, tx: MAP.box ? MAP.box.cx : HOME.tx, tz: MAP.box ? MAP.box.cz : HOME.tz, dist: mapMaxDist() }, 1300); }; // as far out as the map allows
  function setFollow(on) { followMarsh = on; $("tour").classList.toggle("on", on); if (on) { select(MARSH); } }
  $("tour").onclick = () => { if (followMarsh) return setFollow(false); fly = null; setFollow(true); flyTo({ dist: 13, pitch: 0.62 }, 1200); };
  window.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT") return; if (e.key === "Escape") { closeAll(); select(null); } });

  /* ================= Name tags and picking ================= */
  const tagsEl = $("tags"), POOL = [], V = new T.Vector3();
  for (let i = 0; i < 48; i++) { const el = document.createElement("div"); el.className = "tag"; el.hidden = true; el.addEventListener("click", () => el.dog && select(el.dog, true)); tagsEl.appendChild(el); POOL.push(el); }
  let W = innerWidth, H = innerHeight;
  function toScreen(x, y, z) { V.set(x, y, z).project(MAP.full ? MAP.cam : camera); return V.z > 1 ? null : { x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H }; }
  function updateTags() {
    // Tags go on the nearest dogs that are actually on screen. (Picking the nearest to the camera alone chose dogs below
    // or behind it, off the bottom of the screen, so the dogs you could see got none.)
    const cp = camera.position, range = clamp(cam.dist * 1.3, 14, 45), list = [];
    if (cam.dist < 50 && !MAP.full) DOGS.forEach((d) => {
      if (d === selected) { list.push([0, d]); return; }
      const dd = Math.hypot(d.wx - cp.x, d.wy - cp.y, d.wz - cp.z); if (dd > range) return;
      const sp = toScreen(d.wx, d.wy + 0.35, d.wz); if (sp && sp.x > -20 && sp.x < W + 20 && sp.y > 40 && sp.y < H - 20) list.push([dd, d]);
    });
    else if (selected && !selected.isMarsh) list.push([0, selected]);
    list.sort((a, b) => a[0] - b[0]);
    const show = list.slice(0, phone ? 14 : 40); // phones: fewer name tags (each one is moved on every frame) if (selected && selected !== MARSH && !show.some((x) => x[1] === selected)) show.push([0, selected]);
    const md = Math.hypot(MARSH.wx - cp.x, MARSH.wy - cp.y, MARSH.wz - cp.z); if ((md < range * 1.5 && !MAP.full) || selected === MARSH) show.push([md, MARSH]);
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
    document.body.classList.toggle("picked", !!d); goalPlace(); requestAnimationFrame(measureGap);
    K.beamG.visible = !!d && !d.isMarsh;
    if (!d) { card.hidden = true; if (location.search.includes("dog=")) history.replaceState(null, "", DEMO ? "?demo" : location.pathname); return; }
    closeAll(); card.hidden = false; hideHint();
    if (d.isMarsh) {
      $("cBadge").className = "badge marsh"; $("cBadge").textContent = "Owner";
      $("cName").textContent = "Marsh"; fitName(); $("cBreed").textContent = "Terrier. Puddle the duckling rides on his head.";
      $("cDoing").textContent = "Doing his rounds of the sanctuary"; $("cJoined").textContent = "1"; $("cKennel").textContent = "All of them"; $("cCollar").textContent = "Red";
      $("upgrade").hidden = true; $("share").textContent = "Share the sanctuary";
    } else {
      $("cBadge").className = "badge" + (d.tier ? " " + d.tier : d.collarCol === "rainbow" ? " rainbow" : "");
      $("cBadge").textContent = d.tier ? `${TIER[d.tier].name} collar · #${d.n}` : d.collarCol === "rainbow" ? "Rainbow collar" : `Dog #${d.n}`;
      $("cName").textContent = "@" + d.handle; fitName(); $("cBreed").textContent = d.breed + (d.hat ? ` · ${HAT_NAMES[d.hat] || d.hat}` : "");
      $("cDoing").textContent = d.act.text; $("cJoined").textContent = d.day; $("cKennel").textContent = `#${d.kennel}`; $("cCollar").textContent = collarName(d);
      $("upgrade").hidden = !(DATA.shop && DATA.shop.enabled); $("share").textContent = "Share my dog";
      history.replaceState(null, "", `?dog=${encodeURIComponent(d.handle)}${DEMO ? "&demo" : ""}`);
    }
    if (fly2 && !followMarsh) { const want = d.isMarsh ? cam.yaw : (d.wx > 0 ? -0.35 : 0.35), yaw = want + Math.PI * 2 * Math.round((cam.yaw - want) / (Math.PI * 2)); const inside = d.act && d.act.pose === "build" && d.spot; flyTo({ tx: d.wx, tz: d.wz, yaw: inside ? yaw * 0.3 : yaw, dist: inside ? 15 : Math.min(Math.max(cam.dist, 11), 12), pitch: inside ? 1.18 : 1.05 }, 1300); } // steep enough to see over buildings and the gate, and into the kennels
  }
  // long usernames shrink to fit on one line instead of breaking mid-word (down to 13px; past that they wrap)
  function fitName() { const el = $("cName"); el.style.fontSize = ""; el.style.whiteSpace = "nowrap"; let fs = 19; while (el.scrollWidth > el.clientWidth + 1 && fs > 13) el.style.fontSize = --fs + "px"; if (el.scrollWidth > el.clientWidth + 1) el.style.whiteSpace = ""; }
  $("card").querySelector("[data-close]").onclick = () => { select(null); if (followMarsh) setFollow(false); };
  $("upgrade").onclick = () => open("shop");
  $("share").onclick = async () => {
    const d = selected; if (!d) return;
    const url = `${location.origin}${location.pathname}?dog=${encodeURIComponent(d.handle)}`;
    const text = d.isMarsh ? "Come and see Marsh's Dog Sanctuary!" : `Meet my ${d.breed.toLowerCase()} in Marsh's Dog Sanctuary!`;
    if (navigator.share) { try { await navigator.share({ title: "Marsh's Dog Sanctuary", text, url }); } catch (e) { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) { toast(url, 6000); } // no clipboard: show the link to copy by hand
  };

  /* ================= Shop previews ================= */
  // One small offscreen renderer draws every cosmetic in turn, spinning and bobbing, and copies each frame into its
  // card's canvas. It only exists once the shop has been opened, and only runs while the shop is open.
  let PV = null;
  function shopModel(it) {
    const g = new T.Group(), mat = (c) => new T.MeshLambertMaterial({ color: c }); let spinG = null;
    const box = (x, y, z, w, h, d, c, ry, rz) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.set(0, ry || 0, rz || 0); g.add(m); return m; };
    if (it.id === "rainbow") { // a blocky ring of rainbow links with a gold tag
      const N = 14; for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; box(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2, 0.1, 0.075, 0.05, `hsl(${(k / N) * 360}, 90%, 55%)`, a); }
      box(0, -0.075, 0.215, 0.07, 0.07, 0.02, "#ffd23a"); box(0, -0.03, 0.212, 0.02, 0.04, 0.015, "#c89a1a"); g.rotation.x = 1.0; // tipped towards you so it reads as a ring
    } else (HATS[it.id] || PREVIEW[it.id] || []).forEach((p) => { const m = box(p[0], p[1] + p[4] / 2, p[2], p[3], p[4], p[5], p[6]); if (p[7] === "spin") { if (!spinG) { spinG = new T.Group(); g.add(spinG); } spinG.add(m); } });
    const bb = new T.Box3().setFromObject(g), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
    const inner = new T.Group(); g.children.slice().forEach((m) => inner.add(m)); inner.position.sub(c); inner.rotation.copy(g.rotation); g.rotation.set(0, 0, 0); g.add(inner);
    g.userData.size = Math.max(sz.x, sz.y, sz.z); g.userData.spin = spinG; g.visible = false; return g;
  }
  function drawShop(t) {
    const canvases = SHOPEL.querySelectorAll("canvas"); if (!canvases.length) return;
    if (!PV) {
      const r = new T.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(1); r.setSize(200, 200, false); r.outputColorSpace = renderer.outputColorSpace;
      const sc = new T.Scene(); sc.add(new T.HemisphereLight("#ffffff", "#8a7a6a", 2.2)); const sun = new T.DirectionalLight("#ffffff", 2.0); sun.position.set(2, 3, 4); sc.add(sun);
      PV = { r, sc, cam: new T.PerspectiveCamera(32, 1, 0.01, 20), models: [] };
    }
    if (PV.models.length !== SHOP.length) { PV.models.forEach((m) => PV.sc.remove(m)); PV.models = SHOP.map((it) => { const m = shopModel(it); PV.sc.add(m); return m; }); }
    canvases.forEach((cv) => {
      const i = +cv.dataset.i, m = PV.models[i], it = SHOP[i]; if (!m) return;
      PV.models.forEach((x) => (x.visible = x === m));
      const spin = it.soon ? 0.6 : 1.2; if (m.userData.spin) m.userData.spin.rotation.y = t * 12; m.rotation.y = t * spin + i; m.position.y = Math.sin(t * 2 + i) * m.userData.size * 0.06;
      const D = m.userData.size * 2.6; PV.cam.position.set(0, D * 0.28, D); PV.cam.lookAt(0, 0, 0);
      PV.r.render(PV.sc, PV.cam); const ctx = cv.getContext("2d"); ctx.clearRect(0, 0, 200, 200); ctx.drawImage(PV.r.domElement, 0, 0, 200, 200);
    });
  }

  /* ================= The 10,000-dog goal ================= */
  // A bar across the bottom of the header: how close the sanctuary is to 10,000 dogs, when a new location opens.
  // Tap it for what that means. It hides while a panel or a dog's card is open (CSS: body.panel-open / body.picked), and the
  // demo banner follows the header's bottom edge. Cheap: drawn once, the fill slides in with a transform (no layout), and
  // the shine runs twice and stops, so nothing keeps animating over the 3D view.
  const GOAL = 10000;
  function goalPlace() { const g = $("goal"); if (!g) return; const b = document.querySelector(".top").getBoundingClientRect(); $("demo").style.top = Math.round(b.bottom + 8) + "px"; }
  function goalBar(total) {
    let g = $("goal");
    if (!g) {
      g = document.createElement("button"); g.id = "goal"; g.type = "button"; g.className = "goal";
      g.innerHTML = `<span class="goal-row"><span class="goal-track"><span class="goal-fill"></span></span><span class="goal-tag">🔒 New location</span></span><span class="goal-text"></span>`;
      document.querySelector(".top").appendChild(g);
      g.onclick = () => toast(`At ${GOAL.toLocaleString()} dogs, Marsh opens a brand-new location! Every new follower is a new dog, so share the sanctuary to get there faster.`, 5200, true);
      addEventListener("resize", goalPlace, { passive: true }); requestAnimationFrame(goalPlace);
    }
    const n = Math.max(0, Math.min(total, GOAL)), pct = (n / GOAL) * 100;
    g.querySelector(".goal-text").innerHTML = n >= GOAL ? `<b>${GOAL.toLocaleString()} dogs!</b> The new location is opening` : `<b>${n.toLocaleString()}</b> / ${GOAL.toLocaleString()} dogs · <b>${(GOAL - n).toLocaleString()}</b> to go until the new location`;
    g.setAttribute("aria-label", `${n.toLocaleString()} of ${GOAL.toLocaleString()} dogs. A new location opens at ${GOAL.toLocaleString()}.`);
    requestAnimationFrame(() => requestAnimationFrame(() => (g.querySelector(".goal-fill").style.transform = `translateX(${Math.max(2, pct) - 100}%)`))); // grows in on load
  }

  /* ================= Search ================= */
  $("find").addEventListener("submit", (e) => {
    e.preventDefault(); const q = norm($("q").value); if (!q) return;
    if (q === "marsh") { select(MARSH, true); return; }
    let d = BYNAME.get(q); if (!d) d = DOGS.find((x) => x.handle.startsWith(q)) || DOGS.find((x) => x.handle.includes(q));
    if (d) { stopAuto(); select(d, true); $("q").blur(); if (norm(d.handle) !== q) toast(`Closest match: @${d.handle}`); }
    else { select(null); toast(`No dog for @${q} yet. New dogs move in with each video. Follow and comment your breed on the newest reel!`, 4200); }
  });

  /* ================= Sheets, toast, hint ================= */
  const SHEETS = ["info", "log", "shop"];
  // body.panel-open while a panel is open (the goal bar hides then, so it never sits over anything)
  const sheetState = () => { document.body.classList.toggle("panel-open", [...document.querySelectorAll(".sheet")].some((s) => !s.hidden)); goalPlace(); };
  { const mo = new MutationObserver(sheetState); document.querySelectorAll(".sheet").forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ["hidden"] })); } // (also catches panels opened by other code, like Your dog in 3D)
  function closeAll() { SHEETS.forEach((s) => ($(s).hidden = true)); sheetState(); }
  function open(id) { const was = !$(id).hidden; closeAll(); if (selected) select(null); else $("card").hidden = true; if (!was) $(id).hidden = false; sheetState(); } // (a full deselect, so the search bar and buttons come back)
  document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => open(b.dataset.open)));
  // "terms" links open How it works with the terms dropdown already open
  document.querySelectorAll("[data-terms]").forEach((b) => (b.onclick = () => { open("info"); const t = $("terms"); t.open = true; requestAnimationFrame(() => t.scrollIntoView({ block: "start", behavior: "smooth" })); }));
  SHEETS.forEach((s) => ($(s).querySelector("[data-close]").onclick = () => { $(s).hidden = true; sheetState(); }));
  let toastT = 0; function toast(msg, ms, words) { const el = $("toast"); el.textContent = msg; el.classList.toggle("words", !!words); /* words: wrap between words (other toasts may hold long links) */ el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms || 2200); }
  let hinted = false; function hideHint() { if (hinted) return; hinted = true; $("hint").style.opacity = 0; }

  function fillPage() {
    const ig = DATA.instagram || "marshwhatif", igUrl = `https://www.instagram.com/${ig}/`;
    $("follow").href = igUrl; document.querySelectorAll(".ig").forEach((el) => (el.textContent = "@" + ig));
    $("goldN").textContent = DATA.goldCollars; $("silverA").textContent = (DATA.goldCollars + 1).toLocaleString(); $("silverB").textContent = DATA.silverCollars.toLocaleString();
    const gold = DOGS.filter((d) => d.tier === "gold").length, silver = DOGS.filter((d) => d.tier === "silver").length, silverN = DATA.silverCollars - DATA.goldCollars;
    const total = Math.max(DOGS.length, +DATA.followers || 0); // the follower count, even before every follower has a dog on the map
    $("stats").innerHTML = `<b>Day ${DATA.day}</b> · <b>${total.toLocaleString()}</b> ${total === 1 ? "dog" : "dogs"} · 🥇 <b>${gold}/${DATA.goldCollars}</b> · 🥈 <b>${silver}/${silverN}</b>`;
    { // only if it would wrap (bigger numbers on a phone): shrink the line a little so it stays on one line; otherwise untouched
      const el = $("stats"); el.style.fontSize = ""; el.style.whiteSpace = "";
      if (el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).fontSize) * 1.8) { el.style.whiteSpace = "nowrap"; let fs = 13; while (el.scrollWidth > el.clientWidth && fs > 10.5) el.style.fontSize = (fs -= 0.5) + "px"; } }
    goalBar(total);
    if (!DOGS.length) $("hint").textContent = "No dogs yet. Follow to be the first!";
    $("names").innerHTML = DOGS.length < 3000 ? DOGS.map((d) => `<option value="@${esc(d.handle)}">`).join("") : "";
    $("logList").innerHTML = DATA.log.slice().sort((a, b) => b.day - a.day).map((l) => `<li><div class="d">Day ${l.day}${l.date ? " · " + esc(l.date) : ""}</div><h3>${esc(l.title)}</h3>${l.text ? `<p>${esc(l.text)}</p>` : ""}${l.reel ? `<a href="${esc(l.reel)}" target="_blank" rel="noopener">Watch Day ${l.day} ↗</a>` : ""}</li>`).join("");
    const shop = DATA.shop || {};
    $("shopBtn").hidden = !shop.enabled;
    $("shopNote").textContent = shop.note || "";
    SHOP = (shop.items && shop.items.length ? shop.items : SHOP_DEFAULT).filter((it) => it && (it.id === "rainbow" || HATS[it.id] || PREVIEW[it.id]));
    $("coffee").href = /^https:\/\//.test(shop.coffee || "") ? shop.coffee : "https://ko-fi.com/marshtown";
    const card = (it, i) => {
      if (it.kind === "request") return `<li class="req"><div class="pv"><canvas data-i="${i}" width="200" height="200" aria-hidden="true"></canvas></div><div class="nm">${esc(it.name)}</div><a class="buy dm" href="https://ig.me/m/${esc(ig)}" target="_blank" rel="noopener">DM your idea</a></li>`;
      const live = !it.soon && it.link && /^https:\/\//.test(it.link);
      if (it.soon) return `<li class="soon"><div class="pv"><canvas data-i="${i}" width="200" height="200" aria-hidden="true"></canvas><span class="ribbon">Coming soon</span></div><div class="nm">${esc(it.name)}</div><span class="buy off">🔒 Not on sale yet</span></li>`;
      const btn = live ? `<a class="buy" href="${esc(it.link)}" target="_blank" rel="noopener">Buy on Ko-fi</a>` : `<span class="buy off">Opens soon</span>`;
      return `<li><div class="pv"><canvas data-i="${i}" width="200" height="200" aria-hidden="true"></canvas></div><div class="nm">${esc(it.name)}</div>${it.price ? `<div class="pr">${esc(it.price)}</div>` : ""}${btn}</li>`;
    };
    $("shopList").innerHTML = SHOP.map((it, i) => (it.soon ? "" : card(it, i))).join("");
    $("soonList").innerHTML = SHOP.map((it, i) => (it.soon ? card(it, i) : "")).join("");
    $("soonH").hidden = !SHOP.some((it) => it.soon);
    $("demo").hidden = !DEMO; if (DEMO && DATA.updated !== "demo") $("demo").textContent = `Demo: Day ${DATA.day} preview, not live yet`;
  }

  /* ================= Loop ================= */
  function resize() { requestAnimationFrame(measureGap); W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W < H ? 58 : 46; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize);
  let viewOff = 0, shadowDirty = true, lightKey = "", lightWant = "", lightSince = 0;
  const SHOPEL = $("shop"), CARD = $("card"), TOPBAR = document.querySelector(".top"), GAP = { mid: 0 };
  // measured only when the card opens or the screen turns, never per frame (reading layout every frame is slow)
  function measureGap() { if (CARD.hidden) return; GAP.mid = (TOPBAR.getBoundingClientRect().bottom + CARD.getBoundingClientRect().top) / 2; }
  const PERF = { js: 0, gap: 16, last: 0 };
  const LAST = { dogs: 0, render: 0, tags: 0 };
  let lastInput = 0, skip = 0, slow = 0;
  ["pointerdown", "pointermove", "wheel", "keydown"].forEach((ev) => addEventListener(ev, () => (lastInput = performance.now()), { passive: true }));
  let rafLast = 0, rafGap = 16.7; // how often the browser actually offers a frame (iPhones in Low Power Mode: only 30 a second)
  function frame(now) {
    if (rafLast && now - rafLast < 200) rafGap = rafGap * 0.9 + (now - rafLast) * 0.1; rafLast = now;
    // on phones that run at 60, draw every other frame (30 fps) when nobody has touched the screen for 2.5 s, to save battery.
    // Never on a phone that's already at 30: that would drop it to 15.
    const idle = phone && rafGap < 22 && !fly && !followMarsh && now - lastInput > 2500;
    if (idle && (skip++ & 1)) { requestAnimationFrame(frame); return; }
    const t0 = performance.now(), gap = now - (PERF.last || now);
    PERF.gap = PERF.gap * 0.95 + gap * 0.05; PERF.last = now;
    // If frames keep arriving late (half again slower than the browser's own rate) while in use, lower the resolution a
    // step, but not below 1.15x; only then drop shadows. (This used to count every 30 fps frame as slow and gave up quality for nothing.)
    if (!idle && gap > 0 && gap < 500) { slow = gap > rafGap * 1.5 + 4 ? slow + 1 : Math.max(0, slow - 2); if (slow > 90) { slow = 0; if (pixelRatio > 1.15) { pixelRatio = Math.max(1.15, pixelRatio - 0.15); renderer.setPixelRatio(pixelRatio); resize(); } else if (K.sun.castShadow) K.sun.castShadow = false; } }
    frameSteps(now);
    PERF.js = PERF.js * 0.95 + (performance.now() - t0) * 0.05;
    requestAnimationFrame(frame);
  }
  function frameSteps(now) {
    const t = now / 1000;
    if (fly) { const u = clamp((now - fly.t0) / fly.dur, 0, 1), e = ease(u); for (const k in fly.to) cam[k] = fly.from[k] + (fly.to[k] - fly.from[k]) * e; if (u >= 1) fly = null; }
    updateMarsh(t); const tA = performance.now(); updateDogs(t, selected); LAST.dogs = performance.now() - tA;
    if (followMarsh) { cam.tx += (MARSH.wx - cam.tx) * 0.08; cam.tz += (MARSH.wz - cam.tz) * 0.08; }
    else if (selected && trackSel && !fly && !selected.isMarsh && Number.isFinite(selected.wx + selected.wz) && selected.act.pose !== "lie" && selected.act.pose !== "sit") { cam.tx += (selected.wx - cam.tx) * 0.05; cam.tz += (selected.wz - cam.tz) * 0.05; }
    if (selected && !selected.isMarsh) K.beam.position.set(selected.wx, 7, selected.wz);
    if (!MAP.full) { animBuilds.forEach((f) => f(t)); updateBuilds(t); }
    if (!SHOPEL.hidden) drawShop(t);
    // on phones, keep the picked dog in the middle of the clear gap between the top bar and the card
    const off = !CARD.hidden && W < 700 && H > W ? H / 2 - GAP.mid : 0; viewOff += (off - viewOff) * 0.12;
    if (Math.abs(viewOff) > 0.5) camera.setViewOffset(W, H, 0, viewOff, W, H); else camera.clearViewOffset();
    // roofs lift off when you zoom in on a building, so you can see who's inside
    ROOFS.forEach((b) => { b.roof.visible = !(cam.dist < 36 && Math.hypot(cam.tx - b.centre[0], cam.tz - b.centre[1]) < 15); if (b.sign) b.sign.visible = b.roof.visible; });
    applyCam();
    // the sun's shadow box follows the camera, snapped to its texels so shadows don't shimmer
    // the shadow box follows the camera in steps; shadows are redrawn when it moves, and otherwise only as often as the
    // dogs nearby need (every 2nd frame up close, every 8th from afar)
    // The sun's shadow box comes in three sizes and moves in big steps, and only once the camera has settled for a moment,
    // so zooming and panning don't redraw the shadow map every few frames (that was the main stutter, on first load too).
    updateMap(now);
    if (!MAP.full) { const lvl = cam.dist < 26 ? 24 : 52, step = lvl / 4, sx = Math.round(cam.tx / step) * step, sz = Math.round(cam.tz / step) * step, key = sx + "," + sz + "," + lvl;
      if (key !== lightWant) { lightWant = key; lightSince = now; }
      if (lightWant !== lightKey && (!lightKey || now - lightSince > 220)) { lightKey = lightWant; K.light("day", sx, sz, lvl, 420); shadowDirty = true; } }
    if (!MAP.full && (shadowDirty || (cam.dist < 58 && FRAME % 90 === 0))) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; } // only still things cast shadows now, so this is rare
    K.sky.position.copy(camera.position);
    if (MAP.full) K.lifeG.visible = false; else if (cam.dist < 45) K.life(t, cam.tx, cam.tz, clamp(cam.dist * 0.25, 4, 14), true); else K.lifeG.visible = false; // butterflies are invisible from far away
    const tR = performance.now();
    if (MAP.full) renderer.render(MAP.scene, MAP.cam); // the flat map alone: one picture and some dots
    else { K.stage.render(); if (MAP.fade > 0) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(MAP.scene, MAP.cam); renderer.autoClear = true; } }
    LAST.render = performance.now() - tR;
    const tT = performance.now(); updateTags(); LAST.tags = performance.now() - tT;
  }

  // iPhone Safari ignores user-scalable=no, so stop its pinch gesture zooming the page (pinches on the 3D view still zoom the camera)
  ["gesturestart", "gesturechange"].forEach((ev) => document.addEventListener(ev, (e) => { if (!e.target.closest || !e.target.closest("#view")) e.preventDefault(); }, { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 && !e.target.closest("#view")) e.preventDefault(); }, { passive: false });

  /* ================= The flat map ================= */
  const MAP = { scene: new T.Scene(), cam: new T.OrthographicCamera(-1, 1, 1, -1, 1, 700), fade: 0, full: false, dots: null, rings: null, sel: null, plane: null };
  const DOTGEO = new T.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
  const mapMat = (c, o) => new T.MeshBasicMaterial(Object.assign({ color: c, transparent: true, depthTest: false, depthWrite: false }, o || {}));
  function mapDot(d, i) {
    const s = d.scale * 1.0; mTmp.compose(vP.set(d.wx, 0.6, d.wz), qI, vS.set(s, 1, s)); MAP.dots.setMatrixAt(i, mTmp); // dogs indoors show through the roof; the name sign is drawn over them
    const r = d.tier ? s * 1.45 : 0; mTmp.compose(vP, qI, vS.set(r, 1, r)); MAP.rings.setMatrixAt(i, mTmp);
  }
  // Draw the whole sanctuary once, straight down, into a texture (behind the loading screen). Dogs, Marsh, clouds and other
  // moving things are hidden for it; they're drawn live on top as dots.
  function bakeMap() {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    CITY.kennels.concat(PLOTS).forEach((k) => { x0 = Math.min(x0, k.x); x1 = Math.max(x1, k.x); z0 = Math.min(z0, k.z); z1 = Math.max(z1, k.z); });
    x0 -= 55; x1 += 55; z0 -= 75; z1 += 80; // wide enough that a phone held upright can see the whole sanctuary
    const w = x1 - x0, h = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const max = Math.min(phone ? 3072 : 4096, renderer.capabilities.maxTextureSize), pw = w >= h ? max : Math.round((max * w) / h), ph = h >= w ? max : Math.round((max * h) / w);
    const rt = new T.WebGLRenderTarget(pw, ph, { samples: phone ? 0 : 4 }); // (phones: no multisampling, to keep memory down) rt.texture.generateMipmaps = true; rt.texture.minFilter = T.LinearMipmapLinearFilter; rt.texture.anisotropy = 4;
    const oc = new T.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 600); oc.position.set(cx, 300, cz); oc.up.set(0, 0, -1); oc.lookAt(cx, 0, cz);
    const clouds = CITY.group.getObjectByName("clouds");
    const hide = [coreMesh, detMesh, farMesh, blobMesh, blingMesh, medalMesh, sparkMesh, accMesh, K.marsh, marshBlob, K.lifeG, K.beamG, K.sky, clouds, ...FACES].filter(Boolean);
    LOD.forEach((b) => { (b.staff || []).forEach((st) => hide.push(st)); if (b.fx) hide.push(b.fx); });
    const was = hide.map((o) => o.visible); hide.forEach((o) => (o.visible = false));
    const roofsWas = ROOFS.map((b) => b.roof.visible); ROOFS.forEach((b) => { b.roof.visible = true; if (b.sign) b.sign.visible = true; });
    const kh = CITY.kennelHi.visible, kl = CITY.kennelLo.visible; CITY.kennelHi.visible = true; CITY.kennelLo.visible = false;
    K.light("day", cx, cz, Math.max(w, h) / 2 + 4, 420); K.sun.shadow.camera.far = 400; K.sun.shadow.camera.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true;
    const fog = scene.fog; scene.fog = null; // (after K.light, which sets the fog)
    // the grass colour beyond the map's edge comes from a tiny render of plain grass (no trees there: they're inside x0)
    const px = new T.WebGLRenderTarget(4, 4), oc2 = new T.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 1, 600), buf = new Uint8Array(4);
    oc2.position.set(cx + 20, 300, 200); oc2.up.set(0, 0, -1); oc2.lookAt(cx + 20, 0, 200); // plain grass: south of every tree
    try { renderer.setRenderTarget(rt); renderer.render(scene, oc); renderer.setRenderTarget(px); renderer.render(scene, oc2); renderer.readRenderTargetPixels(px, 1, 1, 1, 1, buf); }
    finally { scene.fog = fog; renderer.setRenderTarget(null); px.dispose(); }
    scene.fog = fog; hide.forEach((o, i) => (o.visible = was[i])); ROOFS.forEach((b, i) => { b.roof.visible = roofsWas[i]; if (b.sign) b.sign.visible = roofsWas[i]; });
    CITY.kennelHi.visible = kh; CITY.kennelLo.visible = kl; lightKey = lightWant = ""; shadowDirty = true;
    MAP.box = { cx, cz, w, h }; MAP.bg = new T.Color().setRGB(buf[0] / 255, buf[1] / 255, buf[2] / 255);
    MAP.plane = new T.Mesh(new T.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mapMat("#ffffff", { map: rt.texture })); MAP.plane.position.set(cx, 0, cz); MAP.plane.renderOrder = 0; MAP.scene.add(MAP.plane);
    const n = Math.max(1, DOGS.length);
    MAP.rings = new T.InstancedMesh(DOTGEO, mapMat("#ffffff"), n); MAP.rings.renderOrder = 1; MAP.rings.frustumCulled = false;
    MAP.dots = new T.InstancedMesh(DOTGEO, mapMat("#ffffff"), n); MAP.dots.renderOrder = 2; MAP.dots.frustumCulled = false;
    DOGS.forEach((d, i) => { MAP.dots.setColorAt(i, COL.set(d.rig.farC)); MAP.rings.setColorAt(i, COL.set(d.tier ? TIER[d.tier].collar : "#ffffff")); MAP.dots.setMatrixAt(i, ZERO); MAP.rings.setMatrixAt(i, ZERO); });
    if (!DOGS.length) { MAP.dots.setColorAt(0, COL.set("#ffffff")); MAP.rings.setColorAt(0, COL.set("#ffffff")); }
    [MAP.rings, MAP.dots].forEach((m) => { m.instanceColor.needsUpdate = true; MAP.scene.add(m); });
    MAP.marsh = new T.Mesh(DOTGEO, mapMat("#c98a46")); MAP.marsh.scale.set(2, 1, 2); MAP.marsh.renderOrder = 3; MAP.scene.add(MAP.marsh);
    MAP.marshRing = new T.Mesh(DOTGEO, mapMat("#ffc61a")); MAP.marshRing.scale.set(3, 1, 3); MAP.marshRing.renderOrder = 2; MAP.scene.add(MAP.marshRing);
    // the building names go on top of everything on the map, so dots never cover them
    MAP.signs = SIGNS.map((m) => { const c = new T.Mesh(m.geometry, mapMat("#ffffff", { map: m.material.map })); c.position.copy(m.position); c.position.y = 1; c.renderOrder = 5; MAP.scene.add(c); return c; });
    MAP.sel = new T.Mesh(new T.RingGeometry(0.62, 0.8, 24).rotateX(-Math.PI / 2), mapMat("#ffffff")); MAP.sel.renderOrder = 4; MAP.scene.add(MAP.sel);
  }
  function updateMap(now) {
    if (!MAP.plane) return;
    const want = cam.dist >= MAP_2D - 0.5, dt = clamp((now - (MAP.last || now)) / 1000, 0, 0.1); MAP.last = now;
    MAP.fade = clamp(MAP.fade + (want ? dt : -dt) / 0.25, 0, 1);
    const full = MAP.fade >= 1;
    MAP.full = full; // (same resolution as 3D: changing it mid-zoom caused a hitch)
    if (!MAP.fade) return;
    const halfH = cam.dist * Math.tan((camera.fov * Math.PI) / 360), halfW = halfH * camera.aspect, c = MAP.cam;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH; c.updateProjectionMatrix();
    c.position.set(cam.tx, 400, cam.tz); c.up.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)); c.lookAt(cam.tx, 0, cam.tz);
    const op = MAP.fade; [MAP.plane, MAP.dots, MAP.rings, MAP.marsh, MAP.marshRing, MAP.sel, ...MAP.signs].forEach((m) => (m.material.opacity = op));
    MAP.scene.background = MAP.full ? MAP.bg : null;
    // building names never shrink below about 20 px tall on screen (they grow past their roof when zoomed right out)
    const pxPerM = H / (2 * halfH); MAP.signs.forEach((m) => { const k = Math.max(1, 20 / (m.geometry.parameters.height * pxPerM)); m.scale.set(k, 1, k); });
    MAP.marsh.position.set(MARSH.wx || 0, 0.7, MARSH.wz || 0); MAP.marshRing.position.set(MARSH.wx || 0, 0.65, MARSH.wz || 0);
    const sd = selected; MAP.sel.visible = !!sd;
    if (sd) { const p = 1 + Math.sin(now / 160) * 0.12, s = (sd.isMarsh ? 3.4 : (sd.scale || 1) * 2.4) * p; MAP.sel.scale.set(s, 1, s); MAP.sel.position.set(sd.wx, 0.8, sd.wz); }
  }

  // ?debug shows a live speed readout (for checking on a real phone)
  if (params.has("debug")) {
    const el = document.createElement("div"); el.id = "debug"; document.body.appendChild(el); let f0 = FRAME, t0 = performance.now();
    (function tick() { const now = performance.now(); if (now - t0 > 500) { const fps = ((FRAME - f0) * 1000) / (now - t0); f0 = FRAME; t0 = now; // frames actually drawn
      el.textContent = `${fps.toFixed(0)} fps (screen ${(1000 / rafGap).toFixed(0)})  ${PERF.js.toFixed(1)} ms js\n${MAP.full ? "2D map" : MAP.fade > 0 ? "fading" : OVER ? "3D far" : "3D"}  zoom ${cam.dist.toFixed(0)}\n${renderer.info.render.calls} calls  ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris\npx ${renderer.getPixelRatio()}  ${W}x${H}  shadows ${K.sun.castShadow ? "on" : "off"}`; }
      requestAnimationFrame(tick); })();
  }

  /* ================= Boot ================= */
  async function boot() {
    try {
      DATA = DEMO ? await fetch("data/preview.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) || demoData() : await fetch("data/sanctuary.json", { cache: "no-cache" }).then((r) => r.json());
    } catch (e) { DATA = { day: 1, dogs: [], builds: [], log: [], goldCollars: 100 }; toast("Couldn't load today's dogs. Try refreshing."); }
    DATA.goldCollars = DATA.goldCollars || 100; DATA.silverCollars = DATA.silverCollars || 600;
    DATA.log = Array.isArray(DATA.log) ? DATA.log : []; DATA.day = DATA.day || 1;
    // tolerate hand-edited data: drop duplicates, give missing numbers the next free one, fill in breed and day
    const seen = new Set(); let maxN = 0;
    DOGS = (Array.isArray(DATA.dogs) ? DATA.dogs : []).filter((d) => d && typeof d.handle === "string" && d.handle.trim() && !d.removed && !seen.has(norm(d.handle)) && seen.add(norm(d.handle)));
    DOGS.forEach((d) => { d.n = Number.isFinite(+d.n) && +d.n > 0 ? +d.n : 0; maxN = Math.max(maxN, d.n); });
    DOGS.forEach((d) => { if (!d.n) d.n = ++maxN; });
    DOGS.sort((a, b) => a.n - b.n);
    DOGS.forEach((d) => { d.handle = d.handle.trim().replace(/^@+/, ""); if (d.model === "chocolate") { d.model = "lab"; d.look = d.look || "chocolate"; } d.model = LPB.LABEL[d.model] ? d.model : "mutt"; d.look = String(d.look || ""); d.breed = String(d.breed || LPB.LABEL[d.model]); d.day = d.day || DATA.day; BYNAME.set(norm(d.handle), d); });
    const bseen = new Set(); BUILDS = (Array.isArray(DATA.builds) ? DATA.builds : []).filter((b) => b && BUILDERS[b.type] && !bseen.has(b.type) && bseen.add(b.type)); // each kind once
    window.SANCTUARY = { DOGS, BUILT, select: (h) => select(BYNAME.get(norm(h)), true), view: (o) => { fly = null; Object.assign(cam, o); }, bench: (n = 60) => { // runs n frames back to back and times each step (CPU only; the GPU work isn't counted)
      const T0 = performance.now(), r = { dogs: 0, render: 0, tags: 0, rest: 0 };
      for (let i = 0; i < n; i++) { const now = T0 + i * 16.7, a = performance.now(); frameSteps(now); r.rest += performance.now() - a - (LAST.dogs + LAST.render + LAST.tags); r.dogs += LAST.dogs; r.render += LAST.render; r.tags += LAST.tags; }
      for (const k in r) r[k] = +(r[k] / n).toFixed(2); r.calls = renderer.info.render.calls; r.tris = renderer.info.render.triangles; return r; },
    shot: () => { frameSteps(performance.now()); return renderer.domElement.toDataURL("image/jpeg", 0.8); }, // debugging: the frame as an image
    map: () => ({ fade: MAP.fade, full: MAP.full, dist: cam.dist, tx: cam.tx, tz: cam.tz, baked: !!MAP.plane }),
    perf: () => ({ cpuMs: +PERF.js.toFixed(2), frameMs: +PERF.gap.toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr: renderer.getPixelRatio() }) };
    setupBuilds(); setupDogs(); fillPage(); resize();
    // anything that moves gets a blob shadow (or none) instead of a shadow-map shadow, which would lag behind it
    const noCast = (o) => o && o.traverse((c) => (c.castShadow = false));
    noCast(K.marsh); noCast(K.lifeG); LOD.forEach((b) => (b.staff || []).forEach(noCast)); shadowDirty = true;
    updateMarsh(0); updateDogs(0); applyCam();
    requestAnimationFrame(frame);
    // compile every shader and draw the shadow map once behind the loading screen, so the first seconds don't stutter
    try { bakeMap(); } catch (e) { MAP.plane = null; console.warn("map bake failed", e); } // no map: the 3D view simply carries on zoomed out
    try {
      const lod = [farMesh, CITY.kennelLo]; lod.forEach((m) => (m.visible = true));
      renderer.compile(scene, camera); if (MAP.plane) renderer.compile(MAP.scene, MAP.cam);
      lod.forEach((m) => (m.visible = false));
    } catch (e) { /* older browsers */ }
    setTimeout(() => $("loading").classList.add("gone"), 250);
    const want = norm(params.get("dog"));
    const target = want && (want === "marsh" ? MARSH : BYNAME.get(want));
    if (target) { setTimeout(() => select(target, true), 300); hideHint(); }
    else { flyTo(INTRO, 3200); if (want) toast(`No dog for @${want} yet. New dogs move in with each video.`, 3500); }
  }
  boot();
})();
