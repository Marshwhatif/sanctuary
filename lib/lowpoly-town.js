/* lowpoly-town.js: the sanctuary town for the Marsh "Day N" series.
   Load after lowpoly-sanctuary.js, then LPT.install(K) after LPS.install(K). Use it with K.buildSanctuary({ open: true, town: true }).

   K.buildTown(): streets, pavements, lamps, benches and planters east of the kennels. Returns { group, SLOTS }:
     8 building plots [x, z], 13 m wide and 11 m deep, fronts facing +z (towards the gate and the usual camera).
   K.buildCity(): the sanctuary as one tight square of kennel pads and building plots (see below). Use it instead of buildSanctuary + buildTown.
   K.buildSupermarket(x, z, yaw), K.buildLibrary, K.buildGym, K.buildCinema: yaw turns the front (+z) to face any road. Each returns
     { group, roof, anim(t), spots, centre }. Hide .roof to look inside. .spots are places for visiting dogs in world space:
     { x, z, y, yaw, pose: "stand" | "sit" | "lie" | "run" | "hop" | "pace", dx, dz } (pace walks back and forth by dx, dz).
     Each building has its own staff dogs (blocky K.breed dogs with aprons, caps, glasses or hard hats), listed in .staff
     so a page can hide them when the camera is far away (each is ~30 draw calls).
   K.buildSite(x, z): the "coming soon" building site: hoarding with signs, a slewing tower crane with a hanging load,
     steel frame and scaffolding, excavator, cement mixer, site office, materials and builder dogs. Returns { group, anim(t), centre }.
   K.TOWN_BUILDS: { supermarket, library, gym, cinema } -> builder, for data-driven scenes. */
