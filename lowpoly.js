/* Low-poly world kit for "What if" videos. Everything is flat-shaded and seeded:
   same seed, same world, so every render is identical. Needs THREE (global). */
(function () {
  const T = THREE;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PAL = {
    day: { skyTop: "#6f97d8", skyMid: "#a8b6dc", skyLow: "#d6cdc8", fog: "#cfc6bd", sun: "#fff1dc", hemiSky: "#e4e8ff", hemiGround: "#a89a86" },
    road: "#211d1d", paint: "#efe9dc", walk: "#c9bda6", grass: "#74a24e", cloud: "#f1e9da",
    walls: ["#8fb3a4", "#7f9fbf", "#e4d8c0", "#c9b79a", "#a7c0c9"],
    roofs: ["#6b4630", "#7d3f2e", "#55453d", "#94553a"],
    trees: ["#5fa98c", "#4f9a7b", "#79b58f"],
    cars: ["#b3202a", "#e0b93a", "#e8e4d8", "#3f6f9f", "#2f7f6a"],
    skin: ["#e8b797", "#c98d68", "#8c5a3f", "#f0c7a8"],
    hair: ["#3a2619", "#17120f", "#c9a55a", "#7a4a26"],
    shirts: ["#3a9a6a", "#d9783a", "#2f4f8f", "#e6e0d0", "#b5473f"],
  };

  function mat(color, opts) {
    return new T.MeshLambertMaterial(Object.assign({ color, flatShading: true }, opts || {}));
  }
  function shadow(m, cast, receive) {
    m.castShadow = cast !== false;
    m.receiveShadow = receive !== false;
    return m;
  }
  function box(w, h, d, material, x, y, z) {
    const m = shadow(new T.Mesh(new T.BoxGeometry(w, h, d), material));
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    return m;
  }

  /* Renderer, lights and sky. Call stage.render(camera) once per frame. */
  function stage(canvas, opts) {
    const o = Object.assign({ width: 1080, height: 1920, palette: PAL.day, shadowSize: 130, fogNear: 180, fogFar: 1500 }, opts || {});
    // web pages can pass preserve: false (faster on phones); videos keep the drawing buffer for frame capture
    const renderer = new T.WebGLRenderer({ canvas, antialias: o.antialias !== false, preserveDrawingBuffer: o.preserve !== false, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(o.width, o.height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    scene.fog = new T.Fog(o.palette.fog, o.fogNear, o.fogFar);

    const hemi = new T.HemisphereLight(o.palette.hemiSky, o.palette.hemiGround, 1.75);
    scene.add(hemi);
    const sun = new T.DirectionalLight(o.palette.sun, 2.6);
    sun.position.set(70, 130, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = o.shadowSize;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 500 });
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);

    scene.add(sky(o.palette));
    const camera = new T.PerspectiveCamera(46, o.width / o.height, 0.2, 4000);
    return { renderer, scene, camera, sun, hemi, render() { renderer.render(scene, camera); } };
  }

  function sky(p) {
    const g = new T.SphereGeometry(3000, 24, 16);
    const c = [];
    const top = new T.Color(p.skyTop), mid = new T.Color(p.skyMid), low = new T.Color(p.skyLow);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 3000);
      const col = h < 0.18 ? low.clone().lerp(mid, h / 0.18) : mid.clone().lerp(top, Math.min(1, (h - 0.18) / 0.5));
      c.push(col.r, col.g, col.b);
    }
    g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10;
    m.name = "sky";
    return m;
  }

  function lumpy(radius, seed, detail) {
    const g = new T.IcosahedronGeometry(radius, detail === undefined ? 1 : detail);
    const r = rng(seed);
    const pos = g.attributes.position;
    const seen = {};
    for (let i = 0; i < pos.count; i++) {
      const k = [pos.getX(i).toFixed(3), pos.getY(i).toFixed(3), pos.getZ(i).toFixed(3)].join();
      if (!seen[k]) seen[k] = 1 + (r() - 0.5) * 0.22;
      const f = seen[k];
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.92, pos.getZ(i) * f);
    }
    g.computeVertexNormals();
    return g;
  }

  function cloud(seed, size) {
    const r = rng(seed);
    const grp = new T.Group();
    const material = mat(PAL.cloud, { emissive: "#7f7c86", fog: false });
    const n = 6 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const rad = size * (0.3 + r() * 0.35) * (1 - (Math.abs(i - n / 2) / n) * 0.6);
      const m = new T.Mesh(lumpy(rad, seed * 7 + i, 2), material);
      m.position.set((i - n / 2) * size * 0.34 + (r() - 0.5) * size * 0.2, rad * 0.55 + r() * size * 0.12, (r() - 0.5) * size * 0.5);
      grp.add(m);
    }
    return grp;
  }

  function facade(wall, glass, cols, rows, seed) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 512;
    const x = c.getContext("2d");
    const r = rng(seed);
    x.fillStyle = wall;
    x.fillRect(0, 0, 256, 512);
    const cw = 256 / cols, ch = 512 / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        x.fillStyle = r() < 0.12 ? "#d8d4c4" : glass;
        x.fillRect(i * cw + cw * 0.2, j * ch + ch * 0.22, cw * 0.6, ch * 0.56);
      }
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function tower(seed, w, h, d) {
    const r = rng(seed);
    const wall = ["#d9d0bf", "#b98a6c", "#c9c4b8", "#a8a096"][Math.floor(r() * 4)];
    const tex = facade(wall, "#34383f", Math.max(3, Math.round(w / 3.2)), Math.max(4, Math.round(h / 3.4)), seed);
    const side = mat("#ffffff", { map: tex });
    const top = mat("#8d8579");
    const m = shadow(new T.Mesh(new T.BoxGeometry(w, h, d), [side, side, top, top, side, side]));
    m.position.y = h / 2;
    const g = new T.Group();
    g.add(m);
    return g;
  }

  function house(seed, w, d) {
    const r = rng(seed);
    w = w || 9;
    d = d || 8;
    const h = 4.6 + Math.floor(r() * 2) * 2.4;
    const g = new T.Group();
    g.add(box(w, h, d, mat(PAL.walls[Math.floor(r() * PAL.walls.length)])));
    const shape = new T.Shape();
    const ov = 0.6;
    shape.moveTo(-w / 2 - ov, 0);
    shape.lineTo(0, w * 0.34);
    shape.lineTo(w / 2 + ov, 0);
    shape.closePath();
    const rg = new T.ExtrudeGeometry(shape, { depth: d + ov * 2, bevelEnabled: false });
    const roof = shadow(new T.Mesh(rg, mat(PAL.roofs[Math.floor(r() * PAL.roofs.length)])));
    roof.position.set(0, h, -d / 2 - ov);
    g.add(roof);
    const dark = mat("#39424d");
    const cols = Math.max(2, Math.floor(w / 3));
    for (let f = 0; f < Math.round(h / 2.4); f++) {
      for (let i = 0; i < cols; i++) {
        const px = -w / 2 + (w / cols) * (i + 0.5);
        const win = new T.Mesh(new T.BoxGeometry(1.25, 1.25, 0.12), dark);
        win.position.set(px, 1.5 + f * 2.4, d / 2 + 0.02);
        g.add(win);
        const back = win.clone();
        back.position.z = -d / 2 - 0.02;
        g.add(back);
      }
    }
    return g;
  }

  function coneTree(seed, h) {
    const r = rng(seed);
    h = h || 6 + r() * 4;
    const g = new T.Group();
    const trunk = shadow(new T.Mesh(new T.CylinderGeometry(0.18, 0.26, h * 0.25, 6), mat("#6b4a33")));
    trunk.position.y = h * 0.125;
    g.add(trunk);
    const c = shadow(new T.Mesh(new T.ConeGeometry(h * 0.27, h * 0.85, 7), mat(PAL.trees[Math.floor(r() * PAL.trees.length)])));
    c.position.y = h * 0.62;
    g.add(c);
    return g;
  }

  /* Facing +z. 4.4 m long; wheels are a named child list for spinning. */
  function car(color) {
    const g = new T.Group();
    const body = mat(color);
    const lower = box(1.85, 0.62, 4.3, body, 0, 0.36, 0);
    g.add(lower);
    const cab = new T.BoxGeometry(1.65, 0.62, 2.3);
    const p = cab.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * 0.84);
        p.setZ(i, p.getZ(i) * 0.72 - 0.1);
      }
    }
    cab.computeVertexNormals();
    const glass = mat("#5c95ab");
    const cabin = shadow(new T.Mesh(cab, [glass, glass, body, body, glass, glass]));
    cabin.position.set(0, 1.28, -0.2);
    g.add(cabin);
    g.add(box(1.9, 0.14, 0.2, mat("#3b3b3b"), 0, 0.3, 2.14));
    g.add(box(1.9, 0.14, 0.2, mat("#3b3b3b"), 0, 0.3, -2.14));
    const tyre = mat("#1f1d1d"), hub = mat("#bdbdb8");
    g.wheels = [];
    [[-0.95, 1.38], [0.95, 1.38], [-0.95, -1.38], [0.95, -1.38]].forEach(([x, z]) => {
      const w = new T.Group();
      const t = shadow(new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.28, 12), tyre));
      t.rotation.z = Math.PI / 2;
      w.add(t);
      const h = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.3, 8), hub);
      h.rotation.z = Math.PI / 2;
      w.add(h);
      w.position.set(x, 0.4, z);
      g.add(w);
      g.wheels.push(w);
    });
    return g;
  }

  /* 1.8 m figure, origin at the feet. pose(p): armL/armR/legL/legR in radians. */
  function person(opts) {
    const o = Object.assign({ skin: PAL.skin[0], hair: PAL.hair[0], top: PAL.shirts[0], legs: "#2c3550", suit: false, seed: 1 }, opts || {});
    const g = new T.Group();
    const cyl = (rt, rb, h, m) => shadow(new T.Mesh(new T.CylinderGeometry(rt, rb, h, 6), m), true, false);
    const topM = mat(o.top), legM = mat(o.legs), skin = mat(o.skin), shoe = mat("#191614");
    const torso = cyl(0.21, 0.17, 0.64, topM);
    torso.scale.z = 0.68;
    torso.position.y = 1.2;
    g.add(torso);
    if (o.suit) {
      const shirt = box(0.14, 0.42, 0.04, mat("#f1ece2"), 0, 1.08, 0.125);
      shirt.rotation.x = -0.03;
      g.add(shirt);
      g.add(box(0.05, 0.36, 0.03, mat("#c5242b"), 0, 1.11, 0.15));
    }
    const head = shadow(new T.Mesh(new T.IcosahedronGeometry(0.135, 0), skin), true, false);
    head.scale.y = 1.2;
    head.position.y = 1.66;
    g.add(head);
    const hair = shadow(new T.Mesh(new T.IcosahedronGeometry(0.14, 0), mat(o.hair)), true, false);
    hair.scale.set(1.04, 0.72, 1.02);
    hair.position.set(0, 1.74, -0.02);
    g.add(hair);
    function limb(x, y, len, m, foot) {
      const p = new T.Group();
      p.position.set(x, y, 0);
      const c = cyl(foot ? 0.095 : 0.062, foot ? 0.07 : 0.05, len, m);
      c.position.y = -len / 2;
      p.add(c);
      const end = foot ? box(0.14, 0.09, 0.28, shoe, 0, -len - 0.03, 0.05) : shadow(new T.Mesh(new T.IcosahedronGeometry(0.06, 0), skin), true, false);
      if (!foot) end.position.y = -len - 0.03;
      p.add(end);
      g.add(p);
      return p;
    }
    const armL = limb(-0.26, 1.48, 0.62, topM);
    const armR = limb(0.26, 1.48, 0.62, topM);
    const legL = limb(-0.1, 0.9, 0.82, legM, true);
    const legR = limb(0.1, 0.9, 0.82, legM, true);
    g.pose = function (p) {
      armL.rotation.set(p.armLx || 0, 0, -(p.armL || 0));
      armR.rotation.set(p.armRx || 0, 0, p.armR || 0);
      legL.rotation.set(p.legL || 0, 0, -(p.legSpread || 0));
      legR.rotation.set(p.legR || 0, 0, p.legSpread || 0);
    };
    g.pose({ armL: 0.08, armR: 0.08 });
    return g;
  }

  /* Road running along z through x = 0, with paint, walkways and lawns. */
  function street(opts) {
    const o = Object.assign({ halfWidth: 7, zFrom: -420, zTo: 90 }, opts || {});
    const g = new T.Group();
    const len = o.zTo - o.zFrom, mid = (o.zTo + o.zFrom) / 2;
    const plane = (w, l, color, x, y, z) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, l), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      return m;
    };
    g.add(plane(o.halfWidth * 2, len, PAL.road, 0, 0.02, mid));
    g.add(plane(0.16, len, PAL.paint, -o.halfWidth + 0.5, 0.03, mid));
    g.add(plane(0.16, len, PAL.paint, o.halfWidth - 0.5, 0.03, mid));
    for (let z = o.zFrom; z < o.zTo; z += 8) g.add(plane(0.22, 3.4, PAL.paint, 0, 0.03, z));
    [-1, 1].forEach((s) => {
      g.add(box(4, 0.12, len, mat(PAL.walk), s * (o.halfWidth + 2), 0, mid));
      g.add(plane(90, len, PAL.grass, s * (o.halfWidth + 49), 0.015, mid));
    });
    return g;
  }

  /* Thousands of tiny blocks: the town seen from above. Fast (instanced). */
  function district(seed, opts) {
    const o = Object.assign({ xFrom: -900, xTo: 900, zFrom: -1800, zTo: 500, clear: 56, cell: 20 }, opts || {});
    const r = rng(seed);
    const items = [];
    for (let x = o.xFrom; x < o.xTo; x += o.cell) {
      for (let z = o.zFrom; z < o.zTo; z += o.cell) {
        if (Math.abs(x) < o.clear && z > (o.clearFrom === undefined ? -440 : o.clearFrom) && z < (o.clearTo === undefined ? 100 : o.clearTo)) continue;
        const block = Math.floor(x / (o.cell * 5)) * 91 + Math.floor(z / (o.cell * 4)) * 37;
        if (((x / o.cell) | 0) % 5 === 0 || ((z / o.cell) | 0) % 4 === 0) continue;
        if (Math.abs(block) % 11 === 0) continue;
        items.push({ x: x + (r() - 0.5) * 2, z: z + (r() - 0.5) * 2, w: 11 + r() * 5, d: 11 + r() * 5, h: 4 + r() * 8 });
      }
    }
    const inst = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat("#ffffff"), items.length);
    const dummy = new T.Object3D(), col = new T.Color();
    const colours = ["#c78463", "#d8c9ad", "#b06f55", "#e0d6c2", "#9a8f83", "#cda17f"];
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.h / 2, it.z);
      dummy.scale.set(it.w, it.h, it.d);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, col.set(colours[Math.floor(r() * colours.length)]));
    });
    inst.receiveShadow = true;
    const g = new T.Group();
    const ground = new T.Mesh(new T.PlaneGeometry(6000, 6000), mat("#2b2724"));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    g.add(ground);
    g.add(inst);
    return g;
  }

  /* Puffs that grow and fade as a function of progress: dust.seek(p). */
  function dust(seed, count, radius, color) {
    const r = rng(seed);
    const g = new T.Group();
    const parts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.3;
      const material = mat(color || "#b9a083", { transparent: true, opacity: 0.8, depthWrite: false });
      const m = new T.Mesh(lumpy(0.8 + r() * 0.8, seed + i, 0), material);
      g.add(m);
      parts.push({ m, a, reach: radius * (0.7 + r() * 0.6), rise: 1 + r() * 2.4, size: 1 + r() * 1.6 });
    }
    g.seek = function (p) {
      const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
      parts.forEach((q) => {
        q.m.visible = p > 0 && p < 1;
        q.m.position.set(Math.cos(q.a) * q.reach * e, 0.4 + q.rise * e, Math.sin(q.a) * q.reach * e);
        q.m.scale.setScalar(q.size * (0.25 + e * 0.8));
        q.m.material.opacity = 0.55 * (1 - p);
      });
    };
    g.seek(0);
    return g;
  }

  /* Thin rushing lines around a point: streaks.seek(time, speed, opacity). */
  function streaks(seed, count, spread, length) {
    const r = rng(seed);
    const g = new T.Group();
    const material = new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, depthWrite: false, fog: false });
    const parts = [];
    for (let i = 0; i < count; i++) {
      const m = new T.Mesh(new T.BoxGeometry(0.022, length * (0.5 + r() * 0.8), 0.035), material);
      const a = r() * Math.PI * 2, d = spread * (0.5 + r() * 0.5);
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      g.add(m);
      parts.push({ m, base: r() * 60 });
    }
    g.seek = function (time, speed, opacity) {
      material.opacity = opacity;
      g.visible = opacity > 0.005;
      parts.forEach((q) => {
        const y = ((q.base + time * speed) % 60 + 60) % 60;
        q.m.position.y = y - 30;
      });
    };
    return g;
  }

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  window.LP = { rng, PAL, mat, box, shadow, stage, sky, cloud, tower, house, coneTree, car, person, street, district, dust, streaks, smooth, lumpy };
})();
