/* Blocky ("Minecraft style") people: the house character style from now on.
   Everything is a cuboid: cube head with no neck, slab hair, a flat face made of rectangles,
   square arms and legs, cube hands and black block shoes. Needs THREE and LP (lowpoly.js).
   LP9.figure takes the same options and set() pose as LP8.figure, so shots can swap straight across. */
(function () {
  const T = THREE;
  const { mat, shadow } = LP;
  /* A cuboid centred at x, y, z. */
  const cube = (w, h, d, m, x, y, z) => {
    const b = shadow(new T.Mesh(new T.BoxGeometry(w, h, d), m));
    b.position.set(x || 0, y || 0, z || 0);
    return b;
  };

  let glowTex = null;
  function glow(size, colour) {
    if (!glowTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d");
      const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      glowTex = new T.CanvasTexture(c);
      glowTex.colorSpace = T.SRGBColorSpace;
    }
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: colour || "#a8d4ff", transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  }

  /* 1.75 m, feet on y = 0, facing +z.
     figure({ skin, hair, style: short|side|long|bun|bald, top, legs, shoe, suit, tie, shirt, longTie, dress, robe, collar, veil,
              specs, shades, beard, moustache, quiff, wild, browCol, phone, glowSize })
     fig.set({ aLx, aLz, eL, aRx, aRy, aRz, eR, lL, lR, kL, kR, hX, hY, hZ, lean, drop, smile, open, browUp, browWorry, wide, closed }) */
  function figure(opts) {
    const o = Object.assign({ skin: "#e8b797", hair: "#3a2619", style: "short", top: "#3a7fa8", legs: "#2c3550", shoe: "#17140f" }, opts || {});
    const g = new T.Group();
    const skin = mat(o.skin, { emissive: "#3a2418" }), hair = mat(o.hair), top = mat(o.top), legs = mat(o.legs), shoe = mat(o.shoe);
    const skinDark = mat(new T.Color(o.skin).multiplyScalar(0.84).getStyle(), { emissive: "#2a1a12" });
    const dark = new T.MeshBasicMaterial({ color: "#14100e" }), white = new T.MeshBasicMaterial({ color: "#f4f1e8" });
    const lip = mat("#8e3a38", { emissive: "#2a0f0e" });
    const body = new T.Group();
    g.add(body);

    // Torso and hips.
    body.add(cube(0.42, 0.56, 0.22, top, 0, 1.0, 0));
    if (o.suit) {
      const shirt = mat(o.shirt || "#efeadf");
      body.add(cube(0.05, 0.46, 0.01, shirt, -0.05, 1.04, 0.114));
      body.add(cube(0.05, 0.46, 0.01, shirt, 0.05, 1.04, 0.114));
      const tl = o.longTie ? 0.5 : 0.36;
      body.add(cube(0.05, tl, 0.012, mat(o.tie || "#b5202a"), 0, 1.27 - tl / 2, 0.118));
    }
    if (o.collar) {
      body.add(cube(0.2, 0.05, 0.012, mat("#f7f4ec"), 0, 1.255, 0.114));
    }
    if (o.dress || o.robe) {
      // A stepped block skirt in place of legs.
      [[0.46, 0.26, 0.6], [0.56, 0.32, 0.34], [0.66, 0.36, 0.1]].forEach(([w, d, y], i) => body.add(cube(w, 0.28, d, top, 0, y, 0)));
    }

    function limb(x, y, upper, lower, w, d, m, end) {
      const a = new T.Group();
      a.position.set(x, y, 0);
      a.add(cube(w, upper, d, m, 0, -upper / 2, 0));
      const knee = new T.Group();
      knee.position.y = -upper;
      a.add(knee);
      knee.add(cube(w, lower, d, m, 0, -lower / 2, 0));
      const tip = new T.Group();
      tip.position.y = -lower;
      knee.add(tip);
      if (end) tip.add(end);
      body.add(a);
      a.knee = knee;
      a.tip = tip;
      return a;
    }
    const hand = () => cube(0.11, 0.11, 0.12, skin, 0, -0.05, 0);
    const foot = () => cube(0.14, 0.07, 0.27, shoe, 0, -0.03, 0.05);
    const armL = limb(-0.27, 1.26, 0.28, 0.26, 0.12, 0.13, top, hand());
    const armR = limb(0.27, 1.26, 0.28, 0.26, 0.12, 0.13, top, hand());
    const legL = limb(-0.1, 0.72, 0.35, 0.35, 0.15, 0.17, legs, foot());
    const legR = limb(0.1, 0.72, 0.35, 0.35, 0.15, 0.17, legs, foot());
    if (o.dress || o.robe) { legL.visible = false; legR.visible = false; }
    g.handR = armR.tip;
    g.handL = armL.tip;

    // Cube head with no neck. Pivots where it sits on the shoulders.
    const head = new T.Group();
    head.position.y = 1.28;
    body.add(head);
    g.head = head;
    const HW = 0.36, HH = 0.36, HD = 0.34;
    head.add(cube(HW, HH, HD, skin, 0, HH / 2, 0));
    const fz = HD / 2; // Face surface.
    const hg = new T.Group();
    head.add(hg);

    // Hair: flat slabs.
    if (o.style !== "bald") {
      hg.add(cube(HW + 0.03, 0.09, HD + 0.03, hair, 0, HH + 0.025, 0));
      hg.add(cube(HW + 0.03, 0.16, 0.05, hair, 0, HH - 0.08, -HD / 2 - 0.01));
      [-1, 1].forEach((s) => hg.add(cube(0.03, 0.09, HD * 0.72, hair, s * (HW / 2 + 0.008), HH - 0.045, -0.04)));
      if (o.style === "side") hg.add(cube(0.2, 0.05, 0.03, hair, 0.08, HH - 0.03, fz + 0.012));
      else hg.add(cube(HW + 0.03, 0.035, 0.03, hair, 0, HH - 0.02, fz + 0.012));
    } else {
      [-1, 1].forEach((s) => hg.add(cube(0.03, 0.1, HD * 0.55, hair, s * (HW / 2 + 0.008), HH * 0.62, -0.05)));
      hg.add(cube(HW + 0.03, 0.1, 0.03, hair, 0, HH * 0.62, -HD / 2 - 0.008));
    }
    if (o.style === "long") {
      hg.add(cube(HW + 0.05, 0.42, 0.07, hair, 0, HH - 0.2, -HD / 2 - 0.02));
      [-1, 1].forEach((s) => hg.add(cube(0.05, 0.36, 0.14, hair, s * (HW / 2 + 0.02), HH - 0.17, -0.09)));
    }
    if (o.style === "bun") hg.add(cube(0.14, 0.14, 0.14, hair, 0, HH + 0.13, -0.08));
    if (o.quiff) {
      hg.add(cube(HW + 0.02, 0.1, 0.13, hair, 0, HH + 0.1, 0.11));
      [-1, 1].forEach((s) => hg.add(cube(0.03, 0.13, 0.06, hair, s * (HW / 2 + 0.008), HH * 0.56, 0.08)));
    }
    if (o.wild) {
      [[-0.2, 0.32, 0], [0.2, 0.32, 0], [-0.13, 0.46, 0.04], [0.14, 0.45, -0.02], [0, 0.49, -0.05], [-0.22, 0.2, -0.06], [0.22, 0.2, -0.06]].forEach(([a, b, c]) => hg.add(cube(0.12, 0.11, 0.12, hair, a, b, c)));
    }
    if (o.beard) {
      hg.add(cube(HW + 0.015, 0.11, 0.03, hair, 0, 0.055, fz + 0.006));
      [-1, 1].forEach((s) => hg.add(cube(0.05, 0.14, 0.03, hair, s * (HW / 2 - 0.02), 0.17, fz + 0.006)));
    }
    if (o.moustache) hg.add(cube(0.17, 0.035, 0.024, hair, 0, 0.122, fz + 0.012));

    // Flat face: rectangles on the front of the cube.
    const eyes = [-1, 1].map((s) => {
      const e = new T.Mesh(new T.BoxGeometry(0.05, 0.075, 0.01), dark);
      e.position.set(s * 0.082, 0.21, fz + 0.004);
      hg.add(e);
      return e;
    });
    const brows = [-1, 1].map((s) => {
      const b = new T.Mesh(new T.BoxGeometry(0.095, 0.022, 0.012), o.browCol ? mat(o.browCol) : dark);
      b.position.set(s * 0.082, 0.27, fz + 0.006);
      hg.add(b);
      return b;
    });
    hg.add(cube(0.055, 0.07, 0.035, skinDark, 0, 0.155, fz + 0.012));
    const mouth = new T.Mesh(new T.BoxGeometry(0.1, 0.024, 0.01), lip);
    hg.add(mouth);
    const corners = [-1, 1].map((s) => {
      const c = new T.Mesh(new T.BoxGeometry(0.024, 0.024, 0.01), lip);
      hg.add(c);
      c.side = s;
      return c;
    });
    const oval = new T.Mesh(new T.BoxGeometry(0.1, 0.05, 0.01), mat("#4a1c1e"));
    hg.add(oval);
    if (o.shades) {
      [-1, 1].forEach((s) => hg.add(cube(0.125, 0.07, 0.016, dark, s * 0.082, 0.205, fz + 0.012)));
      hg.add(cube(0.05, 0.016, 0.014, dark, 0, 0.225, fz + 0.012));
    }
    if (o.specs) {
      const f = mat("#3a3028");
      [-1, 1].forEach((s) => {
        const cx = s * 0.082, cy = 0.21;
        hg.add(cube(0.115, 0.012, 0.01, f, cx, cy + 0.052, fz + 0.012));
        hg.add(cube(0.115, 0.012, 0.01, f, cx, cy - 0.052, fz + 0.012));
        hg.add(cube(0.012, 0.11, 0.01, f, cx - 0.052, cy, fz + 0.012));
        hg.add(cube(0.012, 0.11, 0.01, f, cx + 0.052, cy, fz + 0.012));
      });
      hg.add(cube(0.05, 0.012, 0.01, f, 0, 0.225, fz + 0.012));
    }
    if (o.veil) {
      hg.add(cube(HW + 0.1, 1.0, 0.05, new T.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.6 }), 0, -0.1, -HD / 2 - 0.05));
    }

    let phone = null;
    if (o.phone) {
      phone = new T.Group();
      phone.add(cube(0.1, 0.2, 0.02, mat("#17181c"), 0, 0, 0));
      const scr = new T.Mesh(new T.PlaneGeometry(0.086, 0.18), new T.MeshBasicMaterial({ color: "#bfe0ff" }));
      scr.position.set(0, 0, -0.0105);
      scr.rotation.y = Math.PI; // Screen faces the holder; the camera sees the dark back of the phone.
      phone.add(scr);
      phone.position.set(0, -0.05, 0.09);
      armR.tip.add(phone);
      if (o.glowSize) { phone.glow = glow(o.glowSize); phone.add(phone.glow); }
      g.phone = phone;
    }

    g.set = function (p) {
      p = p || {};
      armL.rotation.set(p.aLx || 0, 0, -(p.aLz === undefined ? 0.05 : p.aLz));
      armR.rotation.set(p.aRx || 0, p.aRy || 0, p.aRz === undefined ? 0.05 : p.aRz);
      armL.knee.rotation.x = p.eL || 0;
      armR.knee.rotation.set(p.eR || 0, 0, p.eRz || 0);
      if (phone) phone.rotation.z = p.phoneZ || 0;
      legL.rotation.x = p.lL || 0;
      legR.rotation.x = p.lR || 0;
      legL.knee.rotation.x = p.kL || 0;
      legR.knee.rotation.x = p.kR || 0;
      head.rotation.set(p.hX || 0, p.hY || 0, p.hZ || 0);
      body.rotation.x = p.lean || 0;
      body.position.y = p.drop || 0;
      const smile = p.smile === undefined ? 0.4 : p.smile, open = p.open || 0;
      const my = 0.085;
      const talking = open >= 0.2;
      mouth.visible = !talking;
      mouth.position.set(0, my, fz + 0.004);
      oval.visible = talking;
      oval.scale.y = 0.55 + open * 1.3;
      oval.position.set(0, my - 0.005, fz + 0.004);
      const lift = smile < 0.15 ? -0.02 : smile > 0.5 ? 0.022 : 0;
      corners.forEach((c) => {
        c.visible = !talking && lift !== 0;
        c.position.set(c.side * 0.062, my + lift, fz + 0.004);
      });
      const wide = p.wide || 0;
      eyes.forEach((e) => { e.scale.set(1 + wide * 0.15, p.closed ? 0.14 : 1 + wide * 0.3, 1); });
      brows.forEach((b) => { const sx = Math.sign(b.position.x); b.position.y = 0.27 + (p.browUp || 0) * 0.024; b.rotation.z = -sx * (p.browWorry || 0) * 0.4; });
    };
    g.set({});
    return g;
  }

  const SEAT = { lL: -1.5, lR: -1.5, kL: 1.5, kR: 1.5, drop: -0.28 };
  const READ = { aRx: -0.55, eR: -1.15, aRz: -0.02, hX: 0.32, smile: 0.2 };
  /* Right hand held to the right side of the head. */
  const EAR = { aRx: 0, aRz: 2.27, eRz: 2.72, eR: 0, phoneZ: 1.3 }; // Elbow out to the side, forearm back to the ear, so the arm never covers the face.

  /* Blocky dog, faces +z, feet on y = 0, about 0.6 m at the shoulder.
     dog({ coat, dark, belly }) ; dog.pose({ sit, lie, jump, run, phase, wag, headX, headY, headZ, mouth, tongue, ears })
     dog.head is exposed for hats and socks. */
  function dog(opts) {
    if (opts && opts.terrier) return terrier(opts);
    const o = Object.assign({ coat: "#d9a24a", dark: "#b07a30", belly: "#ecc27a", collar: "#c5242b" }, opts || {});
    const g = new T.Group();
    const coat = mat(o.coat, { emissive: "#2a1a08" }), dk = mat(o.dark), bel = mat(o.belly), black = new T.MeshBasicMaterial({ color: "#14100e" });
    const rig = new T.Group(); // Pivots at the back hips.
    rig.position.set(0, 0.46, -0.3);
    g.add(rig);
    const body = new T.Group();
    rig.add(body);
    body.add(cube(0.34, 0.32, 0.78, coat, 0, 0.06, 0.3));
    body.add(cube(0.3, 0.06, 0.6, bel, 0, -0.11, 0.32));
    body.add(cube(0.36, 0.34, 0.2, coat, 0, 0.1, 0.62));
    function leg(x, z, front) {
      const l = new T.Group();
      l.position.set(x, -0.04, z);
      l.add(cube(0.11, 0.42, 0.12, coat, 0, -0.21, 0));
      l.add(cube(0.12, 0.06, 0.15, dk, 0, -0.41, 0.02));
      body.add(l);
      return l;
    }
    const FL = leg(-0.11, 0.6, true), FR = leg(0.11, 0.6, true), RL = leg(-0.11, 0.02), RR = leg(0.11, 0.02);
    const tail = new T.Group();
    tail.position.set(0, 0.16, -0.08);
    tail.add(cube(0.07, 0.07, 0.34, coat, 0, 0.06, -0.15));
    tail.children[0].rotation.x = 0.6;
    body.add(tail);
    const neck = new T.Group();
    neck.position.set(0, 0.24, 0.7);
    body.add(neck);
    neck.add(cube(0.36, 0.06, 0.24, mat(o.collar), 0, -0.02, -0.02));
    neck.add(cube(0.06, 0.06, 0.02, mat("#e6be3e"), 0, -0.08, 0.11));
    const head = new T.Group();
    head.position.set(0, 0.12, 0.08);
    neck.add(head);
    head.add(cube(0.34, 0.3, 0.3, coat, 0, 0.0, 0));
    head.add(cube(0.2, 0.14, 0.18, bel, 0, -0.07, 0.22));
    head.add(cube(0.08, 0.06, 0.04, black, 0, -0.02, 0.32));
    const jaw = new T.Group();
    jaw.position.set(0, -0.13, 0.14);
    head.add(jaw);
    jaw.add(cube(0.18, 0.05, 0.16, bel, 0, -0.02, 0.08));
    const tongue = cube(0.09, 0.02, 0.14, mat("#e07a8a"), 0, -0.04, 0.17);
    jaw.add(tongue);
    [-1, 1].forEach((s) => {
      head.add(cube(0.055, 0.075, 0.01, black, s * 0.085, 0.06, 0.152));
      head.add(cube(0.018, 0.022, 0.01, new T.MeshBasicMaterial({ color: "#ffffff" }), s * 0.085 + 0.012, 0.08, 0.158));
    });
    const ears = [-1, 1].map((s) => {
      const e = new T.Group();
      e.position.set(s * 0.18, 0.12, -0.02);
      e.add(cube(0.05, 0.24, 0.16, dk, s * 0.02, -0.12, 0));
      head.add(e);
      e.side = s;
      return e;
    });
    g.head = head;
    g.pose = function (p) {
      p = p || {};
      const sit = p.sit || 0, lie = p.lie || 0, jump = p.jump || 0, run = p.run || 0, ph = p.phase || 0;
      body.rotation.x = -sit * 0.62 - jump * 0.7;
      body.position.y = -lie * 0.32 + jump * 0.2;
      body.position.z = 0;
      const s1 = Math.sin(ph) * run * 0.7, s2 = -s1;
      FL.rotation.x = s1 + sit * 0.62 + jump * -0.4 - lie * 1.35;
      FR.rotation.x = s2 + sit * 0.62 + jump * -0.6 - lie * 1.35;
      RL.rotation.x = s2 - sit * 0.95 + lie * 1.35 + jump * 0.3;
      RR.rotation.x = s1 - sit * 0.95 + lie * 1.35 + jump * 0.3;
      neck.rotation.x = sit * 0.5 + jump * 0.5;
      head.rotation.set(p.headX || 0, p.headY || 0, p.headZ || 0);
      tail.rotation.set(sit * 0.3, p.wag || 0, 0);
      jaw.rotation.x = p.mouth === undefined ? 0.15 : p.mouth;
      tongue.visible = p.tongue !== false;
      ears.forEach((e) => (e.rotation.z = e.side * (p.ears || 0) * 0.6));
    };
    g.pose({});
    return g;
  }

  /* Norfolk Terrier: small and sturdy, short legs, wiry red-wheaten coat, ears folded forward,
     scruffy brows and beard. Same pose() as dog(). dog({ terrier: true, coat, dark, light, tag }) */
  function terrier(o) {
    o = Object.assign({ coat: "#c98a4a", dark: "#9a6430", light: "#e2b37a", collar: "#2f7bf0", tag: "#e6be3e" }, o);
    const g = new T.Group();
    const coat = mat(o.coat, { emissive: "#2a1606" }), dk = mat(o.dark), lt = mat(o.light), black = new T.MeshBasicMaterial({ color: "#14100e" }), white = new T.MeshBasicMaterial({ color: "#ffffff" });
    const rig = new T.Group(); rig.position.set(0, 0.26, -0.2); g.add(rig);
    const body = new T.Group(); rig.add(body);
    body.add(cube(0.26, 0.22, 0.46, coat, 0, 0.06, 0.2));
    body.add(cube(0.22, 0.05, 0.36, lt, 0, -0.06, 0.2));
    body.add(cube(0.28, 0.25, 0.14, coat, 0, 0.09, 0.4));
    // Wiry tufts along the back.
    [0.02, 0.14, 0.26].forEach((z, i) => body.add(cube(0.08, 0.04, 0.08, dk, (i % 2 ? 0.05 : -0.05), 0.19, z)));
    function leg(x, z) {
      const l = new T.Group(); l.position.set(x, -0.02, z);
      l.add(cube(0.08, 0.24, 0.09, coat, 0, -0.12, 0));
      l.add(cube(0.09, 0.04, 0.11, dk, 0, -0.23, 0.01));
      body.add(l); return l;
    }
    const FL = leg(-0.08, 0.38), FR = leg(0.08, 0.38), RL = leg(-0.08, 0.04), RR = leg(0.08, 0.04);
    const tail = new T.Group(); tail.position.set(0, 0.16, -0.03);
    const tb = cube(0.06, 0.06, 0.16, coat, 0, 0.06, -0.06); tb.rotation.x = 1.0; tail.add(tb); tail.add(cube(0.065, 0.05, 0.05, dk, 0, 0.14, -0.07));
    body.add(tail);
    const neck = new T.Group(); neck.position.set(0, 0.17, 0.44); body.add(neck);
    neck.add(cube(0.28, 0.05, 0.2, mat(o.collar), 0, -0.02, -0.02));
    const tagM = cube(0.06, 0.06, 0.02, mat(o.tag, { emissive: "#5a4010" }), 0, -0.08, 0.09); neck.add(tagM);
    const head = new T.Group(); head.position.set(0, 0.13, 0.06); neck.add(head);
    head.add(cube(0.28, 0.24, 0.24, coat, 0, 0, 0));
    head.add(cube(0.15, 0.09, 0.12, lt, 0, -0.065, 0.165));
    head.add(cube(0.05, 0.035, 0.03, black, 0, -0.035, 0.235));
    // Beard and brows: the scruffy bits.
    head.add(cube(0.18, 0.06, 0.1, coat, 0, -0.12, 0.16));
    [-1, 1].forEach((s2) => head.add(cube(0.05, 0.05, 0.05, dk, s2 * 0.06, -0.15, 0.2)));
    const brows = [-1, 1].map((s2) => { const b = cube(0.09, 0.035, 0.04, dk, s2 * 0.065, 0.075, 0.125); b.rotation.z = s2 * -0.2; head.add(b); return b; });
    const eyes = [-1, 1].map((s2) => {
      const e = cube(0.062, 0.075, 0.01, black, s2 * 0.07, 0.035, 0.123); head.add(e);
      head.add(cube(0.024, 0.026, 0.01, white, s2 * 0.07 + 0.014, 0.055, 0.129));
      return e;
    });
    const blush = [-1, 1].map((s2) => { const b = cube(0.04, 0.02, 0.01, mat("#e6907a"), s2 * 0.1, -0.03, 0.123); head.add(b); return b; });
    const jaw = new T.Group(); jaw.position.set(0, -0.12, 0.12); head.add(jaw);
    jaw.add(cube(0.12, 0.035, 0.1, lt, 0, -0.01, 0.06));
    const tongue = cube(0.06, 0.015, 0.07, mat("#e07a8a"), 0, -0.02, 0.11); jaw.add(tongue);
    // Ears folded forward at the tips (drop ears, Norfolk style).
    const ears = [-1, 1].map((s2) => {
      const e = new T.Group(); e.position.set(s2 * 0.12, 0.11, 0.0);
      e.add(cube(0.1, 0.06, 0.1, dk, s2 * 0.02, 0.0, 0.0));
      const flap = cube(0.1, 0.09, 0.03, dk, s2 * 0.03, -0.05, 0.05); flap.rotation.x = 0.35; e.add(flap);
      head.add(e); e.side = s2; return e;
    });
    g.head = head; g.tag = tagM; g.jaw = jaw;
    g.pose = function (p) {
      p = p || {};
      const sit = p.sit || 0, lie = p.lie || 0, jump = p.jump || 0, run = p.run || 0, ph = p.phase || 0;
      body.rotation.x = -sit * 0.62 - jump * 0.6;
      body.position.y = -lie * 0.16 + jump * 0.12 - sit * 0.165;
      const s1 = Math.sin(ph) * run * 0.8, s2 = -s1;
      FL.rotation.x = s1 + sit * 0.62 - lie * 1.35; FR.rotation.x = s2 + sit * 0.62 - lie * 1.35;
      // pawL / pawR: lift a front paw forward (0..1), for a raised paw, digging or a high five.
      FL.rotation.x -= (p.pawL || 0) * 1.4; FR.rotation.x -= (p.pawR || 0) * 1.4;
      RL.rotation.x = s2 - sit * 0.95 + lie * 1.35; RR.rotation.x = s1 - sit * 0.95 + lie * 1.35;
      neck.rotation.x = sit * 0.5 + jump * 0.4;
      head.rotation.set(p.headX || 0, p.headY || 0, p.headZ || 0);
      tail.rotation.set(sit * 0.2, p.wag || 0, 0);
      jaw.rotation.x = p.mouth === undefined ? 0.15 : p.mouth;
      tongue.visible = p.tongue !== false;
      ears.forEach((e) => (e.rotation.z = e.side * (p.ears || 0) * 0.5));
      brows.forEach((b, i) => { b.position.y = 0.075 + (p.browUp || 0) * 0.02; b.rotation.z = (i ? -1 : 1) * (0.2 + (p.browWorry || 0) * 0.3); }); // Inner ends up: soft and friendly.
      // closedL / closedR shut one eye (a wink, or one eye opening).
      eyes.forEach((e, i) => (e.scale.y = p.closed || (i === 0 ? p.closedL : p.closedR) ? 0.15 : 1));
      blush.forEach((b) => (b.visible = !!p.blush));
    };
    g.pose({});
    return g;
  }

  /* Puddle: a blocky duckling, about 12 cm tall, faces +z, feet on y = 0. duck.pose({ flap, beak, headY, look }) */
  function duckling(opts) {
    const o = Object.assign({ body: "#f6d24a", beak: "#e8892a", wing: "#e8bd34" }, opts || {});
    const g = new T.Group();
    const yel = mat(o.body, { emissive: "#4a3a08" }), black = new T.MeshBasicMaterial({ color: "#14100e" }), white = new T.MeshBasicMaterial({ color: "#ffffff" });
    g.add(cube(0.09, 0.07, 0.11, yel, 0, 0.045, 0));
    g.add(cube(0.04, 0.03, 0.03, yel, 0, 0.07, -0.065));
    [-1, 1].forEach((s2) => g.add(cube(0.015, 0.02, 0.04, mat(o.beak), s2 * 0.022, 0.005, 0.01)));
    const head = new T.Group(); head.position.set(0, 0.1, 0.035); g.add(head);
    head.add(cube(0.07, 0.065, 0.065, yel, 0, 0, 0));
    head.add(cube(0.02, 0.02, 0.02, yel, 0, 0.042, -0.005));
    const beak = cube(0.035, 0.012, 0.03, mat(o.beak), 0, -0.008, 0.045); head.add(beak);
    [-1, 1].forEach((s2) => { head.add(cube(0.014, 0.018, 0.005, black, s2 * 0.02, 0.01, 0.033)); head.add(cube(0.005, 0.006, 0.003, white, s2 * 0.02 + 0.004, 0.015, 0.036)); });
    const wings = [-1, 1].map((s2) => { const w = new T.Group(); w.position.set(s2 * 0.048, 0.06, 0); w.add(cube(0.012, 0.04, 0.06, mat(o.wing), 0, -0.02, 0)); g.add(w); w.side = s2; return w; });
    g.head = head;
    g.pose = function (p) {
      p = p || {};
      wings.forEach((w) => (w.rotation.z = w.side * (p.flap || 0) * 0.9));
      beak.position.y = -0.008 - (p.beak || 0) * 0.006;
      head.rotation.set(p.look || 0, p.headY || 0, 0);
    };
    g.pose({});
    return g;
  }

  /* The viewer's own arm and hand, for first-person shots. Add to the camera. */
  function povArm(sleeve) {
    const g = new T.Group();
    g.add(cube(0.12, 0.12, 0.6, mat(sleeve || "#3f5e7f"), 0, 0, 0.3));
    g.add(cube(0.12, 0.11, 0.13, mat("#e6b491", { emissive: "#3a2418" }), 0, 0, -0.04));
    return g;
  }

  window.LP9 = { figure, SEAT, READ, EAR, glow, dog, duckling, povArm };
})();