(function () {
  function install(K) {
    const { T, blocks, group, canvasBoard, rng, flat } = K;
    const PAL = ["#e2483a", "#2f8fe0", "#f0b52e", "#27b39a", "#ee6f9b", "#7a58d8", "#ff8a3a", "#5ad86a", "#ffffff", "#3a3a48"];

    /* ---- Shared helpers ---- */
    // A building kit: L solid boxes, R roof boxes (hideable), G glass, E glowing. Box rows are [x, y(bottom), z, w, h, d, colour, yaw].
    function kit(ox, oz, yaw) {
      const Y = yaw || 0, cs = Math.cos(Y), sn = Math.sin(Y), g = group(); g.position.set(ox, 0, oz); g.rotation.y = Y;
      const roof = new T.Group(); g.add(roof);
      const L = [], R = [], G = [], E = [], spots = [], anims = [], staffDogs = [];
      const self = {
        g, roof, spots, anims, ox, oz, staffDogs,
        b: (x, y, z, w, h, d, c, yaw) => L.push([x, y, z, w, h, d, c, yaw || 0]),
        rb: (x, y, z, w, h, d, c) => R.push([x, y, z, w, h, d, c]),
        gl: (x, y, z, w, h, d, c) => G.push([x, y, z, w, h, d, c || "#cfeeff"]),
        em: (x, y, z, w, h, d, c) => E.push([x, y, z, w, h, d, c]),
        // local (x, z) -> world, turned with the building
        spot: (x, z, pose, yaw, y, dx, dz) => { dx = dx || 0; dz = dz || 0; spots.push({ x: ox + x * cs + z * sn, z: oz - x * sn + z * cs, pose, yaw: (yaw || 0) + Y, y: y || 0, dx: dx * cs + dz * sn, dz: -dx * sn + dz * cs }); },
        done() {
          if (L.length) blocks(g, L);
          if (R.length) blocks(roof, R);
          if (G.length) { const m = blocks(g, G, false); m.material = new T.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.34, depthWrite: false }); m.renderOrder = 2; }
          if (E.length) { const m = blocks(g, E, false); m.material = new T.MeshBasicMaterial({ color: "#ffffff" }); }
          return { group: g, roof, spots, staff: staffDogs, centre: [ox, oz], front: [sn, cs], yaw: Y, anim: (t) => anims.forEach((f) => f(t)) };
        },
      };
      return self;
    }
    function sign(parent, w, h, x, y, z, draw, ry, basic) {
      const s = canvasBoard(w, h, Math.round(w * 140), Math.round(h * 140));
      if (basic) s.material = new T.MeshBasicMaterial({ map: s.tex, side: T.DoubleSide });
      s.position.set(x, y, z); s.rotation.y = ry || 0; parent.add(s);
      draw(s.cx, s.cx.canvas.width, s.cx.canvas.height); s.tex.needsUpdate = true; return s;
    }
    // Centred text that shrinks until it fits inside the board (with a margin), so no sign ever runs off its edges.
    function txt(c, str, x, y, size, col, weight, font) {
      const F = font || '"Helvetica Neue", Arial, sans-serif', maxW = Math.min(x, c.canvas.width - x) * 2 - c.canvas.width * 0.08; let s = size;
      c.font = `${weight || 900} ${s}px ${F}`; while (c.measureText(str).width > maxW && s > 8) { s -= 2; c.font = `${weight || 900} ${s}px ${F}`; }
      c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(str, x, y);
    }
    function fitTxt(c, str, x, y, maxW, size, col, weight) { let s = size; c.font = `${weight || 900} ${s}px "Helvetica Neue", Arial, sans-serif`; while (c.measureText(str).width > maxW && s > 10) { s -= 2; c.font = `${weight || 900} ${s}px "Helvetica Neue", Arial, sans-serif`; } txt(c, str, x, y, s, col, weight); }
    // Walls of a 13 x 11 m building, front at +z with two big windows and an open doorway, flat roof (hideable).
    function shell(k, o) {
      const { b, rb, gl } = k, H = o.H || 4, W = 13, D = 11, hw = W / 2, hd = D / 2, t = 0.3, dw = o.door || 2.4;
      b(0, 0, 0, W, 0.06, D, o.floor);
      b(0, 0, -hd + t / 2, W, H, t, o.wall); b(-hw + t / 2, 0, 0, t, H, D, o.wall); b(hw - t / 2, 0, 0, t, H, D, o.wall);
      b(-hw + 0.45, 0, hd - t / 2, 0.9, H, t, o.wall); b(hw - 0.45, 0, hd - t / 2, 0.9, H, t, o.wall);
      [-1, 1].forEach((sd) => b(sd * (dw / 2 + 0.25), 0, hd - t / 2, 0.5, H, t, o.wall));
      b(0, H - 0.9, hd - t / 2, W, 0.9, t + 0.04, o.trim);
      const ww = hw - 0.9 - (dw / 2 + 0.5);
      [-1, 1].forEach((sd) => { const cx = sd * (dw / 2 + 0.5 + ww / 2); b(cx, 0, hd - t / 2, ww, 0.7, t, o.wall); if (o.windows !== false) gl(cx, 0.7, hd - t / 2, ww, H - 1.6, 0.08); else b(cx, 0.7, hd - t / 2, ww, H - 1.6, t, o.wall); });
      b(0, 0, hd + 0.45, dw + 0.6, 0.08, 0.9, "#c8c4bc"); // door mat step
      rb(0, H, 0, W + 0.3, 0.3, D + 0.3, o.roof);
      rb(0, H + 0.3, -hd - 0.05, W + 0.3, 0.45, 0.2, o.trim); rb(-hw - 0.05, H + 0.3, 0, 0.2, 0.45, D + 0.3, o.trim); rb(hw + 0.05, H + 0.3, 0, 0.2, 0.45, D + 0.3, o.trim);
      [[-3.5, -2.5], [2.5, -1.5], [-0.5, 1.8]].forEach(([x, z]) => { rb(x, H + 0.3, z, 1.4, 0.8, 1.2, "#c8ccd4"); rb(x, H + 1.1, z, 0.9, 0.06, 0.9, "#8a8e96"); }); // aircon boxes
      return { H, hd, hw };
    }
    // A staff dog: a posable K.breed dog with kit ("apron", "cap", "glasses", "hardhat", "vest", "whistle", "bowtie").
    function staff(k, breedName, x, z, yaw, opts) {
      const o = opts || {}, d = K.breed(breedName), body = d.dog.children[0].children[0], head = d.head, sc = o.scale || 1.65;
      k.g.add(d); d.scale.setScalar(sc);
      const bx = (p, w, h, dd, c, xx, yy, zz) => K.boxAt(p, w, h, dd, c, xx, yy, zz);
      if (o.apron) { bx(body, 0.37, 0.24, 0.52, o.apron, 0, 0.04, 0.42); bx(body, 0.12, 0.08, 0.02, "#ffffff", 0.08, 0.06, 0.69); }
      if (o.vest) { bx(body, 0.37, 0.22, 0.44, o.vest, 0, 0.07, 0.42); bx(body, 0.38, 0.04, 0.45, "#eef0e8", 0, 0.07, 0.42); }
      if (o.cap) { bx(head, 0.36, 0.09, 0.34, o.cap, 0, 0.19, -0.01); bx(head, 0.3, 0.03, 0.18, o.cap, 0, 0.155, 0.22); }
      if (o.hardhat) { bx(head, 0.4, 0.12, 0.38, o.hardhat, 0, 0.21, -0.01); bx(head, 0.46, 0.03, 0.46, o.hardhat, 0, 0.155, 0.02); }
      if (o.glasses) { bx(head, 0.3, 0.025, 0.02, "#1a1a1a", 0, 0.08, 0.162); [-1, 1].forEach((s) => bx(head, 0.11, 0.09, 0.015, "#1a1a1a", s * 0.085, 0.06, 0.162)); }
      if (o.whistle) bx(d.neck, 0.05, 0.05, 0.1, "#c8c8d0", 0.06, -0.1, 0.14);
      if (o.bowtie) { bx(d.neck, 0.2, 0.08, 0.04, o.bowtie, 0, -0.07, 0.13); }
      d.put(x, o.y || 0, z, yaw, o.pose || {}); k.staffDogs.push(d);
      if (o.anim) k.anims.push((t) => o.anim(t, d));
      return d;
    }

    /* ---- Town: streets and plots ---- */
    function buildTown() {
      const g = group(), r = rng(611), L = [], E = [];
      const LANE = "#ecdfbc", PAVE = "#d9d5cc";
      flat(g, 92, 3.4, LANE, 48.1, 0.02, 18.5);           // main street from the lane
      flat(g, 68, 3.8, PAVE, 58, 0.016, 14.9);            // pavement, row 1
      flat(g, 2.8, 22, LANE, 26, 0.021, 6.2);             // side street
      flat(g, 66, 3.2, LANE, 59, 0.02, -3);               // back street
      flat(g, 66, 4.4, PAVE, 59, 0.016, -6.8);            // pavement, row 2
      for (let i = 0; i < 6; i++) L.push([26, 0.03, 16.4 - i * 0.62, 2.4, 0.005, 0.32, "#ffffff"]); // crossing on the side street
      for (let x = 30; x < 92; x += 8) { L.push([x, 0, 16.55, 0.14, 3.4, 0.14, "#3a3a44"], [x, 3.3, 16.35, 0.14, 0.08, 0.5, "#3a3a44"]); E.push([x, 3.15, 16.15, 0.36, 0.18, 0.3, "#ffe4a0"]); }
      for (let x = 30; x < 92; x += 8) { L.push([x, 0, -4.7, 0.14, 3.4, 0.14, "#3a3a44"], [x, 3.3, -4.9, 0.14, 0.08, 0.5, "#3a3a44"]); E.push([x, 3.15, -5.1, 0.36, 0.18, 0.3, "#ffe4a0"]); }
      [42, 58, 74].forEach((x) => { [14.2, -7.6].forEach((z) => { L.push([x, 0, z, 1.4, 0.5, 1.4, "#b8b2a6"], [x, 0.5, z, 1.2, 0.08, 1.2, "#6a4a30"], [x, 0.5, z, 0.2, 1.3, 0.2, "#7a5230"], [x, 1.5, z, 1.5, 1.2, 1.5, "#3f9a4a"], [x, 2.5, z, 0.9, 0.7, 0.9, "#58ab4a"]); }); });
      [38, 54, 70, 86].forEach((x) => { const z = 16.2; L.push([x, 0.4, z, 1.8, 0.08, 0.5, "#a06c3c"], [x, 0.5, z + 0.22, 1.8, 0.45, 0.08, "#a06c3c"], [x - 0.75, 0, z, 0.1, 0.4, 0.45, "#3a3a44"], [x + 0.75, 0, z, 0.1, 0.4, 0.45, "#3a3a44"]); });
      // hedges along the back of row 1 and either side of the side street
      for (let x = 28.5; x < 91; x += 1.4) L.push([x, 0, 0.9, 1.5, 0.8 + r() * 0.2, 1.0, r() < 0.5 ? "#3f9a4a" : "#4aa24e"]);
      // town sign
      L.push([24.4, 0, 21.2, 0.16, 2.6, 0.16, "#7a5230"]);
      blocks(g, L); const em = blocks(g, E, false); em.material = new T.MeshBasicMaterial({ color: "#ffffff" });
      sign(g, 2.6, 1.0, 24.4, 2.7, 21.3, (c, W, H) => { c.fillStyle = "#2f7a4a"; c.fillRect(0, 0, W, H); c.strokeStyle = "#fff8e6"; c.lineWidth = 8; c.strokeRect(10, 10, W - 20, H - 20); txt(c, "MARSH TOWN", W / 2, H / 2 + 2, 62, "#fff8e6"); }, Math.PI / 2 - 0.5);
      const SLOTS = [[34, 7.5], [50, 7.5], [66, 7.5], [82, 7.5], [34, -14.5], [50, -14.5], [66, -14.5], [82, -14.5]];
      return { group: g, SLOTS };
    }

    /* ---- Supermarket: Marsh Mart ---- */
    function buildSupermarket(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, gl, em, spot } = k, r = rng(701);
      const { H } = shell(k, { floor: "#eef0f2", wall: "#f6f4ee", trim: "#d8343a", roof: "#9a9aa4" });
      for (let x = -6; x <= 6; x += 1) for (let z = -5; z <= 5; z += 1) if ((x + z) % 2 === 0) b(x, 0.061, z, 1, 0.005, 1, "#e2e6ea");
      // fridges along the back
      for (let i = 0; i < 8; i++) { const x = -5.25 + i * 1.5; b(x, 0, -4.95, 1.42, 2.3, 0.7, "#ffffff"); em(x, 2.12, -4.58, 1.3, 0.08, 0.04, "#d8eeff"); for (let s = 0; s < 3; s++) for (let p = 0; p < 5; p++) b(x - 0.5 + p * 0.25, 0.3 + s * 0.62, -4.8, 0.18, 0.3, 0.3, PAL[Math.floor(r() * 8)]); gl(x, 0.2, -4.57, 1.32, 1.9, 0.04); }
      // three aisles of shelves
      const AISLE = ["TREATS", "TOYS", "BONES"];
      [-3.4, 0, 3.4].forEach((x, ai) => {
        b(x, 0, -1.2, 1.1, 0.15, 4.4, "#d0d2d8"); b(x, 0, -1.2, 0.1, 2.0, 4.4, "#e8e8ee");
        [0.15, 0.65, 1.15, 1.65].forEach((y) => b(x, y, -1.2, 1.1, 0.05, 4.4, "#c4c6ce"));
        [-1, 1].forEach((sd) => [0.2, 0.7, 1.2].forEach((y) => { for (let z = -3.2; z < 0.85; z += 0.3) b(x + sd * 0.3, y, z, 0.36, 0.28 + r() * 0.14, 0.24, PAL[Math.floor(r() * 9)]); }));
        sign(k.g, 1.7, 0.5, x, 3.1, -1.2, (c, W, H) => { c.fillStyle = "#d8343a"; c.fillRect(0, 0, W, H); txt(c, AISLE[ai], W / 2, H / 2 + 2, 46, "#ffffff"); });
        b(x, 3.35, -1.2, 0.04, H - 3.35, 0.04, "#8a8a94");
      });
      // fruit and veg by the door
      [[-4.6, 3.4], [-3.5, 3.4], [-2.4, 3.4]].forEach(([x, z], i) => { b(x, 0, z, 0.95, 0.55, 0.75, "#a87a4a"); for (let p = 0; p < 9; p++) b(x - 0.3 + (p % 3) * 0.3, 0.55, z - 0.22 + Math.floor(p / 3) * 0.22, 0.2, 0.16, 0.18, ["#e2483a", "#ffb02e", "#5ad86a"][i]); });
      // checkouts
      [2.2, 4.6].forEach((x) => { b(x, 0, 3.0, 0.8, 0.9, 2.0, "#3a3a44"); b(x - 0.08, 0.9, 3.0, 0.5, 0.04, 1.8, "#141418"); b(x + 0.25, 0.9, 3.75, 0.08, 0.42, 0.34, "#2a2a30"); em(x + 0.2, 1.0, 3.75, 0.01, 0.26, 0.26, "#7ad8ff"); b(x + 0.3, 0, 4.25, 0.04, 1.9, 0.04, "#8a8a94"); em(x + 0.3, 1.9, 4.25, 0.18, 0.18, 0.18, x < 3 ? "#5ad86a" : "#ffd23a"); for (let p = 0; p < 3; p++) b(x - 0.08, 0.94, 2.4 + p * 0.45, 0.24, 0.18, 0.2, PAL[Math.floor(r() * 8)]); });
      // trolleys outside
      for (let i = 0; i < 4; i++) { const x = 4.6, z = 6.6 + i * 0.32; b(x, 0.22, z, 0.62, 0.5, 0.95, "#b8bcc4"); b(x, 0.75, z - 0.5, 0.62, 0.05, 0.05, "#d8343a"); }
      for (let i = 0; i < 4; i++) b(-1.9, i * 0.22, 4.9, 0.55, 0.22, 0.4, "#d8343a"); // baskets
      gl(-0.85, 0, 5.32, 0.8, 3.0, 0.05); gl(0.85, 0, 5.32, 0.8, 3.0, 0.05); // sliding doors, open
      sign(k.g, 7.4, 1.5, 0, H + 0.9, 5.72, (c, W, h) => { c.fillStyle = "#d8343a"; c.fillRect(0, 0, W, h); c.fillStyle = "#ffffff"; c.fillRect(10, 10, W - 20, h - 20); c.fillStyle = "#d8343a"; c.fillRect(18, 18, W - 36, h - 36); txt(c, "MARSH MART", W / 2, h * 0.42, 108, "#ffffff"); txt(c, "TREATS · TOYS · BONES", W / 2, h * 0.78, 36, "#ffe0a0", 800); });
      b(0, H, 5.6, 7.6, 1.8, 0.12, "#b8202e");
      // staff: cashier and shelf stacker
      staff(k, "corgi", 3.4, 3.1, -Math.PI / 2, { apron: "#d8343a", cap: "#d8343a", anim: (t, d) => { d.head.rotation.y = Math.sin(t * 1.3) * 0.45; d.dog.pose({ wag: K.wag(t, 12), mouth: 0.25 + Math.max(0, Math.sin(t * 2.2)) * 0.3 }); } });
      staff(k, "beagle", 1.75, -2.4, -Math.PI / 2, { apron: "#d8343a", anim: (t, d) => { d.dog.pose({ pawL: Math.max(0, Math.sin(t * 2.4)), wag: K.wag(t, 10) }); } });
      // visitors
      [-1.7, 1.7, -5.2].forEach((x, i) => { spot(x, -1.1, "pace", 0, 0, 0, 1.6); spot(x, -1.3, "pace", 0, 0, 0, -1.4); });
      [-4.5, -1.5, 1.5, 4.5].forEach((x) => spot(x, -3.85, "stand", Math.PI));
      spot(1.45, 3.2, "sit", Math.PI / 2); spot(1.45, 4.5, "stand", Math.PI); spot(3.9, 4.6, "stand", Math.PI);
      spot(-3.5, 4.4, "stand", Math.PI); spot(-4.6, 4.5, "sit", Math.PI);
      return k.done();
    }

    /* ---- Library ---- */
    function buildLibrary(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, gl, em, spot } = k, r = rng(702);
      const { H } = shell(k, { floor: "#c89a6a", wall: "#efe3c8", trim: "#7a4a2e", roof: "#6a4a3a", H: 4.4 });
      const WOOD = "#7a4a2e", BOOK = ["#b23a3a", "#2f5f9a", "#2f7a4a", "#d8a030", "#6a3a7a", "#e8e0d0", "#3a3a48", "#c8643a"];
      const shelfRun = (x0, x1, z, alongZ) => { // a 2.6 m bookcase full of books
        const len = x1 - x0, cx = (x0 + x1) / 2;
        if (alongZ) b(z, 0, cx, 0.45, 2.7, len, WOOD); else b(cx, 0, z, len, 2.7, 0.45, WOOD);
        [0.12, 0.76, 1.4, 2.04].forEach((y) => { for (let p = x0 + 0.1; p < x1 - 0.12;) { const w = 0.07 + r() * 0.07, h = 0.38 + r() * 0.18, c = BOOK[Math.floor(r() * BOOK.length)], tilt = r() < 0.04; if (alongZ) b(z + (z > 0 ? -0.22 : 0.22), y, p + w / 2, 0.22, h, w * 0.9, c); else b(p + w / 2, y, z + 0.22, w * 0.9, h, 0.22, c, tilt ? 0.25 : 0); p += w + (r() < 0.06 ? 0.2 : 0); } });
      };
      shelfRun(-6.1, 6.1, -5.05, false); shelfRun(-4.6, 2.2, -6.05, true); shelfRun(-4.6, 2.2, 6.05, true);
      [-4.4, -4.0].forEach((x, i) => b(x + i * 0.4 - 0.2, 0, -4.6, 0.06, 2.9, 0.06, "#a06c3c")); for (let y = 0.3; y < 2.9; y += 0.35) b(-4.2, y, -4.6, 0.46, 0.05, 0.05, "#a06c3c"); // ladder
      b(0, 0.061, -1.0, 8.2, 0.01, 4.4, "#9a2a2a"); b(0, 0.065, -1.0, 7.6, 0.01, 3.8, "#b23a3a");
      [-2.2, 2.2].forEach((x) => {
        b(x, 0.72, -1.0, 2.6, 0.08, 1.3, "#9a6a42"); [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]].forEach(([dx, dz]) => b(x + dx, 0, -1.0 + dz, 0.1, 0.72, 0.1, WOOD));
        b(x - 0.5, 0.8, -1.0, 0.08, 0.32, 0.08, "#2a2a2a"); em(x - 0.5, 1.08, -1.0, 0.4, 0.12, 0.22, "#8ef09a");
        for (let i = 0; i < 4; i++) b(x + 0.6, 0.8 + i * 0.07, -1.05, 0.5 - i * 0.04, 0.07, 0.36, BOOK[i + (x > 0 ? 3 : 0)]);
        [-0.7, 0.7].forEach((dx) => [-1, 1].forEach((sd) => { const z = -1.0 + sd * 1.0; b(x + dx, 0.42, z, 0.55, 0.08, 0.55, WOOD); b(x + dx, 0.5, z + sd * 0.24, 0.55, 0.6, 0.08, WOOD); b(x + dx, 0, z, 0.08, 0.42, 0.08, WOOD); }));
      });
      [[-4.5, 2.6, "#e8a030"], [-3.0, 3.6, "#3a8ad8"], [-4.6, 4.2, "#d84a7a"]].forEach(([x, z, c]) => { b(x, 0, z, 1.05, 0.42, 1.05, c); b(x, 0.42, z - 0.32, 0.95, 0.32, 0.36, c); });
      // librarian's desk
      b(3.8, 0, 2.7, 2.8, 1.0, 0.8, WOOD); b(3.8, 1.0, 2.7, 2.9, 0.06, 0.9, "#9a6a42"); b(3.0, 1.06, 2.6, 0.5, 0.36, 0.06, "#2a2a30"); em(3.0, 1.1, 2.64, 0.42, 0.26, 0.01, "#bfe4ff");
      for (let i = 0; i < 6; i++) b(4.6, 1.06 + i * 0.08, 2.7, 0.42, 0.08, 0.3, BOOK[i]);
      b(5.4, 0, 4.4, 0.7, 1.0, 0.7, "#5a6a7a"); b(5.4, 1.0, 4.4, 0.5, 0.08, 0.4, "#2a2a30"); // returns box
      // portico
      [-2.9, -1.1, 1.1, 2.9].forEach((x) => { b(x, 0.24, 6.1, 0.5, H - 0.24, 0.5, "#fbf7ee"); b(x, 0.24, 6.1, 0.66, 0.2, 0.66, "#e8e0d0"); b(x, H - 0.2, 6.1, 0.66, 0.2, 0.66, "#e8e0d0"); });
      b(0, 0, 6.3, 7.4, 0.12, 1.5, "#e8e2d4"); b(0, 0.12, 6.0, 6.8, 0.12, 0.9, "#f0ebe0");
      b(0, H, 6.05, 7.4, 0.5, 1.6, "#fbf7ee"); b(0, H + 0.5, 6.0, 5.8, 0.4, 1.4, "#fbf7ee"); b(0, H + 0.9, 5.95, 3.6, 0.4, 1.2, "#fbf7ee");
      sign(k.g, 6.6, 0.48, 0, H + 0.25, 6.86, (c, W, h) => { c.fillStyle = "#fbf7ee"; c.fillRect(0, 0, W, h); txt(c, "L I B R A R Y", W / 2, h / 2 + 2, 52, "#4a3020", 800, 'Georgia, "Times New Roman", serif'); });
      sign(k.g, 1.4, 1.0, -4.5, 1.4, 5.66, (c, W, h) => { c.fillStyle = "#2f5f9a"; c.fillRect(0, 0, W, h); txt(c, "BOOKS &", W / 2, h * 0.36, 34, "#ffffff"); txt(c, "BISCUITS", W / 2, h * 0.68, 34, "#ffd23a"); });
      sign(k.g, 1.0, 0.5, 0, 3.0, -4.8, (c, W, h) => { c.fillStyle = "#fff8ea"; c.fillRect(0, 0, W, h); txt(c, "SHHH!", W / 2, h / 2 + 2, 44, "#b23a3a"); });
      // staff: librarian with glasses
      staff(k, "poodle", 3.8, 1.85, 0, { glasses: true, bowtie: "#b23a3a", anim: (t, d) => { d.head.rotation.x = 0.25 + Math.sin(t * 0.6) * 0.08; d.head.rotation.y = Math.sin(t * 0.35) * 0.3; d.dog.pose({ sit: 1, wag: K.wag(t, 6) * 0.4 }); } });
      // visitors: chairs (facing the table), beanbags, shelves
      [-2.2, 2.2].forEach((x) => [-0.7, 0.7].forEach((dx) => { spot(x + dx, -2.0, "sit", 0, 0.08); spot(x + dx, 0.0, "sit", Math.PI, 0.08); }));
      spot(-4.5, 2.7, "lie", 0.5, 0.42); spot(-3.0, 3.7, "lie", -0.3, 0.42); spot(-4.6, 4.3, "sit", 0.2, 0.42);
      [-2.5, 0.5, 3.5].forEach((x) => spot(x, -4.05, "stand", Math.PI));
      return k.done();
    }

    /* ---- Gym: Muscle Mutts ---- */
    function buildGym(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, gl, em, spot } = k;
      const { H } = shell(k, { floor: "#2c2c34", wall: "#3a3a44", trim: "#ffd23a", roof: "#4a4a54" });
      b(0, 0.3, -5.32, 11.4, 2.5, 0.05, "#c4d8e4"); b(0, 2.9, -5.3, 12.4, 0.1, 0.1, "#ffd23a"); // mirror wall
      // treadmills
      [-4.4, -2.0, 0.4, 2.8].forEach((x) => { b(x, 0, -3.7, 0.95, 0.22, 2.1, "#1e1e24"); b(x, 0.22, -3.6, 0.72, 0.02, 1.8, "#0c0c10"); [-0.42, 0.42].forEach((dx) => b(x + dx, 0.22, -4.6, 0.07, 1.15, 0.07, "#5a5a66")); b(x, 1.3, -4.6, 0.85, 0.28, 0.28, "#2a2a32"); em(x, 1.38, -4.45, 0.42, 0.13, 0.01, "#5ad86a"); });
      // dumbbell rack
      b(-5.55, 0, 0.6, 0.8, 0.7, 4.4, "#2a2a32");
      for (let i = 0; i < 7; i++) { const z = -1.2 + i * 0.6, s = 0.14 + i * 0.015; b(-5.55, 0.74, z, 0.55, 0.05, 0.05, "#a8a8b0"); [-0.25, 0.25].forEach((dx) => b(-5.55 + dx, 0.7 - s / 2 + 0.02, z, 0.1, s * 1.4, s * 1.4, "#18181c")); }
      // bench press
      b(0.6, 0, 0.9, 0.55, 0.45, 1.7, "#c5242b"); [0.15, 1.05].forEach((x) => b(x, 0, 0.15, 0.1, 1.35, 0.1, "#5a5a66")); b(0.6, 1.15, 0.15, 2.4, 0.05, 0.05, "#c8c8d0"); [-0.55, 1.75].forEach((x) => b(x, 0.95, 0.15, 0.1, 0.45, 0.45, "#18181c"));
      // punch bag on a swinging pivot
      const piv = new T.Group(); piv.position.set(3.9, H - 0.2, 1.6); k.g.add(piv);
      K.boxAt(piv, 0.04, 1.2, 0.04, "#8a8a94", 0, -0.6, 0); const bag = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 1.4, 12), K.M("#c5242b")); bag.position.y = -1.9; bag.castShadow = true; piv.add(bag);
      k.anims.push((t) => { piv.rotation.z = Math.sin(t * 2.6) * 0.12; piv.rotation.x = Math.sin(t * 1.7) * 0.06; });
      b(3.9, H - 0.25, 1.6, 0.2, 0.25, 0.2, "#5a5a66");
      // mats, kettlebells, water cooler
      [["#5ac8ff", -3.4], ["#ff8ad8", -2.2], ["#5ad86a", -1.0]].forEach(([c, x]) => b(x, 0.061, 3.2, 0.85, 0.02, 1.8, c));
      [0.5, 1.0, 1.5, 2.0].forEach((x, i) => { b(x + 1.8, 0, 4.6, 0.26 + i * 0.03, 0.26 + i * 0.03, 0.26 + i * 0.03, ["#ff8a3a", "#5ac8ff", "#ffd23a", "#c5242b"][i]); });
      b(5.5, 0, 4.4, 0.5, 1.1, 0.5, "#e8e8f0"); gl(5.5, 1.1, 4.4, 0.36, 0.5, 0.36, "#7ad8ff");
      sign(k.g, 7.4, 1.5, 0, H + 0.9, 5.72, (c, W, h) => { c.fillStyle = "#18181c"; c.fillRect(0, 0, W, h); c.fillStyle = "#ffd23a"; c.fillRect(0, h - 22, W, 22); txt(c, "MUSCLE MUTTS", W / 2, h * 0.4, 100, "#ffd23a"); txt(c, "GYM · OPEN ALL HOURS", W / 2, h * 0.74, 34, "#ffffff", 800); });
      b(0, H, 5.6, 7.6, 1.8, 0.12, "#18181c");
      sign(k.g, 2.4, 0.7, 0, 3.2, -5.25, (c, W, h) => { c.fillStyle = "#ffd23a"; c.fillRect(0, 0, W, h); txt(c, "NO PAIN NO GAIN", W / 2, h / 2 + 2, 36, "#18181c"); });
      // staff: the trainer, doing jumping jacks
      staff(k, "shepherd", -1.6, 1.6, 0, { cap: "#ffd23a", whistle: true, vest: "#18181c", anim: (t, d) => { const j = Math.max(0, Math.sin(t * 5)); d.position.y = j * 0.35; d.dog.pose({ jump: j, wag: K.wag(t, 16), mouth: 0.4 }); } });
      // visitors
      [-4.4, -2.0, 0.4, 2.8].forEach((x) => spot(x, -3.5, "run", Math.PI, 0.24));
      spot(0.6, 0.95, "lie", Math.PI, 0.45); spot(3.9, 2.65, "hop", Math.PI); spot(-4.6, 0.6, "stand", -Math.PI / 2); spot(-4.6, 2.2, "stand", -Math.PI / 2);
      [-3.4, -2.2, -1.0].forEach((x) => spot(x, 3.2, "sit", 0, 0.03));
      return k.done();
    }

    /* ---- Cinema ---- */
    function buildCinema(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, gl, em, spot } = k;
      const WALL = "#7a3ac8", RED = "#b8202e", GOLD = "#ffc21a";
      const { H } = shell(k, { floor: "#2a1a26", wall: WALL, trim: GOLD, roof: "#9a5ae0", H: 4.6, door: 2.0 });
      b(0, 0.061, 3.1, 12.4, 0.01, 4.6, "#8a2a3a");
      b(1.0, 0, 0.8, 10.4, H, 0.25, WALL); // wall between lobby and screen
      // screen with a looping cartoon
      const scr = sign(k.g, 9.4, 3.5, 0, 2.6, -5.3, () => {}, 0, true); b(0, 0.75, -5.38, 9.9, 3.9, 0.08, "#0c0a10");
      let lastF = -1;
      k.anims.push((t) => { const f = Math.floor(t * 12); if (f === lastF) return; lastF = f; const c = scr.cx, W = c.canvas.width, h = c.canvas.height, u = (t * 0.18) % 1;
        const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#6ac8ff"); sky.addColorStop(1, "#c8f0ff"); c.fillStyle = sky; c.fillRect(0, 0, W, h);
        c.fillStyle = "#ffffff"; [[0.2, 0.2], [0.6, 0.15], [0.85, 0.28]].forEach(([x, y]) => { const cx = ((x - u * 0.3) % 1 + 1) % 1 * W; c.fillRect(cx, y * h, 120, 36); c.fillRect(cx + 30, y * h - 22, 70, 30); });
        c.fillStyle = "#5ad86a"; c.fillRect(0, h * 0.72, W, h * 0.28);
        const dx = u * (W + 300) - 150, hop = Math.abs(Math.sin(t * 9)) * 30, by = h * 0.72;
        c.fillStyle = "#ff4a5a"; const bx = dx + 200 + Math.sin(t * 3) * 30, bb = Math.abs(Math.sin(t * 6)) * 80; c.beginPath(); c.arc(bx, by - 24 - bb, 22, 0, 6.3); c.fill();
        c.fillStyle = "#d9a24a"; c.fillRect(dx, by - 90 - hop, 150, 60); c.fillRect(dx + 120, by - 130 - hop, 70, 60); c.fillStyle = "#b07a30"; c.fillRect(dx + 120, by - 130 - hop, 18, 48); c.fillRect(dx - 24, by - 98 - hop, 30, 14);
        c.fillStyle = "#d9a24a"; const lg = Math.sin(t * 18) * 14; [[10, lg], [40, -lg], [100, lg], [130, -lg]].forEach(([x, o]) => c.fillRect(dx + x + o, by - 36 - hop, 16, 36));
        c.fillStyle = "#14100e"; c.fillRect(dx + 170, by - 112 - hop, 12, 12); c.fillRect(dx + 186, by - 100 - hop, 10, 8);
        scr.tex.needsUpdate = true; });
      // seats
      for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) { const x = -4.4 + i * 1.1, z = -3.4 + row * 1.35; b(x, 0, z, 0.85, 0.42, 0.75, RED); b(x, 0.42, z + 0.33, 0.85, 0.65, 0.14, RED); [-0.46, 0.46].forEach((dx) => b(x + dx, 0, z, 0.08, 0.62, 0.7, "#3a1420")); }
      em(-5.9, 0.08, -2.0, 0.06, 0.06, 6, "#ffe4a0"); em(5.9, 0.08, -2.0, 0.06, 0.06, 6, "#ffe4a0");
      // lobby: popcorn counter, machine, menu
      b(3.8, 0, 2.5, 3.4, 1.0, 0.8, RED); b(3.8, 1.0, 2.5, 3.5, 0.06, 0.9, GOLD); b(2.6, 1.06, 2.45, 0.7, 0.75, 0.55, RED); gl(2.6, 1.15, 2.45, 0.6, 0.55, 0.5, "#ffffff"); b(2.6, 1.12, 2.45, 0.55, 0.28, 0.45, "#ffe9a0");
      for (let i = 0; i < 3; i++) { b(4.0 + i * 0.4, 1.06, 2.4, 0.22, 0.3, 0.22, "#ffffff"); b(4.0 + i * 0.4, 1.36, 2.4, 0.24, 0.1, 0.24, "#ffe9a0"); }
      sign(k.g, 3.4, 0.9, 3.8, 2.6, 0.95, (c, W, h) => { c.fillStyle = "#18101a"; c.fillRect(0, 0, W, h); txt(c, "POPCORN · HOTDOGS", W / 2, h * 0.38, 44, GOLD); txt(c, "PUPCAKES · WATER", W / 2, h * 0.72, 40, "#ffffff", 800); });
      [-4.6, -3.0].forEach((x) => { b(x, 0, 3.4, 0.12, 0.9, 0.12, GOLD); }); b(-3.8, 0.75, 3.4, 1.5, 0.06, 0.06, RED);
      // marquee with chasing bulbs
      b(0, 3.0, 6.0, 6.6, 0.7, 1.3, "#18101a");
      const bulbs = [[], []]; for (let x = -3.15, i = 0; x <= 3.16; x += 0.35, i++) { bulbs[i % 2].push([x, 3.02, 6.67, 0.12, 0.12, 0.08, "#ffffff"]); bulbs[(i + 1) % 2].push([x, 3.6, 6.67, 0.12, 0.12, 0.08, "#ffffff"]); }
      const bm = bulbs.map((list) => { const m = blocks(k.g, list, false); m.material = new T.MeshBasicMaterial({ color: "#fff2a0" }); return m; });
      k.anims.push((t) => { const on = Math.floor(t * 3) % 2; bm[0].material.color.set(on ? "#fff2a0" : "#8a6a30"); bm[1].material.color.set(on ? "#8a6a30" : "#fff2a0"); });
      sign(k.g, 5.8, 0.38, 0, 3.3, 6.67, (c, W, h) => { c.fillStyle = "#18101a"; c.fillRect(0, 0, W, h); txt(c, "NOW SHOWING: THE GOOD BOY", W / 2, h / 2 + 2, 34, "#ffffff", 800); });
      sign(k.g, 7.4, 1.5, 0, H + 0.9, 5.72, (c, W, h) => { c.fillStyle = "#5a1e9a"; c.fillRect(0, 0, W, h); c.strokeStyle = GOLD; c.lineWidth = 10; c.strokeRect(14, 14, W - 28, h - 28); txt(c, "★ CINEMA ★", W / 2, h / 2 + 4, 118, GOLD); });
      b(0, H, 5.6, 7.6, 1.8, 0.12, "#5a1e9a");
      [["THE GOOD BOY", "#2f8fe0"], ["FETCH 2", "#e2483a"]].forEach(([title, col], i) => sign(k.g, 1.1, 1.6, i ? 4.6 : -4.6, 1.5, 5.67, (c, W, h) => { c.fillStyle = col; c.fillRect(0, 0, W, h); c.fillStyle = "#ffffff"; c.fillRect(W * 0.3, h * 0.25, W * 0.4, h * 0.3); fitTxt(c, title, W / 2, h * 0.75, W - 20, 30, "#ffffff"); c.strokeStyle = GOLD; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, h - 8); }));
      // staff: popcorn seller
      staff(k, "pug", 3.8, 1.75, 0, { cap: RED, bowtie: GOLD, anim: (t, d) => { d.head.rotation.y = Math.sin(t * 0.9) * 0.35; d.dog.pose({ wag: K.wag(t, 14), mouth: 0.3 }); } });
      // visitors: seats facing the screen, the popcorn queue
      for (let row = 0; row < 3; row++) [0, 2, 4, 6, 8, 1, 7].forEach((i) => spot(-4.4 + i * 1.1, -3.5 + row * 1.35, "sit", Math.PI, 0.38));
      spot(3.4, 3.7, "stand", Math.PI); spot(4.4, 4.5, "stand", Math.PI); spot(-3.8, 4.3, "sit", Math.PI);
      return k.done();
    }

    /* ---- The building site (coming soon) ---- */
    function buildSite(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, gl, em } = k, Y = "#f2c418", STEEL = "#d0582a", r = rng(703);
      b(0, 0, 0, 13.8, 0.05, 11.8, "#9a7a52");
      for (let i = 0; i < 40; i++) b(-6 + r() * 12, 0.05, -5 + r() * 10, 0.3 + r() * 0.6, 0.02, 0.3 + r() * 0.6, "#86683e");
      // hoarding with a gate gap at the front
      const panel = (x, z, w, d) => { b(x, 0, z, w, 2.3, d, "#2f6fb8"); b(x, 2.05, z, w + 0.02, 0.25, d + 0.02, "#ffffff"); };
      for (let x = -6.6; x < 6.7; x += 2.2) if (Math.abs(x + 1.1) > 2.0) panel(x + 1.1, 5.9, 2.18, 0.08);
      for (let x = -6.6; x < 6.7; x += 2.2) panel(x + 1.1, -5.9, 2.18, 0.08);
      for (let z = -5.8; z < 5.9; z += 2.3) { panel(-6.9, z + 1.15, 0.08, 2.28); panel(6.9, z + 1.15, 0.08, 2.28); }
      [-1.6, 1.6].forEach((x) => b(x, 0, 5.9, 0.2, 2.6, 0.2, "#3a3a44"));
      sign(k.g, 3.9, 1.7, -4.2, 1.2, 5.96, (c, W, h) => { c.fillStyle = "#ffd23a"; c.fillRect(0, 0, W, h); c.fillStyle = "#18181c"; for (let i = -2; i < 14; i++) { c.beginPath(); c.moveTo(i * 60, 0); c.lineTo(i * 60 + 30, 0); c.lineTo(i * 60 - 10, 28); c.lineTo(i * 60 - 40, 28); c.fill(); c.beginPath(); c.moveTo(i * 60, h - 28); c.lineTo(i * 60 + 30, h - 28); c.lineTo(i * 60 - 10, h); c.lineTo(i * 60 - 40, h); c.fill(); } txt(c, "COMING", W / 2, h * 0.38, 84, "#18181c"); txt(c, "SOON", W / 2, h * 0.68, 84, "#18181c"); });
      sign(k.g, 3.9, 1.7, 4.2, 1.2, 5.96, (c, W, h) => { c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, h); c.fillStyle = "#2f7a4a"; c.fillRect(0, 0, W, 64); txt(c, "NEXT BUILD", W / 2, 34, 48, "#ffffff"); txt(c, "Top comment", W / 2, h * 0.55, 54, "#18181c"); txt(c, "decides!", W / 2, h * 0.8, 54, "#2f7a4a"); });
      sign(k.g, 0.9, 0.9, -2.2, 1.6, 5.97, (c, W, h) => { c.fillStyle = "#2f8fe0"; c.beginPath(); c.arc(W / 2, h / 2, W / 2 - 4, 0, 6.3); c.fill(); txt(c, "HARD", W / 2, h * 0.4, 28, "#fff"); txt(c, "HATS", W / 2, h * 0.64, 28, "#fff"); });
      // foundation slab with rebar
      b(-1.6, 0, -1.0, 8.0, 0.3, 6.8, "#b8b8b4");
      for (let x = 2.0; x < 2.5; x += 0.2) for (let z = -4.2; z < 2.4; z += 0.5) b(x + 0.2, 0.3, z, 0.04, 0.9, 0.04, "#8a4a2a");
      // steel frame, three storeys, part-finished
      const XS = [-5.2, -2.6, 0, 2.0], ZS = [-4.0, -1.2, 1.8];
      XS.forEach((x, i) => ZS.forEach((z, j) => { const h = i === 3 && j === 2 ? 3 : i === 3 || j === 2 ? 6 : 9; b(x, 0.3, z, 0.24, h, 0.24, STEEL); }));
      [3.3, 6.3].forEach((y, lv) => { ZS.forEach((z, j) => { if (lv === 1 && j === 2) return; b((XS[0] + XS[lv ? 2 : 3]) / 2, y, z, (lv ? XS[2] : XS[3]) - XS[0], 0.22, 0.18, STEEL); });
        XS.forEach((x, i) => { if (lv === 1 && i === 3) return; b(x, y, (ZS[0] + ZS[lv ? 1 : 2]) / 2, 0.18, 0.22, (lv ? ZS[1] : ZS[2]) - ZS[0], STEEL); }); });
      b(-1.6, 3.52, -1.1, 7.2, 0.2, 5.8, "#c4c4c0"); b(-2.6, 6.52, -2.6, 5.2, 0.2, 2.8, "#c4c4c0");
      [-5.2, -2.6].forEach((x) => b(x, 9.3, -1.2, 0.18, 0.22, 5.8, STEEL)); b(-3.9, 9.3, -4.0, 2.6, 0.22, 0.18, STEEL);
      // scaffolding on the front face, with green netting
      for (let x = -5.6; x <= 2.3; x += 1.3) { b(x, 0, 2.5, 0.06, 7.8, 0.06, "#a8a8b0"); b(x, 0, 3.3, 0.06, 7.8, 0.06, "#a8a8b0"); }
      [1.0, 3.4, 5.8].forEach((y) => { b(-1.6, y, 2.9, 8.2, 0.06, 0.9, "#c8a060"); b(-1.6, y + 1.0, 3.3, 8.2, 0.05, 0.05, "#a8a8b0"); b(-1.6, y + 0.12, 3.32, 8.2, 0.18, 0.03, "#e8b030"); });
      gl(-1.6, 3.5, 3.36, 8.0, 4.4, 0.02, "#3aa84a");
      // tower crane
      const cx = 4.4, cz = -3.4, MH = 30;
      b(cx, 0, cz, 2.4, 0.7, 2.4, "#9a9a96");
      [-0.75, 0.75].forEach((dx) => [-0.75, 0.75].forEach((dz) => b(cx + dx, 0.7, cz + dz, 0.14, MH - 0.7, 0.14, Y)));
      for (let y = 1.2; y < MH; y += 1.25) { [-0.75, 0.75].forEach((d) => { b(cx, y, cz + d, 1.6, 0.07, 0.07, Y); b(cx + d, y, cz, 0.07, 0.07, 1.6, Y); }); b(cx, y + 0.6, cz + 0.75, 1.7, 0.06, 0.06, Y, (y % 2.5 > 1 ? 1 : -1) * 0.6); }
      b(cx + 0.6, 0.7, cz + 0.6, 0.4, MH - 0.7, 0.05, "#c8c8d0"); // ladder
      const top = new T.Group(); top.position.set(cx, MH, cz); k.g.add(top);
      const TL = [], JIB = 27, CJ = 9;
      TL.push([0, 0, 0, 2.4, 1.0, 2.4, Y], [0, 1.0, 0, 0.6, 5.2, 0.6, Y], [0.9, -0.2, 1.5, 1.4, 1.5, 1.3, "#f4f4f4"]);
      [-0.55, 0.55].forEach((z) => TL.push([JIB / 2 + 1, 1.0, z, JIB, 0.12, 0.12, Y])); TL.push([JIB / 2 + 1, 2.4, 0, JIB, 0.12, 0.12, Y]);
      for (let x = 1.6; x < JIB + 1; x += 1.2) { [-0.5, 0.5].forEach((z) => TL.push([x, 1.0, z * 0.6, 0.08, 1.45, 0.08, Y])); TL.push([x, 1.0, 0, 0.08, 0.08, 1.1, Y]); }
      TL.push([-CJ / 2, 1.0, 0, CJ, 0.45, 1.6, Y]); for (let x = -CJ + 0.4; x < 0; x += 1.0) TL.push([x, 1.45, 0.78, 0.06, 0.6, 0.06, "#ffffff"]);
      TL.push([-CJ + 1.1, -0.9, 0, 1.6, 1.9, 1.8, "#9a9a96"], [-CJ + 2.8, -0.9, 0, 1.6, 1.9, 1.8, "#9a9a96"]);
      blocks(top, TL);
      { const m = blocks(top, [[1.62, 0.1, 1.5, 0.06, 0.9, 1.0, "#bfe4ff"]], false); m.material = new T.MeshBasicMaterial({ color: "#bfe4ff" }); }
      sign(top, 3.2, 1.1, -CJ + 1.95, 0.05, 0.92, (c, W, h) => { c.fillStyle = "#f2c418"; c.fillRect(0, 0, W, h); txt(c, "MARSH", W / 2, h * 0.36, 64, "#18181c"); txt(c, "CONSTRUCTION", W / 2, h * 0.72, 44, "#18181c"); });
      const ties = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 6.2, 0), new T.Vector3(JIB * 0.55, 2.5, 0), new T.Vector3(0, 6.2, 0), new T.Vector3(JIB, 2.5, 0), new T.Vector3(0, 6.2, 0), new T.Vector3(-CJ + 0.5, 1.45, 0)]);
      top.add(new T.LineSegments(ties, new T.LineBasicMaterial({ color: "#3a3a44" })));
      const tipLight = K.glow(0.5, "#ff2a2a", JIB + 1, 2.6, 0, top), apexLight = K.glow(0.5, "#ff2a2a", 0, 6.4, 0, top);
      // trolley, cable, hook and a bundle of steel beams
      const trolley = new T.Group(); top.add(trolley); K.boxAt(trolley, 1.0, 0.4, 1.2, "#3a3a44", 0, 0.8, 0);
      const cableG = new T.BufferGeometry(); cableG.setAttribute("position", new T.Float32BufferAttribute([-0.2, 0.6, 0, -0.2, -10, 0, 0.2, 0.6, 0, 0.2, -10, 0], 3));
      const cable = new T.LineSegments(cableG, new T.LineBasicMaterial({ color: "#2a2a30" })); cable.frustumCulled = false; trolley.add(cable);
      const hook = new T.Group(); trolley.add(hook); K.boxAt(hook, 0.6, 0.5, 0.4, "#f2c418", 0, 0, 0); K.boxAt(hook, 0.1, 0.4, 0.1, "#3a3a44", 0, -0.45, 0);
      [-0.3, 0, 0.3].forEach((z, i) => K.boxAt(hook, 4.2, 0.28, 0.24, STEEL, 0, -1.6 - (i === 1 ? 0.28 : 0), z * (i === 1 ? 0 : 1)));
      const sling = new T.BufferGeometry().setFromPoints([new T.Vector3(0, -0.6, 0), new T.Vector3(-1.8, -1.45, 0), new T.Vector3(0, -0.6, 0), new T.Vector3(1.8, -1.45, 0)]);
      hook.add(new T.LineSegments(sling, new T.LineBasicMaterial({ color: "#2a2a30" })));
      k.anims.push((t) => {
        top.rotation.y = -1.9 + Math.sin(t * 0.11) * 1.1;
        const tx = 12 + Math.sin(t * 0.23) * 7, drop = 12 + Math.sin(t * 0.31 + 1) * 6; trolley.position.x = tx; hook.position.y = -drop;
        const a = cableG.attributes.position.array; a[4] = -drop + 0.25; a[10] = -drop + 0.25; cableG.attributes.position.needsUpdate = true;
        hook.rotation.y = Math.sin(t * 0.5) * 0.4; const on = Math.floor(t * 1.2) % 2 === 0; tipLight.visible = on; apexLight.visible = on;
      });
      // excavator
      const ex = new T.Group(); ex.position.set(-1.2, 0, 4.0); ex.rotation.y = -0.4; k.g.add(ex);
      [-0.75, 0.75].forEach((x) => K.boxAt(ex, 0.55, 0.55, 2.6, "#2a2a2e", x, 0.28, 0));
      const up = new T.Group(); up.position.y = 0.56; ex.add(up);
      K.boxAt(up, 2.0, 0.8, 2.2, Y, 0, 0.4, -0.1); K.boxAt(up, 0.9, 1.1, 1.0, Y, 0.5, 1.35, 0.45); K.boxAt(up, 0.8, 0.7, 0.02, "#bfe4ff", 0.5, 1.45, 0.96); K.boxAt(up, 2.0, 0.5, 0.5, "#3a3a44", 0, 0.55, -1.0);
      const boom = new T.Group(); boom.position.set(-0.35, 0.9, 0.9); up.add(boom); K.boxAt(boom, 0.32, 0.36, 2.6, Y, 0, 0, 1.3);
      const stick = new T.Group(); stick.position.set(0, 0, 2.6); boom.add(stick); K.boxAt(stick, 0.26, 0.3, 1.8, Y, 0, 0, 0.9);
      const bucket = new T.Group(); bucket.position.set(0, 0, 1.8); stick.add(bucket); K.boxAt(bucket, 0.7, 0.55, 0.5, "#3a3a44", 0, -0.15, 0.2);
      k.anims.push((t) => { const s = Math.sin(t * 0.8); up.rotation.y = s * 0.5; boom.rotation.x = -0.55 + s * 0.2; stick.rotation.x = 1.0 + Math.sin(t * 0.8 + 0.8) * 0.35; bucket.rotation.x = 0.4 + Math.sin(t * 0.8 + 1.6) * 0.5; });
      [[-3.6, 3.2, 2.4], [-3.4, 3.0, 1.6], [-3.5, 3.1, 0.9]].forEach(([x, z, w], i) => b(x, i * 0.45, z, w, 0.45, w * 0.8, "#7a5a3a"));
      // cement mixer truck
      const mx = new T.Group(); mx.position.set(3.0, 0, 3.9); k.g.add(mx);
      K.boxAt(mx, 4.2, 0.35, 1.3, "#3a3a44", 0, 0.65, 0); K.boxAt(mx, 1.2, 1.4, 1.4, "#ffffff", 1.6, 1.4, 0); K.boxAt(mx, 0.04, 0.6, 1.1, "#bfe4ff", 2.21, 1.65, 0);
      [-1.4, -0.4, 1.6].forEach((x) => [-0.62, 0.62].forEach((z) => K.boxAt(mx, 0.7, 0.7, 0.3, "#18181c", x, 0.35, z)));
      const drum = new T.Mesh(new T.CylinderGeometry(0.55, 0.85, 2.4, 10), K.M("#e8e8e8")); drum.rotation.z = Math.PI / 2 + 0.25; drum.position.set(-0.5, 1.75, 0); drum.castShadow = true; mx.add(drum);
      const stripes = new T.Group(); drum.add(stripes); [-0.6, 0, 0.6].forEach((y) => { const s = new T.Mesh(new T.CylinderGeometry(0.75 - y * 0.12, 0.77 - y * 0.12, 0.14, 10), K.M("#e2483a")); s.position.y = y; stripes.add(s); });
      k.anims.push((t) => { drum.rotation.y = t * 1.4; });
      // site office, portaloo, skip, materials, cones, floodlight
      return finishSite(k, { b, gl, em, Y, STEEL, r });
    }
    function finishSite(k, o) {
      const { b, gl, em, Y } = o;
      b(5.9, 0, -0.4, 1.0, 2.2, 1.0, "#2f8fe0"); b(5.9, 2.2, -0.4, 1.1, 0.12, 1.1, "#ffffff");
      b(2.9, 0, -5.0, 2.2, 1.1, 1.3, Y); b(2.9, 1.1, -5.0, 2.3, 0.06, 1.4, "#c8a010");
      for (let i = 0; i < 4; i++) b(2.9 - 0.7 + i * 0.45, 1.0, -5.0, 0.4, 0.25, 0.5, ["#a0a0a0", "#8a6a4a", "#b8b8b4", "#7a5a3a"][i]);
      [[4.0, 0.2], [5.4, 0.2]].forEach(([x, z]) => { b(x, 0, z, 1.1, 0.12, 1.1, "#a06c3c"); for (let i = 0; i < 4; i++) b(x, 0.12 + i * 0.22, z, 1.0, 0.22, 1.0, i % 2 ? "#b8503a" : "#c8603a"); });
      for (let i = 0; i < 5; i++) b(4.7, 0.15 + Math.floor(i / 3) * 0.26, 1.6 + (i % 3) * 0.28 - (i > 2 ? -0.14 : 0), 2.6, 0.26, 0.26, "#8a8a94");
      [[-1.2, 6.4], [1.2, 6.4], [-0.5, 6.9], [0.5, 6.9]].forEach(([x, z]) => { b(x, 0, z, 0.38, 0.06, 0.38, "#18181c"); b(x, 0.06, z, 0.26, 0.5, 0.26, "#ff7a1a"); b(x, 0.3, z, 0.28, 0.1, 0.28, "#ffffff"); });
      b(-5.2, 0, 4.2, 2.6, 2.3, 1.8, "#e8e4d8"); b(-5.2, 2.3, 4.2, 2.8, 0.12, 2.0, "#8a8a94"); gl(-5.2, 1.0, 5.11, 1.4, 0.8, 0.04, "#bfe4ff"); b(-4.2, 0, 5.11, 0.6, 1.9, 0.04, "#5a6a7a");
      sign(k.g, 1.6, 0.4, -5.6, 2.0, 5.13, (c, W, h) => { c.fillStyle = "#2f7a4a"; c.fillRect(0, 0, W, h); txt(c, "SITE OFFICE", W / 2, h / 2 + 2, 34, "#ffffff"); });
      b(6.1, 0, -5.3, 0.16, 6.0, 0.16, "#5a5a66"); b(6.1, 6.0, -5.3, 1.4, 0.4, 0.3, "#3a3a44"); em(6.1, 6.0, -5.13, 1.2, 0.3, 0.04, "#fff4d0");
      b(0.6, 0, 4.9, 1.1, 0.5, 0.7, "#2f8a4a"); b(0.6, 0.15, 5.5, 0.08, 0.08, 0.9, "#5a5a66"); b(0.6, 0, 4.4, 0.3, 0.3, 0.3, "#18181c"); b(0.6, 0.5, 4.9, 0.9, 0.12, 0.5, "#9a9a96");
      // builder dogs: digging, pushing the barrow, waving the mixer in, hammering on the scaffold
      staff(k, "husky", -3.1, 2.3, Math.PI, { hardhat: Y, vest: "#ff7a1a", anim: (t, d) => d.dog.pose({ pawL: Math.max(0, Math.sin(t * 6)), pawR: Math.max(0, Math.sin(t * 6 + 3)), wag: K.wag(t, 10) }) });
      staff(k, "lab", 0.6, 5.9, Math.PI, { hardhat: "#ffffff", vest: "#ff7a1a", anim: (t, d) => { d.position.x = 0.6 + Math.sin(t * 0.7) * 0.15; d.dog.pose({ run: 0.4, phase: t * 8, wag: K.wag(t, 8) }); } });
      staff(k, "dalmatian", 5.4, 2.0, -0.6, { hardhat: Y, vest: "#c8f03a", anim: (t, d) => d.dog.pose({ pawR: 0.6 + Math.sin(t * 7) * 0.4, sit: 0.6, mouth: 0.5, wag: K.wag(t, 14) }) });
      staff(k, "chocolate", -2.0, 2.9, 0, { y: 3.46, hardhat: Y, vest: "#ff7a1a", anim: (t, d) => d.dog.pose({ pawL: Math.abs(Math.sin(t * 8)), sit: 0.8, wag: K.wag(t, 10) }) });
      const out = k.done(); out.spots = []; out.roof = null; return out;
    }


    /* ---- The city: one tight square of blocks ----
       A 5 x 5 grid of 14 x 12 m grass pads joined by 2.5 m sandy paths, inside a hedge, the gate on the south (+z) side.
       Kennel pads: three rows of six open-top kennels, all facing south (towards the gate and the usual camera).
       District pads: one building plot each, front facing south. No courtyards, no square: just kennels and buildings.
       Returns { group, kennels, PLOTS, anim(t), gate, avenue }. kennels: { x, z, yaw, fx, fz (door direction), roof, d (distance
       from the gate), bx, bz (pad centre), hw, hd (pad half size), block }. PLOTS (in fill order): { x, z, yaw, district, for }
       where "for" reserves a plot for one build type. avenue: [zSouth, zNorth] of the path through the gate. 306 kennels. */
    function buildCity() {
      const g = group(), r = rng(913), L = [], E = [], kennels = [], PLOTS = [], anims = [];
      const PATH = "#ecdfbc", GRASS = "#78c05c", PAD = "#82c864", HEDGE = ["#3f9a4a", "#4aa24e", "#358a40"];
      const CW = 14, CD = 12, GAP = 2.5, PX = CW + GAP, PZ = CD + GAP, N = 5;
      const XS = [...Array(N)].map((_, i) => (i - (N - 1) / 2) * PX), ZS = [...Array(N)].map((_, i) => -i * PZ);
      const D = (name, type, order) => ({ kind: "district", name, type, order }), K_ = { kind: "kennels" };
      const GRID = [ // row 0 is nearest the gate
        [K_, K_, K_, K_, K_],
        [D("Book Quarter", "library", 1), K_, K_, K_, D("Sports District", "gym", 2)],
        [K_, D("Market District", "supermarket", 0), K_, D("Entertainment District", "cinema", 3), K_],
        [D("New Town", null, 4), K_, K_, K_, D("Old Town", null, 5)],
        [K_, D("Uptown", null, 6), K_, K_, D("Hilltop", null, 7)],
      ];
      const ROOFS = ["#e2483a", "#2f8fe0", "#f0b52e", "#27b39a", "#ee6f9b", "#7a58d8"];
      const W = XS[N - 1] + CW / 2 + GAP, SOUTH = CD / 2 + GAP, NORTH = ZS[N - 1] - CD / 2 - GAP, GX = (XS[1] + XS[2]) / 2;

      /* ground: grass, one sandy floor for all the paths, the lane out of the gate */
      flat(g, 600, 600, GRASS, 0, 0, -30); const far = flat(g, 9000, 9000, GRASS, 0, -0.08, -30); far.receiveShadow = false;
      flat(g, W * 2, SOUTH - NORTH, PATH, 0, 0.018, (SOUTH + NORTH) / 2);
      flat(g, GAP, 70, PATH, GX, 0.018, SOUTH + 35);
      const HX = W + 0.6, HS = SOUTH + 0.6, HN = NORTH - 0.6;
      // the south hedge stops neatly at the gate posts (outer faces 3.35 m either side of the gate), with a short piece to close any gap
      const POST = 3.35; let inL = -Infinity, inR = Infinity;
      for (let x = -HX; x <= HX; x += 2) {
        const dx = x - GX, clear = Math.abs(dx) - 1.05 >= POST;
        if (clear) { L.push([x, 0, HS, 2.1, 1.1 + r() * 0.3, 1.1, HEDGE[Math.floor(r() * 3)]]); if (dx < 0) inL = Math.max(inL, x + 1.05); else inR = Math.min(inR, x - 1.05); }
        L.push([x, 0, HN, 2.1, 1.1 + r() * 0.3, 1.1, HEDGE[Math.floor(r() * 3)]]);
      }
      [[inL, GX - POST], [GX + POST, inR]].forEach(([a, b]) => { if (b - a > 0.05) L.push([(a + b) / 2, 0, HS, b - a + 0.02, 1.2, 1.1, HEDGE[0]]); });
      for (let z = HS; z >= HN; z -= 2) [-HX, HX].forEach((x) => L.push([x, 0, z, 1.1, 1.1 + r() * 0.3, 2.1, HEDGE[Math.floor(r() * 3)]]));
      // small lamp posts where the paths cross
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { if ((i + j) % 2) continue; const x = -W + GAP / 2 + i * PX, z = SOUTH - GAP / 2 - j * PZ; L.push([x, 0, z, 0.12, 2.6, 0.12, "#3a3a44"], [x, 2.55, z, 0.34, 0.07, 0.34, "#3a3a44"]); E.push([x, 2.4, z, 0.26, 0.15, 0.26, "#ffe4a0"]); }
      // trees outside, clouds
      for (let n = 0; n < 380; n++) { const x = -150 + r() * 300, z = -170 + r() * 260; if (Math.abs(x) < HX + 5 && z < HS + 5 && z > HN - 5) continue; if (Math.abs(x - GX) < 5 && z > SOUTH) continue; const s = 1 + r() * 1.5; L.push([x, 0, z, 0.6 * s, 1.8 * s, 0.6 * s, "#7a5230"], [x, 1.5 * s, z, 2.8 * s, 2 * s, 2.8 * s, HEDGE[n % 3]], [x, 3.3 * s, z, 1.7 * s, 1.3 * s, 1.7 * s, "#58ab4a"]); }
      const cl = []; for (let n = 0; n < 24; n++) { const cx = -150 + r() * 300, cz = -210 + r() * 190, cy = 30 + r() * 22, s = 3 + r() * 4; for (let p = 0; p < 5; p++) cl.push([cx + (p - 2) * s * 0.8, cy + (p % 2) * s * 0.35, cz + (r() - 0.5) * s, s * (1.2 + r() * 0.6), s * (0.6 + (p % 3) * 0.25), s * 1.2, "#ffffff"]); }
      const clouds = blocks(g, cl, false); clouds.material = new T.MeshBasicMaterial({ color: "#ffffff", fog: false });

      /* the gate, on the south hedge, at the path between the 2nd and 3rd columns */
      const GZ = HS;
      [-2.8, 2.8].forEach((dx) => { const x = GX + dx; L.push([x, 0, GZ, 1.1, 5.6, 1.1, "#f4ead6"], [x, 5.6, GZ, 1.4, 0.36, 1.4, "#d4483a"]); for (let b = 0; b < 6; b++) { const bx = x + ((b % 3) - 1) * 0.4, by = 6.6 + Math.floor(b / 3) * 0.5 + (b % 2) * 0.2; L.push([bx, by, GZ, 0.45, 0.55, 0.45, ["#ff4a5a", "#ffd23a", "#3aa8ff", "#5ad86a", "#ff8ad8", "#ffffff"][(b + (dx > 0 ? 2 : 0)) % 6]], [bx, 5.96, GZ, 0.02, by - 5.96, 0.02, "#ffffff"]); } });
      L.push([GX, 3.8, GZ + 0.42, 7.2, 1.8, 0.36, "#7a4a28"]);
      sign(g, 6.8, 1.6, GX, 4.7, GZ + 0.62, (c, Wd, h) => { c.fillStyle = "#2f7a4a"; c.fillRect(0, 0, Wd, h); txt(c, "MARSH'S DOG SANCTUARY", Wd / 2, h * 0.4, 110, "#fff8e6"); txt(c, "· MARSH TOWN ·", Wd / 2, h * 0.77, 56, "#ffd23a"); });

      /* pads */
      GRID.forEach((row, ri) => row.forEach((B, ci) => {
        const bx = XS[ci], bz = ZS[ri];
        flat(g, CW, CD, PAD, bx, 0.03, bz);
        if (B.kind === "district") { PLOTS.push({ x: bx, z: bz + 0.3, yaw: 0, district: B.name, for: B.type, order: B.order, block: [bx, bz] }); return; }
        // three rows of six kennels, doors facing south
        const pal = [ROOFS[(ri * 2 + ci) % 6], ROOFS[(ri * 2 + ci + 2) % 6], ROOFS[(ri * 2 + ci + 4) % 6]];
        for (let rr = 0; rr < 3; rr++) for (let kk = 0; kk < 6; kk++) {
          const x = bx - 5.75 + kk * 2.3, z = bz - CD / 2 + 0.95 + rr * 3.8, roof = pal[(kk + rr) % 3], H = 0.62, c = "#f4ead6";
          kennels.push({ x, z, yaw: 0, fx: 0, fz: 1, roof, d: Math.hypot(x - GX, z - GZ), bx, bz, hw: CW / 2, hd: CD / 2, block: `${ri}-${ci}` });
          L.push([x, 0, z, 1.9, 0.06, 1.9, "#c9a46a"], [x, 0.06, z - 0.15, 1.3, 0.12, 1.1, roof]);
          L.push([x, 0, z - 0.89, 1.9, H, 0.12, c], [x - 0.89, 0, z, 0.12, H, 1.9, c], [x + 0.89, 0, z, 0.12, H, 1.9, c], [x - 0.62, 0, z + 0.89, 0.66, H, 0.12, c], [x + 0.62, 0, z + 0.89, 0.66, H, 0.12, c]);
          L.push([x, H, z - 0.89, 2.0, 0.1, 0.18, roof], [x - 0.89, H, z, 0.18, 0.1, 2.0, roof], [x + 0.89, H, z, 0.18, 0.1, 2.0, roof], [x - 0.62, H, z + 0.89, 0.7, 0.1, 0.18, roof], [x + 0.62, H, z + 0.89, 0.7, 0.1, 0.18, roof]);
          L.push([x - 0.62, 0, z + 1.32, 0.3, 0.09, 0.3, ["#e2483a", "#2f8fe0", "#27b39a", "#f0b52e"][kk % 4]], [x - 0.62, 0.09, z + 1.32, 0.22, 0.04, 0.22, "#a8703a"]);
        }
      }));
      PLOTS.sort((a, b) => a.order - b.order);

      blocks(g, L); const em = blocks(g, E, false); em.material = new T.MeshBasicMaterial({ color: "#ffffff" });
      return { group: g, kennels, PLOTS, gate: [GX, GZ], avenue: [SOUTH - 1, NORTH + 1], anim: (t) => anims.forEach((f) => f(t)) };
    }

    Object.assign(K, { buildCity, buildTown, buildSupermarket, buildLibrary, buildGym, buildCinema, buildSite, TOWN_BUILDS: { supermarket: buildSupermarket, library: buildLibrary, gym: buildGym, cinema: buildCinema } });
  }
  window.LPT = { install };
})();
