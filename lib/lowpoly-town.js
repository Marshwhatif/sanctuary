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
   K.buildWaterparkTown(x, z, yaw): the detailed waterpark (K.buildWaterpark is the older, simpler one from lowpoly-sanctuary.js).
   K.buildConcert(x, z, yaw): Marsh Fest, an open-air concert stage with a dancing crowd.
   K.TOWN_BUILDS: { supermarket, library, gym, cinema, waterpark, concert } -> builder, for data-driven scenes. */
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
      if (o.guitar) { bx(d.neck, 0.3, 0.22, 0.06, o.guitar, -0.06, -0.3, 0.2); bx(d.neck, 0.12, 0.08, 0.065, "#f6f4ee", -0.06, -0.3, 0.2); bx(d.neck, 0.46, 0.05, 0.04, "#6a4a2a", 0.26, -0.24, 0.21); bx(d.neck, 0.1, 0.08, 0.05, "#2a2a30", 0.52, -0.22, 0.21); }
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


    /* ---- The waterpark ----
       buildWaterpark(x, z, yaw): a slide tower with two open slides into a big pool, a lazy river round a sandy island
       (sunbeds, palms, an ice-cream cart), a splash zone with a tipping bucket and a mushroom fountain, a lifeguard and
       an entrance arch. Built to be cheap on phones: all the fixed parts are one instanced mesh, both slides one swept mesh,
       all the water one flat mesh with a scrolling ripple texture (opaque, so swimming dogs just sink into it), every
       splash and drip one Points mesh moved on the GPU, the river rings one instanced mesh. anim(t) only sets a few numbers.
       Returns the usual { group, spots, staff, centre, anim } plus .fx (the splash points: hide when far or baking the map),
       .always (anim is cheap, and the ring riders need their rings in step from any distance) and .pathSign (no roof: the
       page paints the name on the path in front). Spots with .path(t, o) move along a route and set o.x/y/z, yaw, pitch,
       run, drop, hop; the return value is how far to sink the dog, as a share of its height. Spots carry .text for the card. */
    function buildWaterpark(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, spot } = k, Y = yaw || 0, cs = Math.cos(Y), sn = Math.sin(Y), r = rng(811);
      const WL = 0.075, WHITE = "#f6f4ee", BLUE = "#2f8fe0", RED = "#e2483a", YEL = "#f0b52e", TEAL = "#27b39a", PINK = "#ee6f9b";
      const wx = (x, z) => ox + x * cs + z * sn, wz = (x, z) => oz - x * sn + z * cs;
      // a polyline walked at constant speed: at(f) -> local position and direction
      function poly(pts) { const P = pts.map((p) => p.slice()), C = [0]; for (let i = 1; i < P.length; i++) C.push(C[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
        const len = C[C.length - 1] || 1, out = { len, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, h: 1 };
        out.at = (f) => { const s = Math.max(0, Math.min(1, f)) * len; let i = 1; while (i < C.length - 1 && C[i] < s) i++; const a = P[i - 1], c = P[i], u = (s - C[i - 1]) / (C[i] - C[i - 1] || 1);
          out.x = a[0] + (c[0] - a[0]) * u; out.y = a[1] + (c[1] - a[1]) * u; out.z = a[2] + (c[2] - a[2]) * u; out.dx = c[0] - a[0]; out.dy = c[1] - a[1]; out.dz = c[2] - a[2]; out.h = Math.hypot(out.dx, out.dz) || 1e-4; return out; };
        return out; }
      function put(o, p, y) { o.x = wx(p.x, p.z); o.z = wz(p.x, p.z); o.y = y === undefined ? p.y : y; o.yaw = Math.atan2(p.dx, p.dz) + Y; }

      /* deck, fence, entrance arch */
      b(0, 0, 0, 13.4, 0.06, 11.4, "#efe4cf");
      for (let x = -6.2; x <= 6.21; x += 0.8) b(x, 0.06, 1.05, 0.02, 0.004, 0.9, "#e2d4ba"); // deck joints on the strip by the pool
      const fence = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6)); for (let i = 0; i <= n; i++) b(x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, 0.1, 1.0, 0.1, WHITE);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.abs(x1 - x0) + 0.1, d = Math.abs(z1 - z0) + 0.1; b(cx, 0.9, cz, w, 0.08, d, BLUE); b(cx, 0.45, cz, w, 0.05, d, WHITE); };
      fence(-6.6, -5.6, 6.6, -5.6); fence(-6.6, -5.6, -6.6, 5.6); fence(6.6, -5.6, 6.6, 5.6); fence(-6.6, 5.6, -1.4, 5.6); fence(1.4, 5.6, 6.6, 5.6);
      [-1.2, 1.2].forEach((x) => { b(x, 0, 5.62, 0.26, 2.3, 0.26, BLUE); b(x, 2.3, 5.62, 0.36, 0.12, 0.36, WHITE); });
      b(0, 2.0, 5.62, 2.7, 0.66, 0.2, BLUE);
      sign(k.g, 2.5, 0.56, 0, 2.33, 5.725, (c, W, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#3ab4ee"); gr.addColorStop(1, "#1f7fc0"); c.fillStyle = gr; c.fillRect(0, 0, W, h); c.fillStyle = "rgba(255,255,255,0.35)"; for (let x = 0; x < W; x += 40) c.fillRect(x, h - 22 + Math.sin(x / 30) * 6, 26, 8); txt(c, "MARSH SPLASH", W / 2, h * 0.47, 92, "#ffffff"); });
      for (let i = 0; i < 7; i++) b(-1.05 + i * 0.35, 2.66, 5.62, 0.18, 0.22 + (i % 2) * 0.1, 0.18, [RED, YEL, TEAL, PINK, BLUE, YEL, RED][i]);

      /* the pool (x -3.4..3.6, z -5..0.6) and the lazy river round the island (x -5.7..5.7, z 1.55..5.25) */
      const POOL = [-3.4, -5.0, 3.6, 0.6], RIV = [-5.7, 1.55, 5.7, 5.25];
      const cope = (x0, z0, x1, z1) => { const t = 0.28; b((x0 + x1) / 2, 0.06, z0 - t / 2, x1 - x0 + t * 2, 0.1, t, WHITE); b((x0 + x1) / 2, 0.06, z1 + t / 2, x1 - x0 + t * 2, 0.1, t, WHITE); b(x0 - t / 2, 0.06, (z0 + z1) / 2, t, 0.1, z1 - z0, WHITE); b(x1 + t / 2, 0.06, (z0 + z1) / 2, t, 0.1, z1 - z0, WHITE); };
      cope(...POOL); cope(...RIV);
      for (let x = -3.2; x < 3.5; x += 0.5) b(x, 0.16, 0.72, 0.18, 0.012, 0.12, x < -2.6 || x > 2.9 ? RED : BLUE); // depth marks on the front coping
      // island
      b(0, 0, 3.4, 9.2, 0.14, 1.5, "#f0d9a0"); b(0, 0.14, 3.4, 9.0, 0.012, 1.3, "#f6e2ae");
      [[-4.15, 3.75], [0.15, 3.0]].forEach(([x, z], pi) => { // palms
        for (let s = 0; s < 6; s++) b(x + Math.sin(s * 0.5) * 0.12 * (pi ? -1 : 1), 0.14 + s * 0.45, z, 0.24 - s * 0.012, 0.46, 0.24 - s * 0.012, s % 2 ? "#a0703a" : "#8a5c2e");
        const tx = x + Math.sin(2.5) * 0.12 * (pi ? -1 : 1), ty = 2.84;
        for (let l = 0; l < 7; l++) { const a = l / 7 * Math.PI * 2 + pi; b(tx + Math.cos(a) * 0.55, ty, z + Math.sin(a) * 0.55, 1.1, 0.07, 0.34, "#3aa84a", -a); b(tx + Math.cos(a) * 1.15, ty - 0.22, z + Math.sin(a) * 1.15, 0.6, 0.06, 0.3, "#2f9440", -a); }
        b(tx, ty - 0.12, z, 0.34, 0.26, 0.34, "#6a4a22"); });
      [1.35, 2.55, 3.75].forEach((x, i) => { b(x, 0.14, 3.45, 0.66, 0.2, 1.2, WHITE); b(x, 0.34, 3.5, 0.6, 0.04, 1.0, [BLUE, PINK, TEAL][i]); b(x, 0.34, 2.95, 0.6, 0.34, 0.12, [BLUE, PINK, TEAL][i]); b(x - 0.36, 0.14, 3.0, 0.06, 0.2, 0.06, "#b8b8c0"); b(x + 0.36, 0.14, 3.0, 0.06, 0.2, 0.06, "#b8b8c0"); });
      [1.95, 3.15].forEach((x, i) => { b(x, 0.14, 2.85, 0.05, 1.5, 0.05, WHITE); [[1.0, 0], [0.7, 0.09], [0.36, 0.18]].forEach(([w, y]) => b(x, 1.6 + y, 2.85, w, 0.09, w, i ? YEL : RED)); });
      // ice-cream cart on the island
      { const x = -2.7, z = 3.35; b(x, 0.14, z, 1.4, 0.82, 0.8, "#ffd6e6"); b(x, 0.96, z, 1.46, 0.06, 0.86, PINK); b(x - 0.55, 0.14, z + 0.42, 0.34, 0.34, 0.06, "#3a3a48"); b(x + 0.55, 0.14, z + 0.42, 0.34, 0.34, 0.06, "#3a3a48");
        for (let i = 0; i < 4; i++) { b(x - 0.45 + i * 0.3, 1.02, z + 0.12, 0.2, 0.16, 0.2, ["#ffffff", "#ff9ac0", "#8a5a3a", "#9ae0a0"][i]); }
        b(x, 0.96, z - 0.2, 0.05, 1.1, 0.05, WHITE); [[1.1, 0], [0.75, 0.09], [0.38, 0.18]].forEach(([w, y], j) => b(x, 2.06 + y, z - 0.2, w, 0.09, w, j % 2 ? WHITE : PINK));
        sign(k.g, 1.3, 0.34, x, 0.6, z + 0.41, (c, W, h) => { c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, h); txt(c, "ICE CREAM · PUPSICLES", W / 2, h / 2 + 2, 30, PINK); }); }
      // pool toys and the inflatable duck
      b(2.2, WL, -0.7, 0.9, 0.36, 0.6, YEL); b(2.5, WL + 0.36, -0.7, 0.4, 0.4, 0.4, YEL); b(2.78, WL + 0.48, -0.7, 0.22, 0.1, 0.18, "#ff8a3a"); b(2.62, WL + 0.62, -0.84, 0.05, 0.08, 0.02, "#18181c"); b(2.62, WL + 0.62, -0.56, 0.05, 0.08, 0.02, "#18181c");
      [[-0.2, -4.4, RED], [3.0, -4.6, YEL], [-2.4, -0.4, TEAL]].forEach(([x, z, c]) => { b(x, WL, z, 0.34, 0.34, 0.34, c); b(x, WL + 0.1, z, 0.36, 0.14, 0.36, WHITE); }); // beach balls
      // pool ladder at the front left, and two water cannons on the back edge
      [-2.55, -2.15].forEach((x) => { b(x, 0.06, 0.58, 0.05, 0.9, 0.05, "#c8ccd4"); b(x, 0.92, 0.7, 0.05, 0.05, 0.3, "#c8ccd4"); });
      [-1.0, 1.4].forEach((x) => { b(x, 0.06, -5.25, 0.5, 0.5, 0.5, YEL); b(x, 0.56, -5.05, 0.18, 0.18, 0.55, RED); });

      /* slide tower: platform x -6..-4, z -5.4..-3.4 at 3.6 m, stairs up the front, striped canopy */
      const TH = 3.6;
      [[-5.95, -5.35], [-4.05, -5.35], [-5.95, -3.45], [-4.05, -3.45]].forEach(([x, z]) => b(x, 0, z, 0.2, 5.4, 0.2, BLUE));
      for (let y = 0.9; y < TH; y += 0.9) { b(-5, y, -5.35, 1.9, 0.08, 0.08, WHITE); b(-5.95, y, -4.4, 0.08, 0.08, 1.9, WHITE); }
      b(-5, TH - 0.18, -4.4, 2.1, 0.18, 2.1, "#d8dce4");
      b(-5.95, TH, -4.4, 0.06, 0.9, 1.9, WHITE); b(-5, TH, -5.35, 1.9, 0.9, 0.06, WHITE); b(-5.6, TH, -3.45, 0.6, 0.9, 0.06, WHITE); // railings (stair gap at the front, slides leave from the right)
      b(-5, TH + 0.85, -4.4, 2.0, 0.08, 2.0, YEL);
      for (let i = 0; i < 6; i++) b(-5.95 + i * 0.38 + 0.19, 5.4, -4.4, 0.38, 0.16, 2.3, i % 2 ? WHITE : RED);
      b(-5, 5.56, -4.4, 1.4, 0.16, 1.6, RED); b(-5, 5.72, -4.4, 0.7, 0.16, 0.9, WHITE);
      for (let s = 0; s < 12; s++) { const z = -0.4 - (s + 0.5) * 0.25, y = s * 0.3; b(-5, y, z, 0.9, 0.3, 0.27, BLUE); b(-5, y + 0.3, z, 0.92, 0.02, 0.27, WHITE); }
      [-5.48, -4.52].forEach((x) => { for (let s = 0; s < 12; s += 3) b(x, s * 0.3 + 0.3, -0.5 - s * 0.25, 0.06, 0.9, 0.06, WHITE); b(x, 0, -0.45, 0.08, 1.2, 0.08, WHITE); });
      sign(k.g, 1.7, 0.5, -5, 2.6, -3.33, (c, W, h) => { c.fillStyle = YEL; c.fillRect(0, 0, W, h); txt(c, "SLIDES ↑", W / 2, h / 2 + 2, 60, "#18181c"); });

      /* the two slides: open half-pipes swept along curves, one mesh, striped, with posts down to the deck or pool floor */
      const SL = [
        { pts: [[-4.0, TH, -4.9], [-2.8, 3.35, -5.0], [-1.4, 3.0, -4.7], [-0.5, 2.6, -3.9], [-0.3, 2.2, -2.8], [0.5, 1.8, -2.0], [1.6, 1.4, -2.0], [2.4, 1.0, -2.7], [2.5, 0.6, -3.7], [1.8, 0.3, -4.3]], c: [RED, YEL] },
        { pts: [[-4.0, TH, -3.75], [-3.3, 3.3, -3.5], [-2.5, 2.3, -2.7], [-2.0, 1.2, -1.6], [-1.6, 0.5, -0.8], [-1.2, 0.3, -0.25]], c: [TEAL, WHITE] },
      ];
      const sp = [], sc = [], cA = new T.Color(), cB = new T.Color(), UP = new T.Vector3(0, 1, 0), S = new T.Vector3(), U = new T.Vector3(), V = [];
      SL.forEach((sl) => {
        const curve = new T.CatmullRomCurve3(sl.pts.map((p) => new T.Vector3(p[0], p[1], p[2]))), N = Math.ceil(curve.getLength() / 0.22), R = 0.42, NP = 7;
        cA.set(sl.c[0]); cB.set(sl.c[1]); const ring = [];
        for (let i = 0; i <= N; i++) { const u = i / N, P = curve.getPointAt(u), Tn = curve.getTangentAt(u); S.crossVectors(Tn, UP).normalize(); U.crossVectors(S, Tn).normalize();
          const row = []; for (let j = 0; j < NP; j++) { const a = Math.PI * j / (NP - 1), lip = j === 0 || j === NP - 1 ? 1.25 : 1; row.push([P.x + S.x * Math.cos(a) * R + U.x * (R * lip - Math.sin(a) * R), P.y + S.y * Math.cos(a) * R + U.y * (R * lip - Math.sin(a) * R), P.z + S.z * Math.cos(a) * R + U.z * (R * lip - Math.sin(a) * R)]); }
          ring.push(row); if (i % 5 === 2 && P.y > 0.5) b(P.x, 0, P.z, 0.12, P.y - 0.05, 0.12, "#e8e8f0"); }
        for (let i = 0; i < N; i++) { const col = Math.floor(i / 3) % 2 ? cB : cA; for (let j = 0; j < NP - 1; j++) { const a = ring[i][j], c = ring[i][j + 1], d = ring[i + 1][j], e = ring[i + 1][j + 1];
          sp.push(...a, ...d, ...c, ...c, ...d, ...e); for (let q = 0; q < 6; q++) sc.push(col.r, col.g, col.b); } }
        sl.path = poly(curve.getSpacedPoints(40).map((p) => [p.x, p.y + 0.02, p.z]));
      });
      { const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(sp, 3)); geo.setAttribute("color", new T.Float32BufferAttribute(sc, 3)); geo.computeVertexNormals();
        const m = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })); m.castShadow = true; m.receiveShadow = true; k.g.add(m); }

      /* splash zone (x 3.9..6.4): rubber pad, tipping bucket on a frame, mushroom fountain, ground jets */
      b(5.15, 0.06, -2.2, 2.6, 0.012, 6.6, "#5ac8ee");
      [[4.6, -0.2, YEL], [5.7, -1.8, PINK], [4.7, -3.0, "#7a58d8"], [5.8, 0.6, TEAL]].forEach(([x, z, c]) => b(x, 0.072, z, 0.7, 0.006, 0.7, c));
      [[4.35, -4.6], [5.95, -4.6], [4.35, -3.4], [5.95, -3.4]].forEach(([x, z]) => b(x, 0.06, z, 0.18, 3.6, 0.18, YEL));
      b(5.15, 3.6, -4.0, 1.85, 0.2, 1.4, RED); b(5.15, 3.8, -4.0, 0.2, 0.5, 0.2, "#c8ccd4"); b(5.15, 4.2, -4.4, 0.16, 0.16, 0.9, "#c8ccd4");
      const bucket = new T.Group(); bucket.position.set(5.15, 3.0, -4.0); k.g.add(bucket);
      { const m = blocks(bucket, [[0, -0.55, 0, 1.0, 0.1, 1.0, BLUE], [0, -0.45, -0.46, 1.0, 0.75, 0.08, BLUE], [0, -0.45, 0.46, 1.0, 0.75, 0.08, BLUE], [-0.46, -0.45, 0, 0.08, 0.75, 0.84, BLUE], [0.46, -0.45, 0, 0.08, 0.75, 0.84, BLUE], [0, -0.1, 0, 0.84, 0.32, 0.84, "#9ae4ff"], [-0.6, -0.05, 0, 0.2, 0.1, 0.1, "#c8ccd4"], [0.6, -0.05, 0, 0.2, 0.1, 0.1, "#c8ccd4"]], false); m.castShadow = false; }
      b(5.15, 0.06, -1.0, 0.34, 1.6, 0.34, WHITE); b(5.15, 1.62, -1.0, 1.5, 0.26, 1.5, RED); b(5.15, 1.88, -1.0, 1.0, 0.16, 1.0, RED);
      [[-0.45, -0.3], [0.4, 0.35], [0.1, -0.5], [-0.3, 0.45], [0.55, -0.2]].forEach(([dx, dz]) => b(5.15 + dx, 1.88, -1.0 + dz, 0.16, 0.03, 0.16, WHITE));
      const JETS = [[4.5, 0.4], [5.8, 0.0], [4.5, -2.2], [5.8, -2.6]]; JETS.forEach(([x, z]) => b(x, 0.06, z, 0.18, 0.04, 0.18, "#c8ccd4"));

      /* lifeguard chair on the strip in front of the pool */
      { const x = 0.6, z = 1.1; [[-0.32, -0.22], [0.32, -0.22], [-0.32, 0.22], [0.32, 0.22]].forEach(([dx, dz]) => b(x + dx, 0.06, z + dz, 0.08, 1.5, 0.08, WHITE));
        for (let y = 0.35; y < 1.4; y += 0.35) b(x, y, z + 0.22, 0.64, 0.05, 0.05, WHITE);
        b(x, 1.5, z - 0.16, 0.8, 0.08, 0.92, RED); b(x, 1.58, z + 0.28, 0.8, 0.6, 0.06, RED); // deep seat, so the sitting lifeguard fits in front of the backrest
        b(x + 0.42, 1.5, z + 0.28, 0.05, 1.5, 0.05, WHITE); [[1.2, 0], [0.8, 0.1]].forEach(([w, y], j) => b(x + 0.42, 3.0 + y, z + 0.28, w, 0.1, w, j ? WHITE : RED));
        sign(k.g, 0.8, 0.26, x, 1.2, z - 0.31, (c, W, h) => { c.fillStyle = RED; c.fillRect(0, 0, W, h); txt(c, "LIFEGUARD", W / 2, h / 2 + 2, 30, "#ffffff"); }, Math.PI); }
      { const lg = staff(k, "lab", 0.6, 1.0, Math.PI, { scale: 1.15, cap: RED, whistle: true, anim: (t, d) => { d.head.rotation.y = Math.sin(t * 0.6) * 0.7; d.dog.pose({ sit: 1, wag: K.wag(t, 10) }); } });
        // measure him sitting, then rest his bottom on the seat with his back just in front of the backrest (which is at z + 0.25)
        const par = lg.parent; par.remove(lg); lg.position.set(0, 0, 0); lg.rotation.set(0, 0, 0); lg.dog.pose({ sit: 1 }); lg.updateMatrixWorld(true);
        const bb = new T.Box3().setFromObject(lg); par.add(lg); lg.position.set(0.6, 1.58 - bb.min.y + 0.005, 1.1 + 0.24 + bb.min.z); lg.rotation.set(0, Math.PI, 0); }
      staff(k, "pug", -2.7, 2.78, 0, { y: 0.14, apron: PINK, cap: WHITE, anim: (t, d) => { d.head.rotation.y = Math.sin(t * 0.9) * 0.4; d.dog.pose({ wag: K.wag(t, 14), mouth: 0.3 }); } });

      /* all the water: one flat mesh, UVs in world metres, a ripple texture that drifts */
      const cv = document.createElement("canvas"); cv.width = cv.height = 128; { const c = cv.getContext("2d"); c.fillStyle = "#3cb4ec"; c.fillRect(0, 0, 128, 128); c.strokeStyle = "rgba(255,255,255,0.32)"; c.lineWidth = 3;
        for (let row = 0; row < 4; row++) for (let rep = -1; rep <= 1; rep++) { c.beginPath(); for (let x = 0; x <= 128; x += 4) { const y = row * 32 + 10 + rep * 128 + Math.sin((x / 128) * Math.PI * 4 + row * 1.7) * 6; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
        c.fillStyle = "rgba(255,255,255,0.18)"; for (let i = 0; i < 14; i++) c.fillRect(r() * 120, r() * 120, 6, 3); }
      const wtex = new T.CanvasTexture(cv); wtex.wrapS = wtex.wrapT = T.RepeatWrapping; wtex.colorSpace = T.SRGBColorSpace;
      { const P = [], UV = [], Nn = []; const quad = (x0, z0, x1, z1) => { [[x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([x, z]) => { P.push(x, WL, z); UV.push(x / 2.2, -z / 2.2); Nn.push(0, 1, 0); }); };
        quad(...POOL); quad(...RIV);
        const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(P, 3)); geo.setAttribute("uv", new T.Float32BufferAttribute(UV, 2)); geo.setAttribute("normal", new T.Float32BufferAttribute(Nn, 3));
        const m = new T.Mesh(geo, new T.MeshLambertMaterial({ map: wtex, emissive: "#0c3c5c" })); m.receiveShadow = true; k.g.add(m); }

      /* lazy river rings, pool rings: one instanced mesh */
      const RX = 5.15, RZ = 1.3, RC = 0.85, rcz = 3.4, RP = [];
      { const arc = (cx, cz, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * Math.PI / 2; RP.push([cx + Math.cos(a) * RC, WL, cz + Math.sin(a) * RC]); } };
        arc(RX - RC, rcz + RZ - RC, 0); arc(-RX + RC, rcz + RZ - RC, Math.PI / 2); arc(-RX + RC, rcz - RZ + RC, Math.PI); arc(RX - RC, rcz - RZ + RC, Math.PI * 1.5); RP.push(RP[0].slice()); }
      const river = poly(RP), NR = 10, POOLR = [[-0.9, -1.4], [1.2, -3.3], [-2.6, -2.6]], ringCols = [RED, YEL, BLUE, PINK, TEAL, "#ff8a3a", "#7a58d8", "#5ad86a", RED, YEL, PINK, "#ff8a3a", TEAL];
      const ringM = new T.InstancedMesh(new T.TorusGeometry(0.4, 0.15, 5, 10).rotateX(Math.PI / 2), new T.MeshLambertMaterial({ color: "#ffffff" }), NR + POOLR.length);
      ringCols.forEach((c, i) => ringM.setColorAt(i, K.COL.set(c))); ringM.castShadow = false; ringM.receiveShadow = true; k.g.add(ringM);
      const RIVER_P = 70, ringAt = (i, t) => river.at((((t / RIVER_P + i / NR) % 1) + 1) % 1);

      /* splashes, drips, jets and the bucket dump: one Points mesh, moved on the GPU */
      const PO = [], PV = [], PA = []; // origin, velocity, [period, phase, life, size]
      const emit = (n, o, v, sp2, period, life, size, phase) => { for (let i = 0; i < n; i++) { PO.push(o[0] + (r() - 0.5) * sp2[0], o[1] + (r() - 0.5) * sp2[1], o[2] + (r() - 0.5) * sp2[2]);
        const a = r() * Math.PI * 2; PV.push(v[0] + Math.cos(a) * v[3] * r(), v[1] * (0.7 + 0.3 * r()), v[2] + Math.sin(a) * v[3] * r()); PA.push(period, phase === undefined ? i / n + r() * 0.05 : phase - r() * 0.05, life, size * (0.7 + 0.6 * r())); } };
      SL.forEach((sl) => { const e = sl.path.at(1); emit(34, [e.x, WL, e.z], [e.dx * 2, 2.2, e.dz * 2, 1.3], [0.5, 0, 0.5], 0.9, 0.95, 0.15); });
      JETS.forEach(([x, z]) => emit(22, [x, 0.1, z], [0, 4.4, 0, 0.35], [0.06, 0, 0.06], 1.0, 0.9, 0.13));
      for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; emit(1, [5.15 + Math.cos(a) * 0.76, 1.66, -1.0 + Math.sin(a) * 0.76], [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5, 0.05], [0, 0, 0], 0.8, 0.85, 0.11, (i * 0.37) % 1); }
      [-1.0, 1.4].forEach((x) => emit(26, [x, 0.66, -4.75], [0, 1.6, 2.6, 0.25], [0.05, 0, 0.05], 1.1, 0.8, 0.13));
      emit(90, [5.15, 2.6, -3.5], [0, -0.4, 1.0, 0.7], [0.9, 0.3, 0.3], 6, 0.17, 0.2, -0.84);
      const pg = new T.BufferGeometry(); pg.setAttribute("position", new T.Float32BufferAttribute(PO, 3)); pg.setAttribute("aV", new T.Float32BufferAttribute(PV, 3)); pg.setAttribute("aP", new T.Float32BufferAttribute(PA, 4));
      const fx = new T.Points(pg, new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uH: { value: 800 } },
        vertexShader: `attribute vec3 aV; attribute vec4 aP; uniform float uT; uniform float uH; varying float vA;
          void main() { float u = fract(uT / aP.x + aP.y), a = u / aP.z;
            if (a > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
            float tt = a * aP.z * aP.x; vec3 p = position + aV * tt; p.y -= 4.9 * tt * tt;
            if (p.y < 0.06) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            gl_PointSize = aP.w * projectionMatrix[1][1] * uH / -mv.z; vA = 1.0 - a * a; }`,
        fragmentShader: `varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(0.9, 0.97, 1.0, 0.85 * vA); }` }));
      fx.frustumCulled = false; fx.renderOrder = 3; k.g.add(fx);

      k.anims.push((t) => {
        wtex.offset.set((t * 0.03) % 1, (t * 0.05) % 1); fx.material.uniforms.uT.value = t % 600;
        const u = ((t / 6) % 1 + 1) % 1, tip = u < 0.8 ? 0.22 * (u / 0.8) : u < 0.86 ? 0.22 + 1.9 * K.ease((u - 0.8) / 0.06) : 2.12 * (1 - K.ease((u - 0.86) / 0.14)); bucket.rotation.x = tip;
        for (let i = 0; i < NR; i++) { const p = ringAt(i, t); K.D.position.set(p.x, WL - 0.02 + Math.sin(t * 2 + i) * 0.025, p.z); K.D.rotation.set(0, 0, 0); K.D.scale.set(1, 1, 1); K.D.updateMatrix(); ringM.setMatrixAt(i, K.D.matrix); }
        POOLR.forEach(([x, z], j) => { K.D.position.set(x + Math.sin(t * 0.3 + j) * 0.3, WL - 0.02 + Math.sin(t * 1.6 + j * 2) * 0.03, z + Math.cos(t * 0.25 + j) * 0.3); K.D.updateMatrix(); ringM.setMatrixAt(NR + j, K.D.matrix); });
        ringM.instanceMatrix.needsUpdate = true;
      });

      /* visitors, most fun first */
      const path = (fn, text, x, z) => k.spots.push({ x: wx(x, z), z: wz(x, z), y: 0, yaw: Y, pose: "path", path: fn, text });
      // slide riders: walk to the stairs, climb, slide, swim back to the ladder, climb out, round again
      const LAD = [-2.35, 0.3];
      for (let i = 0; i < 4; i++) {
        const sl = SL[i % 2], end = sl.path.at(1), ex = end.x, ez = end.z, mid = i % 2 ? [-0.2, -1.3] : [-1.2, -2.6];
        const segs = [
          { p: poly([[LAD[0], 0.06, 0.95], [-4.4, 0.06, 0.95], [-5.0, 0.06, 0.1], [-5.0, 0.06, -0.3]]), d: 2.6, run: 0.8 },
          { p: poly([[-5.0, 0.06, -0.3], [-5.0, TH, -3.3]]), d: 4.2, run: 0.6, hop: 0.06 },
          { p: poly([[-5.0, TH, -3.5], [-4.6, TH, -4.0], [-4.25, TH, sl.pts[0][2]], [-4.0, TH, sl.pts[0][2]]]), d: 1.2, run: 0.5 },
          { p: sl.path, d: 2.2, drop: 1, tilt: 1 },
          { p: poly([[ex, WL, ez], [ex + (mid[0] - ex) * 0.2, WL, ez + (mid[1] - ez) * 0.2], [mid[0], WL, mid[1]], [LAD[0], WL, LAD[1]]]), d: 5.0, run: 1, sink: 0.62, splash: 1 },
          { p: poly([[LAD[0], WL, LAD[1]], [LAD[0], 0.06, 0.95]]), d: 0.7, run: 0.5, sink: 0.3 },
        ];
        const P = segs.reduce((s, g) => s + g.d, 0);
        path((t, o) => { let s = ((t / P + i / 4) % 1 + 1) % 1 * P, g = segs[0]; for (const sg of segs) { g = sg; if (s <= sg.d) break; s -= sg.d; }
          const f = s / g.d, p = g.p.at(f); put(o, p); o.run = g.run || 0; o.drop = g.drop || 0; o.hop = g.hop ? Math.abs(Math.sin(t * 9 + i)) * g.hop : 0; o.ph = t * 11 + i;
          o.pitch = g.tilt ? Math.min(0.7, Math.max(0, Math.atan2(-p.dy, p.h))) : 0;
          let sink = g.sink || 0; if (g.splash && f < 0.06) sink *= f / 0.06; if (g.sink === 0.3) sink = 0.62 * (1 - f); return sink; }, i % 2 ? "Zooming down the speed slide" : "Riding the big twister slide", -5, 0);
      }
      // lazy river: sitting on a ring, turning slowly
      for (let i = 0; i < 10; i += 2) path((t, o) => { const p = ringAt(i, t); put(o, p, WL + 0.06 + Math.sin(t * 2 + i) * 0.025); o.yaw += Math.sin(t * 0.25 + i * 1.3) * 1.6; o.pitch = -0.45; return 0; }, "Floating round the lazy river", 0, 3.4);
      // paddling round in the pool
      [[1.0, -0.4, 0.8], [-1.9, -3.9, 0.6], [2.8, -1.4, 0.5]].forEach(([cx, cz, rr], i) => {
        const pts = []; for (let a = 0; a <= 16; a++) { const an = (a / 16) * Math.PI * 2 * (i % 2 ? -1 : 1); pts.push([cx + Math.cos(an) * rr, WL, cz + Math.sin(an) * rr * 0.8]); } const loop = poly(pts), per = loop.len / 0.35;
        path((t, o) => { const p = loop.at((((t / per + i * 0.29) % 1) + 1) % 1); put(o, p, WL + Math.sin(t * 3 + i) * 0.02); o.run = 1; o.ph = t * 9 + i; return 0.6; }, "Paddling in the pool", cx, cz); });
      const S2 = (x, z, pose, yw, y, text) => { spot(x, z, pose, yw, y); k.spots[k.spots.length - 1].text = text; };
      S2(5.15, -4.0, "stand", 0, 0.07, "Waiting for the big bucket to tip");
      S2(4.6, -2.0, "hop", 0.4, 0.07, "Jumping in the splash zone");
      [1.35, 3.75].forEach((x) => S2(x, 3.55, "lie", 0, 0.38, "Sunbathing by the lazy river"));
      S2(-1.75, 3.55, "stand", -Math.PI / 2, 0.15, "Queueing for a pupsicle");
      S2(2.4, 1.15, "shake", -0.4, 0.06, "Shaking off by the pool");

      const out = k.done(); out.fx = fx; out.always = true; out.pathSign = true; out.weight = 2; out.near2 = 24 * 24; out.roof = null; return out; // (near2: staff and splashes only close up)
    }

    /* ---- The concert: Marsh Fest ----
       buildConcert(x, z, yaw): an open-air festival. A truss stage with a canopy, a pixel LED wall, hanging speaker
       stacks, subs, a drum riser and a band of staff dogs (singer, guitarist, drummer); a crowd barrier, a trampled
       field, a merch stall (propeller hats), a sound desk, toilets, flags, bunting and an entrance arch.
       Cheap on phones like the waterpark: every fixed part is one instanced mesh, the light heads two (they flash on
       the beat by changing one colour), the light beams one instanced cone mesh, confetti and sparks one Points mesh
       moved on the GPU, and the LED wall a 192 x 72 canvas redrawn 12 times a second, only when close.
       Visitors dance in time (one shared beat): jumping, headbanging or swaying, and one crowd-surfs.
       Returns the usual build plus .fx (points), .extra (the beams: hidden when far, like fx), .pathSign, .weight, .near2. */
    function buildConcert(ox, oz, yaw) {
      const k = kit(ox, oz, yaw), { b, spot } = k, Y = yaw || 0, cs = Math.cos(Y), sn = Math.sin(Y), r = rng(877);
      const wx = (x, z) => ox + x * cs + z * sn, wz = (x, z) => oz - x * sn + z * cs;
      const BLK = "#1e1e26", DK = "#34343e", TR = "#a8aeb8", RED = "#e2483a", BLUE = "#2f8fe0", YEL = "#f0b52e", TEAL = "#27b39a", PINK = "#ee6f9b", PUR = "#7a58d8", WHITE = "#f6f4ee", GOLD = "#e0b030";
      const BPM = 124, BEAT = 60 / BPM, beat = (t) => t / BEAT, DECK = 1.0, SZ = -2.2; // SZ: the stage's front edge
      const LA = [], LB = []; // light lenses that flash on alternate beats

      /* field: grass, trampled crowd area with muddy patches */
      b(0, 0, 0, 13.4, 0.06, 11.4, "#74ad4c");
      b(0, 0.06, 1.4, 11.8, 0.004, 5.8, "#a2936a");
      for (let i = 0; i < 24; i++) b(-5.4 + r() * 10.8, 0.064, -1.1 + r() * 4.6, 0.4 + r() * 0.9, 0.003, 0.3 + r() * 0.7, r() < 0.5 ? "#8e7e50" : "#b2a276");
      // fence with the gate at the front
      const fence = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.4)); for (let i = 0; i <= n; i++) b(x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, 0.09, 1.15, 0.09, "#4a4a54");
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.abs(x1 - x0) + 0.06, d = Math.abs(z1 - z0) + 0.06; [0.2, 0.62, 1.05].forEach((y) => b(cx, y, cz, w, 0.05, d, "#c8ccd4")); };
      fence(-6.6, -5.6, 6.6, -5.6); fence(-6.6, -5.6, -6.6, 5.6); fence(6.6, -5.6, 6.6, 5.6); fence(-6.6, 5.6, -1.9, 5.6); fence(1.9, 5.6, 6.6, 5.6);

      /* the stage: deck x -5..5, z -5.4..SZ, 1 m up */
      b(0, 0, -3.8, 10.2, DECK, 3.2, BLK); b(0, DECK, -3.8, 10.2, 0.04, 3.2, DK);
      for (let x = -4.8; x <= 4.81; x += 0.6) b(x, 0.1, SZ + 0.01, 0.04, 0.8, 0.02, "#2a2a34"); // skirt pleats
      LA.push([0, DECK - 0.07, SZ + 0.015, 10.2, 0.05, 0.03, "#ffffff"]); // LED strip along the lip
      for (let s = 0; s < 4; s++) b(5.4 + s * 0.24, 0, -4.7, 0.24, DECK - s * 0.25, 0.9, DK); // steps up at stage right
      // truss: four towers, beams round the top, a black canopy
      [[-5.3, -5.5], [5.3, -5.5], [-5.3, SZ + 0.05], [5.3, SZ + 0.05]].forEach(([x, z]) => { b(x, 0, z, 0.3, 6.0, 0.3, "#8a909a"); for (let y = 0.3; y < 6; y += 0.5) b(x, y, z, 0.36, 0.04, 0.36, TR); b(x, 0, z, 0.6, 0.06, 0.6, "#5a5e66"); });
      [SZ + 0.05, -5.5].forEach((z) => { b(0, 5.7, z, 10.9, 0.32, 0.32, "#8a909a"); for (let x = -5.0; x <= 5.01; x += 0.5) b(x, 5.68, z, 0.04, 0.36, 0.36, TR); });
      [-5.3, 5.3].forEach((x) => b(x, 5.7, -3.8, 0.32, 0.32, 3.6, "#8a909a"));
      b(0, 6.02, -3.8, 11.4, 0.14, 4.0, BLK); b(0, 5.86, SZ + 0.3, 11.4, 0.3, 0.06, BLK);
      b(0, 6.16, SZ + 0.4, 6.4, 0.95, 0.12, BLK); // backing for the name board on the roof
      sign(k.g, 6.2, 0.85, 0, 6.64, SZ + 0.47, (c, W, h) => { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#ff4fa0"); g.addColorStop(0.5, "#7a58d8"); g.addColorStop(1, "#2f8fe0"); c.fillStyle = g; c.fillRect(0, 0, W, h); c.strokeStyle = "#ffffff"; c.lineWidth = 8; c.strokeRect(10, 10, W - 20, h - 20); txt(c, "★ MARSH FEST ★", W / 2, h / 2 + 3, 92, "#ffffff"); }, 0, true);
      // light heads under the front beam (and a few on the back one), lenses flash on the beat
      const HEADS = [-4.2, -3.0, -1.8, -0.6, 0.6, 1.8, 3.0, 4.2];
      HEADS.forEach((x, i) => { b(x, 5.24, SZ + 0.05, 0.26, 0.3, 0.26, BLK); (i % 2 ? LB : LA).push([x, 5.16, SZ + 0.05, 0.18, 0.08, 0.18, [PINK, "#5ad8ff", YEL, PUR][i % 4]]); });
      [-3.6, -1.2, 1.2, 3.6].forEach((x, i) => { b(x, 5.24, -5.5, 0.26, 0.3, 0.26, BLK); (i % 2 ? LA : LB).push([x, 5.16, -5.5, 0.18, 0.08, 0.18, "#ffffff"]); });
      // hanging speaker stacks (a slight J curve) and subs on the ground
      [-5.9, 5.9].forEach((x) => { for (let i = 0; i < 6; i++) { const y = 5.3 - i * 0.3, z = SZ + 0.1 + i * i * 0.012; b(x, y, z, 0.72, 0.28, 0.55, BLK); b(x, y + 0.05, z + 0.28, 0.64, 0.18, 0.02, "#44444e"); } b(x, 5.6, SZ + 0.15, 0.06, 0.4, 0.06, "#5a5e66"); });
      [-3.9, 3.9].forEach((x) => { for (let j = 0; j < 2; j++) { b(x, j * 0.66, SZ + 0.45, 1.1, 0.64, 0.66, BLK); b(x, j * 0.66 + 0.1, SZ + 0.79, 0.46, 0.46, 0.02, "#44444e"); b(x, j * 0.66 + 0.22, SZ + 0.8, 0.2, 0.2, 0.02, "#5c5c66"); } });
      [-2.6, 0, 2.6].forEach((x) => { b(x, DECK, SZ - 0.32, 0.6, 0.26, 0.42, BLK); b(x, DECK + 0.05, SZ - 0.1, 0.5, 0.16, 0.02, "#44444e"); }); // monitor wedges
      // amps, keyboard, cables
      [[-3.7, -4.9], [3.7, -4.9]].forEach(([x, z]) => { b(x, DECK, z, 0.95, 1.2, 0.5, BLK); b(x, DECK + 0.12, z + 0.26, 0.85, 0.85, 0.02, "#44444e"); b(x, DECK + 1.06, z + 0.26, 0.85, 0.08, 0.02, GOLD); b(x, DECK + 1.2, z, 0.95, 0.5, 0.5, BLK); });
      b(2.7, DECK, -3.3, 0.06, 0.82, 0.06, TR, 0.5); b(2.7, DECK, -3.3, 0.06, 0.82, 0.06, TR, -0.5); b(2.7, DECK + 0.8, -3.3, 1.25, 0.08, 0.4, BLK); b(2.7, DECK + 0.88, -3.22, 1.12, 0.02, 0.18, WHITE);
      for (let i = 0; i < 9; i++) b(2.2 + i * 0.12, DECK + 0.89, -3.27, 0.05, 0.02, 0.1, "#18181c");
      [[-2.2, -3.4, 2.0, 0.3], [0.8, -3.0, 2.4, -0.2], [-0.8, -4.2, 1.6, 1.1]].forEach(([x, z, w, yw]) => b(x, DECK + 0.04, z, w, 0.012, 0.035, "#0e0e12", yw));
      // drum riser and kit
      const RZ = -4.55, RY = DECK + 0.4; b(0, DECK, RZ, 2.6, 0.4, 1.7, DK); LB.push([0, DECK + 0.3, RZ + 0.855, 2.6, 0.04, 0.02, "#ffffff"]);
      b(0, RY, -4.0, 0.62, 0.62, 0.36, WHITE); b(0, RY + 0.08, -3.81, 0.46, 0.46, 0.02, RED); b(0, RY + 0.2, -3.8, 0.24, 0.2, 0.02, WHITE);
      [[-0.3, RED], [0.3, RED]].forEach(([x, c]) => b(x, RY + 0.66, -4.1, 0.3, 0.22, 0.3, c));
      b(0.62, RY, -4.45, 0.42, 0.5, 0.42, RED); b(-0.55, RY, -4.4, 0.04, 0.4, 0.04, TR); b(-0.55, RY + 0.4, -4.4, 0.36, 0.14, 0.36, "#d8d8e0");
      [[-0.85, -4.15, 1.0, 0.56], [0.88, -4.0, 1.1, 0.62], [-0.95, -4.6, 0.75, 0.38], [-0.95, -4.6, 0.8, 0.38]].forEach(([x, z, h, w]) => { b(x, RY, z, 0.04, h, 0.04, TR); b(x, RY + h, z, w, 0.02, w, GOLD); });
      // the LED wall: a tiny canvas drawn with square pixels
      b(0, DECK + 0.05, -5.38, 8.8, 3.75, 0.12, BLK);
      const scv = document.createElement("canvas"); scv.width = 192; scv.height = 72; const sx = scv.getContext("2d");
      const stex = new T.CanvasTexture(scv); stex.magFilter = T.NearestFilter; stex.minFilter = T.LinearFilter; stex.generateMipmaps = false; stex.colorSpace = T.SRGBColorSpace;
      const scr = new T.Mesh(new T.PlaneGeometry(8.4, 3.15), new T.MeshBasicMaterial({ map: stex })); scr.position.set(0, DECK + 1.95, -5.31); k.g.add(scr);
      const PAW = (c, x, y, s, col) => { c.fillStyle = col; c.fillRect(x - s, y - s * 0.4, s * 2, s * 1.6); [[-1.3, -1.3], [-0.45, -1.9], [0.45, -1.9], [1.3, -1.3]].forEach(([dx, dy]) => c.fillRect(x + dx * s - s * 0.35, y + dy * s - s * 0.35, s * 0.7, s * 0.7)); };
      let lastF = -1;
      const drawScreen = (t) => { const f = Math.floor(t * 12); if (f === lastF) return; lastF = f;
        const c = sx, W = 192, H = 72, bt = beat(t), on = 1 - (bt % 1), mode = Math.floor(bt / 8) % 3;
        c.fillStyle = "#0a0814"; c.fillRect(0, 0, W, H);
        if (mode === 0) { for (let i = 0; i < 24; i++) { const hh = Math.round((0.25 + 0.75 * Math.abs(Math.sin(i * 0.73 + Math.floor(bt * 2) * 1.9))) * (0.55 + 0.45 * on) * 60); c.fillStyle = `hsl(${(i * 14 + bt * 25) % 360},95%,58%)`; for (let y = 0; y < hh; y += 4) c.fillRect(i * 8 + 1, H - 4 - y, 6, 3); } }
        else if (mode === 1) { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#2a0a3a" : "#3a0a2a"; c.fillRect(((i * 30 + bt * 12) % 240) - 30, 0, 15, H); }
          c.font = `900 ${Math.round(28 + on * 6)}px "Helvetica Neue", Arial, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = `hsl(${(bt * 40) % 360},100%,62%)`; c.fillText("THE WAGS", W / 2, H / 2 + 2); }
        else { const n = Math.floor(bt * 2) % 6; for (let i = 0; i <= n; i++) PAW(c, 22 + i * 30, 44 - (i % 2) * 14, 5, [PINK, YEL, "#5ad8ff", "#5ad86a", PUR, RED][i]);
          c.font = '900 15px "Helvetica Neue", Arial, sans-serif'; c.textAlign = "center"; c.fillStyle = "#ffffff"; c.fillText("MARSH FEST", W / 2, 13); }
        stex.needsUpdate = true; };
      drawScreen(0);
      // mic stand at the front
      b(0, DECK, SZ - 0.62, 0.3, 0.03, 0.3, BLK); b(0, DECK, SZ - 0.62, 0.035, 0.98, 0.035, TR); b(0, DECK + 0.96, SZ - 0.7, 0.06, 0.06, 0.18, "#2a2a30"); b(0, DECK + 0.98, SZ - 0.8, 0.08, 0.08, 0.06, "#8a8a94");
      // confetti cannons and spark gerbs on the lip
      [-4.6, 4.6].forEach((x) => { b(x, DECK, SZ - 0.35, 0.36, 0.3, 0.36, BLK); b(x, DECK + 0.3, SZ - 0.35, 0.16, 0.4, 0.16, "#8a8a94"); });
      const GERBS = [-3.2, -1.3, 1.3, 3.2]; GERBS.forEach((x) => b(x, DECK, SZ - 0.18, 0.2, 0.12, 0.2, "#3a3a44"));

      /* crowd barrier */
      for (let x = -5.0; x <= 5.01; x += 0.84) { b(x, 0.06, -1.25, 0.06, 1.05, 0.06, "#8a909a"); b(x, 0.06, -1.05, 0.06, 0.04, 0.55, "#8a909a"); }
      [0.35, 0.7, 1.05].forEach((y) => b(0, y, -1.25, 10.1, 0.05, 0.05, "#c8ccd4"));

      /* merch stall (back left): propeller hats and tees */
      { const x = -4.7, z = 3.9;
        [[-1.15, -0.75], [1.15, -0.75], [-1.15, 0.75], [1.15, 0.75]].forEach(([dx, dz]) => b(x + dx, 0.06, z + dz, 0.08, 2.2, 0.08, WHITE));
        for (let i = 0; i < 6; i++) b(x - 1.25 + i * 0.42 + 0.21, 2.26, z, 0.42, 0.14, 1.8, i % 2 ? WHITE : PINK);
        b(x, 0.06, z - 0.7, 2.4, 2.0, 0.08, "#2a2a34");
        [[-0.7, BLUE], [0, PINK], [0.7, YEL]].forEach(([dx, col]) => { b(x + dx, 1.05, z - 0.64, 0.46, 0.55, 0.02, col); b(x + dx, 1.5, z - 0.64, 0.72, 0.18, 0.02, col); b(x + dx, 1.18, z - 0.625, 0.18, 0.18, 0.01, WHITE); });
        b(x, 0.06, z + 0.55, 2.2, 0.9, 0.5, "#3a3a48"); b(x, 0.96, z + 0.55, 2.3, 0.05, 0.6, YEL);
        [-0.7, 0, 0.7].forEach((dx) => { const hx = x + dx, hy = 1.01, hz = z + 0.55; [[-1, -1, RED], [1, -1, YEL], [-1, 1, BLUE], [1, 1, TEAL]].forEach(([a, c2, col]) => b(hx + a * 0.07, hy, hz + c2 * 0.07, 0.14, 0.12, 0.14, col)); b(hx, hy + 0.12, hz, 0.03, 0.07, 0.03, WHITE); b(hx, hy + 0.19, hz, 0.36, 0.015, 0.06, RED, dx * 2); });
        sign(k.g, 2.2, 0.4, x, 1.92, z + 0.82, (c, W, h) => { c.fillStyle = "#1e1e26"; c.fillRect(0, 0, W, h); txt(c, "MERCH · PROPELLER HATS", W / 2, h / 2 + 2, 40, YEL); }); }

      /* sound desk (back right), facing the stage */
      { const x = 2.6, z = 3.9;
        b(x, 0.06, z, 2.0, 0.25, 1.5, DK);
        [[-0.95, -0.7], [0.95, -0.7], [-0.95, 0.7], [0.95, 0.7]].forEach(([dx, dz]) => b(x + dx, 0.31, z + dz, 0.07, 2.0, 0.07, "#4a4a54"));
        b(x, 2.31, z, 2.1, 0.1, 1.6, BLK); b(x, 0.31, z - 0.3, 1.6, 0.8, 0.55, BLK); b(x, 1.11, z - 0.3, 1.5, 0.04, 0.5, "#4a4a56");
        for (let i = 0; i < 10; i++) { b(x - 0.65 + i * 0.145, 1.15, z - 0.3, 0.03, 0.03, 0.3, "#9a9aa6"); (i % 2 ? LA : LB).push([x - 0.65 + i * 0.145, 1.15, z - 0.48, 0.05, 0.03, 0.05, [RED, "#5ad86a", YEL][i % 3]]); }
        b(x - 0.4, 1.15, z - 0.48, 0.3, 0.22, 0.04, "#18181c"); }

      /* toilets (right side) */
      [0.3, 1.3].forEach((z) => { b(6.0, 0.06, z, 0.9, 2.1, 0.9, "#2f6fd0"); b(6.0, 2.16, z, 0.96, 0.08, 0.96, WHITE); b(5.54, 0.16, z, 0.02, 1.75, 0.62, "#2558b0"); b(5.53, 1.05, z + 0.22, 0.02, 0.08, 0.1, "#e2483a"); });

      /* flags on poles and bunting from the stage to the gate arch */
      [[-6.2, 1.0, PINK], [-6.2, -1.2, YEL], [6.2, 3.2, TEAL], [6.2, -1.0, PUR]].forEach(([x, z, col]) => { b(x, 0.06, z, 0.07, 4.4, 0.07, WHITE); b(x + (x < 0 ? 0.36 : -0.36), 3.75, z, 0.7, 0.48, 0.03, col); b(x + (x < 0 ? 0.36 : -0.36), 3.85, z, 0.7, 0.12, 0.035, WHITE); });
      const bunting = (a, c) => { const dx = c[0] - a[0], dz = c[2] - a[2], len = Math.hypot(dx, dz), n = Math.floor(len / 0.5), yw = Math.atan2(-dz, dx);
        for (let i = 1; i < n; i++) { const u = i / n, y = a[1] + (c[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.9; b(a[0] + dx * u, y - 0.24, a[2] + dz * u, 0.22, 0.24, 0.02, [RED, YEL, BLUE, PINK, TEAL][i % 5], yw); b(a[0] + dx * u, y - 0.02, a[2] + dz * u, 0.5, 0.02, 0.02, "#f6f4ee", yw); } };
      bunting([-5.3, 5.5, SZ + 0.05], [-1.75, 3.1, 5.6]); bunting([5.3, 5.5, SZ + 0.05], [1.75, 3.1, 5.6]);

      /* entrance arch */
      [-1.75, 1.75].forEach((x) => { b(x, 0, 5.6, 0.26, 3.3, 0.26, "#8a909a"); for (let y = 0.3; y < 3.3; y += 0.5) b(x, y, 5.6, 0.31, 0.04, 0.31, TR); });
      b(0, 3.3, 5.6, 3.8, 0.24, 0.26, "#8a909a");
      sign(k.g, 3.3, 0.78, 0, 2.86, 5.75, (c, W, h) => { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#ff4fa0"); g.addColorStop(1, "#7a58d8"); c.fillStyle = g; c.fillRect(0, 0, W, h); txt(c, "MARSH FEST", W / 2, h * 0.4, 70, "#ffffff"); txt(c, "LIVE TODAY: THE WAGS", W / 2, h * 0.78, 30, YEL, 800); });

      /* the band */
      staff(k, "beagle", 0, SZ - 1.05, 0, { y: DECK + 0.04, glasses: true, anim: (t, d) => { const bt = beat(t); d.head.rotation.x = -0.25 + Math.sin(bt * Math.PI) * 0.12; d.head.rotation.y = Math.sin(t * 0.7) * 0.35; d.dog.pose({ wag: K.wag(t, 12), mouth: 0.25 + Math.abs(Math.sin(bt * Math.PI * 2)) * 0.6 }); } });
      staff(k, "dalmatian", -2.4, -3.4, 0.35, { y: DECK + 0.04, guitar: RED, anim: (t, d) => { const bt = beat(t); d.head.rotation.x = Math.max(0, Math.sin(bt * Math.PI * 2)) * 0.45; d.dog.pose({ wag: K.wag(t, 16) }); } });
      staff(k, "husky", 0, -4.95, 0, { y: RY, scale: 1.4, anim: (t, d) => { const bt = beat(t); d.head.rotation.x = Math.abs(Math.sin(bt * Math.PI)) * 0.4; d.dog.pose({ wag: K.wag(t, 20), mouth: 0.4 }); } });

      /* light beams: one instanced cone mesh, sweeping in time */
      const BEAMS = HEADS.slice(1, 7), beamCols = [["#ff4fa0", "#5ad8ff"], ["#ffd23a", "#b07aff"], ["#5ad86a", "#ff6a3a"]];
      const beams = new T.InstancedMesh(new T.ConeGeometry(0.62, 6.2, 10, 1, true).translate(0, -3.1, 0), new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), BEAMS.length);
      beams.castShadow = false; beams.receiveShadow = false; beams.frustumCulled = false; beams.renderOrder = 4; k.g.add(beams);
      let lastBar = -1;
      const aimBeams = (t) => { const bt = beat(t), bar = Math.floor(bt / 4);
        BEAMS.forEach((x, i) => { const sw = Math.sin(bt * Math.PI / 4 + i * 0.9) * 0.45 * (i % 2 ? 1 : -1); K.D.position.set(x, 5.12, SZ + 0.05); K.D.rotation.set(-0.5 - Math.sin(bt * Math.PI / 8 + i) * 0.15, 0, sw); K.D.scale.set(1, 1, 1); K.D.updateMatrix(); beams.setMatrixAt(i, K.D.matrix); });
        beams.instanceMatrix.needsUpdate = true;
        if (bar !== lastBar) { lastBar = bar; BEAMS.forEach((x, i) => beams.setColorAt(i, K.COL.set(beamCols[bar % 3][i % 2]))); beams.instanceColor.needsUpdate = true; } };
      aimBeams(0);

      /* confetti and sparks: one Points mesh moved on the GPU, fired on the beat */
      const PO = [], PV = [], PA = [], PC = [], CC = new T.Color();
      const P16 = BEAT * 16; // a burst every 4 bars
      const emit = (n, o, v, grav, spread, period, life, size, ph0, ph1, cols) => { for (let i = 0; i < n; i++) { PO.push(o[0] + (r() - 0.5) * spread, o[1], o[2] + (r() - 0.5) * spread);
        const a = r() * Math.PI * 2, s = v[3] * r(); PV.push(v[0] + Math.cos(a) * s, v[1] * (0.75 + 0.25 * r()), v[2] + Math.sin(a) * s, grav);
        PA.push(period, -(ph0 + (ph1 - ph0) * r()), life, size * (0.7 + 0.6 * r())); CC.set(cols[Math.floor(r() * cols.length)]); PC.push(CC.r, CC.g, CC.b); } };
      [-4.6, 4.6].forEach((x) => emit(110, [x, DECK + 0.7, SZ - 0.35], [-x * 0.08, 4.4, 1.25, 1.1], 1.7, 0.1, P16, 0.95, 0.1, 0, 0.012, [RED, YEL, BLUE, PINK, TEAL, "#ffffff", PUR]));
      GERBS.forEach((x) => emit(26, [x, DECK + 0.12, SZ - 0.18], [0, 5.2, 0, 0.35], 9.8, 0.04, P16, 0.07, 0.07, 0.5, 0.58, ["#fff6c0", "#ffd23a", "#ffffff"]));
      const pg = new T.BufferGeometry(); pg.setAttribute("position", new T.Float32BufferAttribute(PO, 3)); pg.setAttribute("aV", new T.Float32BufferAttribute(PV, 4)); pg.setAttribute("aP", new T.Float32BufferAttribute(PA, 4)); pg.setAttribute("aC", new T.Float32BufferAttribute(PC, 3));
      const fx = new T.Points(pg, new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uH: { value: 800 } },
        vertexShader: `attribute vec4 aV; attribute vec4 aP; attribute vec3 aC; uniform float uT; uniform float uH; varying float vA; varying vec3 vC;
          void main() { float u = fract(uT / aP.x + aP.y), a = u / aP.z;
            if (a > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
            float tt = a * aP.z * aP.x; vec3 p = position + aV.xyz * tt; p.y -= 0.5 * aV.w * tt * tt;
            float flut = step(aV.w, 3.0); p.x += sin(tt * 6.0 + aP.w * 90.0) * 0.18 * flut * min(tt, 1.0); p.z += cos(tt * 5.0 + aP.w * 70.0) * 0.12 * flut * min(tt, 1.0);
            if (p.y < 0.08) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            gl_PointSize = aP.w * projectionMatrix[1][1] * uH / -mv.z; vA = 1.0 - pow(a, 6.0); vC = aC; }`,
        fragmentShader: `varying float vA; varying vec3 vC; void main() { gl_FragColor = vec4(vC, vA); }` }));
      fx.frustumCulled = false; fx.renderOrder = 3; k.g.add(fx);

      /* the flashing lenses */
      const lm = [LA, LB].map((list) => { const m = blocks(k.g, list, false); m.material = new T.MeshBasicMaterial({ color: "#ffffff" }); m.castShadow = false; return m; });
      const DIM = new T.Color("#5a5a66"), FULL = new T.Color("#ffffff");
      k.anims.push((t) => { const bt = beat(t), on = Math.floor(bt) % 2; lm[0].material.color.copy(on ? FULL : DIM); lm[1].material.color.copy(on ? DIM : FULL);
        drawScreen(t); aimBeams(t); fx.material.uniforms.uT.value = t % (P16 * 40); });

      /* visitors: the crowd dances on the shared beat, most fun first */
      const dancer = (x, z, style, text, i) => k.spots.push({ x: wx(x, z), z: wz(x, z), y: 0.064, yaw: Math.PI + Y, pose: "path", text, path: (t, o) => {
        const bt = beat(t);
        if (style === "jump") { o.hop = Math.abs(Math.sin(bt * Math.PI)) * 0.32; o.yaw += Math.sin(t * 0.4 + i) * 0.25; }
        else if (style === "bang") { o.pitch = Math.max(0, Math.sin(bt * Math.PI * 2)) * 0.5; o.hop = Math.abs(Math.sin(bt * Math.PI)) * 0.05; }
        else { o.yaw += Math.sin(bt * Math.PI / 2 + i) * 0.55; o.hop = Math.abs(Math.sin(bt * Math.PI)) * 0.08; }
        return 0; } });
      dancer(0, -0.7, "jump", "Front row at Marsh Fest", 0); dancer(-1.2, -0.7, "bang", "Headbanging at the front", 1); dancer(1.2, -0.7, "jump", "Front row at Marsh Fest", 2);
      k.spots.push({ x: wx(0, 0.6), z: wz(0, 0.6), y: 0, yaw: Y, pose: "path", text: "Crowd-surfing at Marsh Fest!", path: (t, o) => {
        const lx = Math.sin(t * 0.32) * 3.0, lz = 0.7 + Math.sin(t * 0.21) * 0.5; o.x = wx(lx, lz); o.z = wz(lx, lz); o.y = 1.05 + Math.abs(Math.sin(beat(t) * Math.PI)) * 0.12; o.drop = 1; o.yaw = Y + Math.PI / 2 + Math.sin(t * 0.5) * 0.5 + (Math.cos(t * 0.32) < 0 ? Math.PI : 0); return 0; } });
      dancer(-2.4, -0.7, "jump", "Jumping at the front", 3); dancer(2.4, -0.7, "bang", "Headbanging at the front", 4);
      [[-1.8, 0.5, "sway"], [-0.6, 0.45, "jump"], [0.6, 0.5, "jump"], [1.8, 0.45, "sway"], [-3.6, -0.7, "sway"], [3.6, -0.7, "jump"], [-3.0, 0.5, "bang"], [3.0, 0.5, "jump"], [-1.2, 1.7, "sway"], [1.2, 1.7, "jump"], [0, 1.75, "bang"], [-2.6, 1.7, "jump"], [2.6, 1.75, "sway"]]
        .forEach(([x, z, st], i) => dancer(x, z, st, st === "sway" ? "Dancing at Marsh Fest" : st === "bang" ? "Rocking out at Marsh Fest" : "Jumping to The Wags", i + 5));
      const S2 = (x, z, pose, yw, y, text) => { spot(x, z, pose, yw, y); k.spots[k.spots.length - 1].text = text; };
      S2(-4.95, 5.0, "stand", Math.PI, 0.06, "Queueing for a propeller hat");
      S2(2.6, 4.3, "stand", Math.PI, 0.31, "Watching from the sound desk");
      S2(-4.25, 5.05, "stand", Math.PI, 0.06, "Buying a Marsh Fest tee");
      S2(4.6, 4.6, "lie", 0.6, 0.064, "Chilling on the grass at the back");

      const out = k.done(); out.fx = fx; out.extra = [beams]; out.pathSign = true; out.weight = 2; out.near2 = 26 * 26; out.roof = null; return out;
    }

    /* ---- The city: one tight square of blocks ----
       A 5 x 5 grid of 14 x 12 m grass pads joined by 2.5 m sandy paths, inside a hedge, the gate on the south (+z) side.
       Kennel pads: three rows of six open-top kennels, all facing south (towards the gate and the usual camera).
       District pads: one building plot each, front facing south. No courtyards, no square: just kennels and buildings.
       Returns { group, kennels, PLOTS, anim(t), gate, avenue, kennelHi, kennelLo }. kennelLo is a 4-box-a-kennel version for
       far-away views: show it and hide kennelHi when zoomed right out. kennels: { x, z, yaw, fx, fz (door direction), roof, d (distance
       from the gate), bx, bz (pad centre), hw, hd (pad half size), block }. PLOTS (in fill order): { x, z, yaw, district, for }
       where "for" reserves a plot for one build type. avenue: [zSouth, zNorth] of the path through the gate. 306 kennels. */
    function buildCity() {
      const g = group(), r = rng(913), L = [], E = [], KH = [], KL = [], kennels = [], PLOTS = [], anims = [];
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
      const clouds = blocks(g, cl, false); clouds.material = new T.MeshBasicMaterial({ color: "#ffffff", fog: false }); clouds.name = "clouds";

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
          KH.push([x, 0, z, 1.9, 0.06, 1.9, "#c9a46a"], [x, 0.06, z - 0.15, 1.3, 0.12, 1.1, roof]);
          KH.push([x, 0, z - 0.89, 1.9, H, 0.12, c], [x - 0.89, 0, z, 0.12, H, 1.9, c], [x + 0.89, 0, z, 0.12, H, 1.9, c], [x - 0.62, 0, z + 0.89, 0.66, H, 0.12, c], [x + 0.62, 0, z + 0.89, 0.66, H, 0.12, c]);
          KH.push([x, H, z - 0.89, 2.0, 0.1, 0.18, roof], [x - 0.89, H, z, 0.18, 0.1, 2.0, roof], [x + 0.89, H, z, 0.18, 0.1, 2.0, roof], [x - 0.62, H, z + 0.89, 0.7, 0.1, 0.18, roof], [x + 0.62, H, z + 0.89, 0.7, 0.1, 0.18, roof]);
          KH.push([x - 0.62, 0, z + 1.32, 0.3, 0.09, 0.3, ["#e2483a", "#2f8fe0", "#27b39a", "#f0b52e"][kk % 4]], [x - 0.62, 0.09, z + 1.32, 0.22, 0.04, 0.22, "#a8703a"]);
          // the same kennel in 4 boxes, for the zoomed-out view: floor, back and sides in the kennel's colour
          KL.push([x, 0, z, 1.9, 0.06, 1.9, "#c9a46a"], [x, 0, z - 0.89, 2.0, H + 0.1, 0.16, roof], [x - 0.89, 0, z, 0.16, H + 0.1, 2.0, roof], [x + 0.89, 0, z, 0.16, H + 0.1, 2.0, roof]);
        }
      }));
      PLOTS.sort((a, b) => a.order - b.order);

      blocks(g, L); const kennelHi = blocks(g, KH), kennelLo = blocks(g, KL, false); kennelLo.visible = false; const em = blocks(g, E, false); em.material = new T.MeshBasicMaterial({ color: "#ffffff" });
      return { group: g, kennels, PLOTS, kennelHi, kennelLo, gate: [GX, GZ], avenue: [SOUTH - 1, NORTH + 1], anim: (t) => anims.forEach((f) => f(t)) };
    }

    Object.assign(K, { buildCity, buildTown, buildSupermarket, buildLibrary, buildGym, buildCinema, buildSite, buildWaterparkTown: buildWaterpark, buildConcert, TOWN_BUILDS: { supermarket: buildSupermarket, library: buildLibrary, gym: buildGym, cinema: buildCinema, waterpark: buildWaterpark, concert: buildConcert } });
  }
  window.LPT = { install };
})();
