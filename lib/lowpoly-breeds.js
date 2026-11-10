/* lowpoly-breeds.js: detailed blocky dog breeds for the sanctuary site (and any video that wants them). Needs THREE only.

   LPB.NAMES                 breed ids, LPB.LABEL[id] their display names.
   LPB.rig(id, look)         the dog as a list of boxes on 7 bones, cached per id + look. look is a string of words such as
                             "black", "white", "black and white", "dapple", "brindle", "merle", "sable", "spotted", "mini", "big".
                             Breed first, colour second: the words only recolour or resize the breed's own model.
   LPB.pose(rig, o, out)     fills out[0..6] (Matrix4, dog space) with the bones for a pose:
                             o = { drop 0..1 (lying), sit 0..1, run 0..1, ph (stride phase), wag (radians), look (head turn) }.
                             World matrix of part p = dogMatrix (translate, yaw, uniform scale rig.s) x out[p.bone] x p.m.
   LPB.group(rig)            a THREE.Group with real meshes and .update(o): for preview pages and videos.

   Dog space: ground at y = 0, nose towards +z, a medium dog is about 1 unit long before rig.s.
   Bones: 0 body, 1 head, 2 tail, 3 front left, 4 front right, 5 back left, 6 back right.
   rig.anchor: collar { y, z, w, rx } and medal [x, y, z] on the body, hat { y, z, w } on the head, tag (height of the head top). */
(function () {
  const T = THREE;

  /* ---------- colours ---------- */
  const hex = (h) => parseInt(h.slice(1), 16);
  const toHex = (n) => "#" + n.toString(16).padStart(6, "0");
  function shade(h, a) { // a < 0 darker, a > 0 lighter
    const n = hex(h); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(a < 0 ? c * (1 + a) : c + (255 - c) * a)));
    return toHex((f(r) << 16) | (f(g) << 8) | f(b));
  }
  const NAMED = {
    black: "#1d1a19", white: "#f5f2ec", brown: "#6e4428", chocolate: "#5a3620", liver: "#5e3424", grey: "#8b8e93", gray: "#8b8e93",
    blue: "#7c8591", silver: "#b8bcc1", red: "#9c4522", ginger: "#c86e2c", orange: "#d47a30", cream: "#ecdcbc", tan: "#c4925c",
    fawn: "#d2ad7a", golden: "#d9a24a", gold: "#d9a24a", yellow: "#e2c27e", apricot: "#e2a868", beige: "#e0caa2", wheaten: "#dcc394",
    "light brown": "#a8774a", "dark brown": "#4a2e1c", "light tan": "#dcc09a", "irish cream": "#eedfc2",
  };

  /* ---------- the breeds ----------
     Proportions are in dog space. pal slots: c coat, d second colour, b white/belly, t tan points, ear, hd head, mz muzzle,
     f fur/fluff, sock lower legs, mk mask, eye, n nose, in inner ear, p tongue, tip tail tip.
     ears: drop long up semi bat rose fold butterfly none.  tail: otter plume sabre whip sickle curl curlTight stub pom.
     marks: saddle mask bib socks blaze tanpoints huskyface urajiro wolfface spots ticking patches merle brindle sable tailtip liverhead wrinkles.
     fluff: ruff ruffBig feather pants belly fluffBody longcoat topknot bow wiry skirt shaggy poodle topfluff jowls. */
  const B = {
    golden: { name: "Golden retriever", s: 0.62, ears: "drop", earS: 1.05, tail: "plume", tongue: 1, fluff: ["feather", "belly", "ruff", "pants"], pal: { c: "#d9a24a", f: "#e8b862", ear: "#c78c38", b: "#ecc27a" } },
    lab: { name: "Labrador", s: 0.62, legW: 0.11, headW: 0.33, snL: 0.16, snW: 0.19, ears: "drop", tail: "otter", tailW: 0.1, tongue: 1, pal: { c: "#e2c27e", ear: "#d2ae66", b: "#efd8a4" } },
    shepherd: { name: "German shepherd", s: 0.7, bodyL: 0.88, loin: 0.84, chestDrop: 0.06, headW: 0.3, snL: 0.19, snW: 0.16, ears: "up", earS: 1.35, tail: "sabre", tailL: 0.4, tongue: 1, marks: ["saddle", "mask"], fluff: ["pants"], pal: { c: "#bb7a3a", d: "#221b16", b: "#d8a364", tip: "#221b16", ear: "#2a221c" } },
    malinois: { name: "Belgian malinois", s: 0.66, bodyL: 0.82, legH: 0.44, chestDrop: 0.05, headW: 0.28, snL: 0.18, snW: 0.15, ears: "up", earS: 1.3, tail: "sabre", tongue: 1, marks: ["mask", "sable"], pal: { c: "#c98d4a", d: "#241c16", ear: "#2a221c", tip: "#241c16" } },
    husky: { name: "Siberian husky", s: 0.64, ears: "up", earS: 1.1, tail: "curl", tailW: 0.13, tongue: 1, marks: ["huskyface", "bib", "socks"], fluff: ["ruff"], pal: { c: "#7c8590", b: "#f3f3f1", f: "#8c95a0", eye: "#4fa6e6", ear: "#5a626c" } },
    malamute: { name: "Alaskan malamute", s: 0.76, bodyW: 0.4, bodyH: 0.34, legW: 0.125, headW: 0.37, headH: 0.3, snW: 0.2, ears: "up", earS: 0.9, tail: "curl", tailW: 0.15, tongue: 1, marks: ["huskyface", "bib", "socks"], fluff: ["ruff", "pants"], pal: { c: "#6c6763", b: "#f4f2ee", ear: "#4a4542" } },
    pitbull: { name: "Pit bull", s: 0.58, bodyW: 0.38, legW: 0.12, headW: 0.37, headH: 0.29, snL: 0.13, snW: 0.21, snH: 0.14, ears: "rose", tail: "whip", tailL: 0.26, tongue: 1, marks: ["bib"], pal: { c: "#9e6c44", b: "#f2ece2" } },
    staffy: { name: "Staffordshire bull terrier", s: 0.48, legH: 0.32, bodyW: 0.4, legW: 0.12, headW: 0.39, headH: 0.3, snL: 0.11, snW: 0.22, snH: 0.14, ears: "rose", tail: "whip", tailL: 0.24, tongue: 1, marks: ["bib", "brindle"], pal: { c: "#4e3c30", b: "#f2ece2" } },
    bully: { name: "American bully", s: 0.64, legH: 0.32, bodyW: 0.48, bodyH: 0.34, legW: 0.15, headW: 0.44, headH: 0.33, snL: 0.11, snW: 0.25, snH: 0.15, ears: "rose", tail: "whip", tailL: 0.24, tongue: 1, marks: ["bib"], fluff: ["jowls"], pal: { c: "#6f6b6c", b: "#f2ece2" } },
    dachshund: { name: "Dachshund", s: 0.36, legH: 0.18, legW: 0.09, bodyL: 1.25, bodyW: 0.29, bodyH: 0.27, chestDrop: 0.06, headW: 0.27, headH: 0.25, snL: 0.21, snW: 0.13, snH: 0.11, ears: "long", earS: 0.95, tail: "otter", tailL: 0.34, tailW: 0.06, tailUp: 0.25, pal: { c: "#8a4520", ear: "#6a3418" } },
    corgi: { name: "Corgi", s: 0.42, legH: 0.2, legW: 0.1, bodyL: 1.05, bodyW: 0.38, bodyH: 0.3, headW: 0.34, snL: 0.14, snW: 0.16, ears: "up", earS: 1.45, tail: "stub", tongue: 1, marks: ["bib", "socks", "blaze"], fluff: ["pants"], pal: { c: "#de8e36", b: "#fff4e4", f: "#f2c48a" } },
    chihuahua: { name: "Chihuahua", s: 0.24, legH: 0.33, legW: 0.07, bodyL: 0.6, bodyW: 0.27, bodyH: 0.24, headW: 0.37, headH: 0.33, headD: 0.3, snL: 0.08, snW: 0.12, snH: 0.09, snY: -0.08, eye: 0.068, ears: "up", earS: 1.6, tail: "sickle", tailW: 0.05, tailL: 0.28, pal: { c: "#d9b078", b: "#f1dcb6", in: "#e8b0a8" } },
    pomeranian: { name: "Pomeranian", s: 0.22, legH: 0.2, legW: 0.08, bodyL: 0.5, bodyW: 0.38, bodyH: 0.35, headW: 0.3, snL: 0.07, snW: 0.11, snH: 0.09, ears: "up", earS: 0.7, tail: "curl", tailW: 0.16, tongue: 1, fluff: ["ruffBig", "pants", "fluffBody"], pal: { c: "#e39a4a", f: "#efb066", b: "#f6d6a6" } },
    doberman: { name: "Doberman", s: 0.74, legH: 0.48, legW: 0.09, bodyL: 0.82, chestDrop: 0.08, loin: 0.68, neck: 0.16, headW: 0.27, headH: 0.25, headD: 0.3, snL: 0.22, snW: 0.14, ears: "up", earS: 1.5, tail: "stub", marks: ["tanpoints"], pal: { c: "#1f1a18", t: "#a3592a" } },
    rottweiler: { name: "Rottweiler", s: 0.76, bodyW: 0.42, bodyH: 0.34, legW: 0.12, headW: 0.39, headH: 0.32, snL: 0.14, snW: 0.21, snH: 0.14, ears: "fold", earS: 1.1, tail: "stub", tongue: 1, marks: ["tanpoints"], pal: { c: "#1d1916", t: "#9a5428" } },
    canecorso: { name: "Cane corso", s: 0.84, legH: 0.46, bodyW: 0.42, bodyH: 0.34, legW: 0.13, headW: 0.43, headH: 0.34, snL: 0.14, snW: 0.25, snH: 0.16, ears: "up", earS: 0.75, tail: "stub", fluff: ["jowls"], marks: ["wrinkles"], pal: { c: "#2d2c2e" } },
    greatdane: { name: "Great Dane", s: 1.02, legH: 0.6, legW: 0.1, bodyL: 0.84, chestDrop: 0.09, loin: 0.74, neck: 0.22, headW: 0.28, headH: 0.31, headD: 0.32, snL: 0.21, snW: 0.19, snH: 0.17, ears: "drop", earS: 0.9, tail: "whip", tailL: 0.42, marks: ["mask"], fluff: ["jowls"], pal: { c: "#cba268" } },
    dalmatian: { name: "Dalmatian", s: 0.66, legH: 0.44, headW: 0.29, snL: 0.18, snW: 0.16, ears: "drop", tail: "whip", tailL: 0.38, tongue: 1, marks: ["spots"], pal: { c: "#f4f1ea", d: "#1d1a18", ear: "#2a2624" } },
    pug: { name: "Pug", s: 0.36, legH: 0.25, legW: 0.1, bodyW: 0.4, bodyH: 0.33, bodyL: 0.64, headW: 0.41, headH: 0.36, headD: 0.32, snL: 0.04, snW: 0.23, snH: 0.15, eye: 0.075, ears: "fold", earS: 0.85, tail: "curlTight", tongue: 1, marks: ["mask", "wrinkles"], pal: { c: "#d8bd92", ear: "#2a2420", mk: "#2a2420" } },
    shihtzu: { name: "Shih tzu", s: 0.32, legH: 0.2, legW: 0.09, bodyL: 0.62, bodyW: 0.34, headW: 0.36, headH: 0.32, snL: 0.05, snW: 0.16, snH: 0.1, eye: 0.062, ears: "long", earS: 1.05, tail: "curl", tailW: 0.13, fluff: ["longcoat", "topknot", "bow"], marks: ["patches"], pal: { c: "#f3ede3", d: "#b88850", ear: "#b88850", f: "#f6f1e8" } },
    poodle: { name: "Poodle", s: 0.6, legH: 0.48, legW: 0.075, bodyL: 0.66, bodyW: 0.3, neck: 0.2, headW: 0.26, headH: 0.25, snL: 0.19, snW: 0.12, snH: 0.11, ears: "long", earS: 1.05, tail: "pom", fluff: ["poodle"], pal: { c: "#f5f0e8", f: "#fbf8f2" } },
    doodle: { name: "Doodle", s: 0.62, legW: 0.12, bodyW: 0.38, bodyH: 0.32, headW: 0.36, snL: 0.12, snW: 0.2, ears: "long", earS: 1.05, tail: "plume", tongue: 1, fluff: ["shaggy", "wiry"], pal: { c: "#d9aa6e" } },
    beagle: { name: "Beagle", s: 0.44, legH: 0.32, bodyL: 0.74, headW: 0.31, snL: 0.16, snW: 0.16, ears: "long", earS: 0.95, tail: "sickle", tongue: 1, marks: ["saddle", "bib", "socks", "blaze", "tailtip"], pal: { c: "#c98a46", d: "#241c17", b: "#faf3e6", ear: "#a86a32" } },
    stbernard: { name: "St Bernard", s: 0.96, bodyW: 0.45, bodyH: 0.36, legW: 0.135, headW: 0.43, headH: 0.36, snL: 0.14, snW: 0.25, snH: 0.17, ears: "drop", earS: 0.95, tail: "plume", tailL: 0.38, fluff: ["jowls", "ruff"], marks: ["patches", "blaze", "bib", "socks", "mask", "tailtip"], pal: { c: "#f6f1e8", d: "#a8521e", ear: "#a8521e", mk: "#4a2a18", b: "#f8f4ec" } },
    bernese: { name: "Bernese mountain dog", s: 0.86, bodyW: 0.42, bodyH: 0.34, legW: 0.13, headW: 0.38, snL: 0.14, snW: 0.19, ears: "drop", tail: "plume", tailL: 0.38, tongue: 1, fluff: ["feather", "ruff", "pants"], marks: ["tanpoints", "blaze", "bib", "socks", "tailtip"], pal: { c: "#1c1716", t: "#a24e1e", b: "#f6f2ea" } },
    newfoundland: { name: "Newfoundland", s: 0.96, bodyW: 0.46, bodyH: 0.38, legW: 0.14, headW: 0.42, headH: 0.35, snL: 0.13, snW: 0.22, snH: 0.15, ears: "drop", earS: 0.8, tail: "plume", tailUp: -0.4, tongue: 1, fluff: ["jowls", "ruff", "feather", "pants", "shaggy"], pal: { c: "#1e1b1b" } },
    pyrenees: { name: "Great Pyrenees", s: 0.94, bodyW: 0.44, bodyH: 0.36, legW: 0.13, headW: 0.38, snL: 0.15, snW: 0.19, ears: "drop", earS: 0.8, tail: "plume", tailL: 0.4, tongue: 1, fluff: ["ruffBig", "pants", "feather"], pal: { c: "#f6f3ec", f: "#fdfcf8", ear: "#ece2d0" } },
    tibetanmastiff: { name: "Tibetan mastiff", s: 0.94, bodyW: 0.46, bodyH: 0.36, legW: 0.14, headW: 0.42, headH: 0.34, snL: 0.13, snW: 0.22, ears: "drop", earS: 0.85, tail: "curl", tailW: 0.17, fluff: ["ruffBig", "pants", "fluffBody"], marks: ["tanpoints"], pal: { c: "#251e1b", t: "#a8622c", f: "#2e2622" } },
    mastiff: { name: "Mastiff", s: 0.9, bodyW: 0.46, bodyH: 0.36, legW: 0.14, headW: 0.46, headH: 0.36, snL: 0.12, snW: 0.27, snH: 0.17, ears: "drop", earS: 0.75, tail: "whip", tailL: 0.34, fluff: ["jowls"], marks: ["mask", "wrinkles"], pal: { c: "#c79a62" } },
    dogo: { name: "Dogo argentino", s: 0.82, legH: 0.46, bodyW: 0.4, legW: 0.12, headW: 0.4, headH: 0.32, snL: 0.15, snW: 0.22, snH: 0.15, ears: "drop", earS: 0.7, tail: "whip", tailL: 0.36, tongue: 1, pal: { c: "#f7f5ef", n: "#2a2020" } },
    kangal: { name: "Kangal", s: 0.92, legH: 0.5, bodyW: 0.4, legW: 0.12, headW: 0.38, headH: 0.32, snL: 0.15, snW: 0.2, ears: "drop", earS: 0.68, tail: "curl", tailW: 0.13, fluff: ["ruff"], marks: ["mask"], pal: { c: "#cfb38a", ear: "#2a2420", mk: "#2a2420" } },
    borzoi: { name: "Borzoi", s: 0.82, legH: 0.56, legW: 0.07, bodyL: 0.86, bodyW: 0.26, chestDrop: 0.14, loin: 0.58, neck: 0.2, headW: 0.2, headH: 0.2, headD: 0.26, snL: 0.3, snW: 0.1, snH: 0.1, ears: "rose", earS: 0.8, tail: "whip", tailL: 0.46, fluff: ["feather", "belly", "ruff"], marks: ["patches"], pal: { c: "#f4efe6", d: "#c99a62", ear: "#c99a62" } },
    whippet: { name: "Whippet", s: 0.56, legH: 0.48, legW: 0.065, bodyL: 0.74, bodyW: 0.24, chestDrop: 0.1, loin: 0.55, neck: 0.16, headW: 0.22, headH: 0.21, snL: 0.22, snW: 0.1, snH: 0.1, ears: "rose", earS: 0.8, tail: "whip", tailL: 0.4, tailW: 0.05, marks: ["bib", "socks"], pal: { c: "#b8a28c", b: "#f4f0ea" } },
    wolfhound: { name: "Irish wolfhound", s: 1.02, legH: 0.58, legW: 0.1, bodyL: 0.9, bodyW: 0.32, chestDrop: 0.1, loin: 0.7, neck: 0.18, headW: 0.26, headH: 0.25, snL: 0.24, snW: 0.14, ears: "rose", tail: "whip", tailL: 0.48, fluff: ["wiry", "shaggy"], pal: { c: "#9b9488" } },
    shiba: { name: "Shiba inu", s: 0.46, legH: 0.3, bodyL: 0.66, bodyW: 0.34, headW: 0.34, snL: 0.12, snW: 0.15, ears: "up", earS: 0.95, tail: "curl", tailW: 0.12, tongue: 1, marks: ["urajiro", "bib"], pal: { c: "#cf7a34", b: "#fbf0e0" } },
    akita: { name: "Akita", s: 0.76, bodyW: 0.42, bodyH: 0.34, legW: 0.12, headW: 0.41, headH: 0.32, snL: 0.13, snW: 0.2, ears: "up", earS: 0.85, tail: "curl", tailW: 0.17, fluff: ["ruff"], marks: ["urajiro", "bib"], pal: { c: "#c86f30", b: "#fbf2e4" } },
    samoyed: { name: "Samoyed", s: 0.66, headW: 0.33, snL: 0.13, snW: 0.15, ears: "up", earS: 0.85, tail: "curl", tailW: 0.17, tongue: 1, fluff: ["ruffBig", "pants", "feather", "fluffBody"], pal: { c: "#f8f6f2", f: "#ffffff", in: "#e8c8c0" } },
    wolfdog: { name: "Wolfdog", s: 0.78, legH: 0.5, legW: 0.1, bodyL: 0.86, headW: 0.32, snL: 0.2, snW: 0.15, ears: "up", earS: 1.0, tail: "sabre", tailL: 0.42, tailW: 0.12, fluff: ["ruff", "pants"], marks: ["wolfface", "sable"], pal: { c: "#8a8378", b: "#ddd6ca", eye: "#d6a03a", tip: "#3a3430" } },
    bordercollie: { name: "Border collie", s: 0.58, legH: 0.38, bodyL: 0.78, headW: 0.3, snL: 0.16, snW: 0.15, ears: "semi", tail: "plume", tailUp: -0.4, tongue: 1, fluff: ["ruff", "feather", "pants"], marks: ["bib", "socks", "blaze", "tailtip"], pal: { c: "#1c1917", b: "#f6f2ea" } },
    sheltie: { name: "Shetland sheepdog", s: 0.46, legH: 0.36, bodyL: 0.74, headW: 0.26, headH: 0.24, snL: 0.22, snW: 0.12, snH: 0.11, ears: "semi", earS: 0.85, tail: "plume", tailUp: -0.5, fluff: ["ruffBig", "pants", "feather"], marks: ["bib", "socks", "blaze", "tailtip"], pal: { c: "#c98a40", b: "#fbf6ee", f: "#d89a52" } },
    aussie: { name: "Australian shepherd", s: 0.6, bodyL: 0.76, headW: 0.32, snL: 0.15, snW: 0.16, ears: "fold", tail: "stub", tongue: 1, fluff: ["ruff", "pants", "feather"], marks: ["merle", "bib", "blaze", "socks"], pal: { c: "#9097a0", d: "#262628", b: "#f6f2ea", eye: "#4fa6e6" } },
    cavalier: { name: "Cavalier King Charles spaniel", s: 0.38, legH: 0.26, bodyL: 0.66, headW: 0.32, snL: 0.09, snW: 0.14, snH: 0.11, eye: 0.065, ears: "long", earS: 1.1, tail: "plume", fluff: ["feather", "belly"], marks: ["patches", "blaze"], pal: { c: "#f8f3ea", d: "#b2582a", ear: "#b2582a" } },
    cocker: { name: "Cocker spaniel", s: 0.44, legH: 0.3, bodyL: 0.7, headW: 0.3, headH: 0.3, snL: 0.13, snW: 0.15, ears: "long", earS: 1.2, tail: "otter", tailL: 0.18, tailUp: 0.4, tongue: 1, fluff: ["feather", "belly"], pal: { c: "#c88a4a" } },
    springer: { name: "Springer spaniel", s: 0.55, bodyL: 0.76, headW: 0.3, snL: 0.16, snW: 0.15, ears: "long", earS: 1.15, tail: "otter", tailL: 0.22, tailUp: 0.3, tongue: 1, fluff: ["feather", "belly"], marks: ["patches", "ticking", "liverhead"], pal: { c: "#f7f2ea", d: "#5a3220", ear: "#5a3220" } },
    jackrussell: { name: "Jack Russell", s: 0.36, legH: 0.3, bodyL: 0.62, bodyW: 0.3, headW: 0.3, snL: 0.13, snW: 0.14, ears: "fold", tail: "sickle", tailL: 0.24, tongue: 1, marks: ["patches"], pal: { c: "#f8f4ec", d: "#b9773a", ear: "#b9773a" } },
    yorkie: { name: "Yorkshire terrier", s: 0.24, legH: 0.22, legW: 0.08, bodyL: 0.56, headW: 0.27, snL: 0.1, snW: 0.12, ears: "up", earS: 0.8, tail: "sickle", tailL: 0.18, fluff: ["longcoat", "topknot", "bow"], pal: { c: "#c79a5a", f: "#55606c" } },
    boston: { name: "Boston terrier", s: 0.38, legH: 0.3, bodyL: 0.6, bodyW: 0.34, headW: 0.38, headH: 0.32, snL: 0.05, snW: 0.18, snH: 0.12, eye: 0.075, ears: "bat", earS: 1.05, tail: "stub", marks: ["bib", "blaze", "socks"], pal: { c: "#1c1918", b: "#f6f2ea" } },
    frenchie: { name: "French bulldog", s: 0.38, legH: 0.24, legW: 0.1, bodyW: 0.4, bodyL: 0.62, headW: 0.43, headH: 0.35, snL: 0.04, snW: 0.22, snH: 0.14, eye: 0.07, ears: "bat", earS: 1.3, tail: "stub", marks: ["mask", "wrinkles"], pal: { c: "#cfa877", mk: "#2c2420" } },
    bulldog: { name: "English bulldog", s: 0.5, legH: 0.24, legW: 0.14, bodyW: 0.5, bodyH: 0.34, bodyL: 0.72, headW: 0.48, headH: 0.36, snL: 0.05, snW: 0.3, snH: 0.16, ears: "rose", tail: "stub", tongue: 1, fluff: ["jowls"], marks: ["bib", "patches", "wrinkles"], pal: { c: "#f5efe4", d: "#c98a4a", ear: "#c98a4a" } },
    boxer: { name: "Boxer", s: 0.66, legH: 0.44, bodyL: 0.74, chestDrop: 0.08, loin: 0.7, headW: 0.34, headH: 0.32, snL: 0.06, snW: 0.22, snH: 0.15, ears: "fold", earS: 1.1, tail: "stub", tongue: 1, fluff: ["jowls"], marks: ["mask", "bib", "socks", "wrinkles"], pal: { c: "#c4813f" } },
    maltese: { name: "Maltese", s: 0.26, legH: 0.2, legW: 0.08, bodyL: 0.56, headW: 0.3, snL: 0.08, snW: 0.12, ears: "long", tail: "curl", tailW: 0.12, fluff: ["longcoat", "topknot", "bow"], pal: { c: "#fbf9f4", f: "#ffffff" } },
    bichon: { name: "Bichon frise", s: 0.32, legH: 0.26, legW: 0.1, bodyW: 0.38, bodyH: 0.34, headW: 0.34, headH: 0.3, snL: 0.07, snW: 0.12, ears: "none", tail: "curl", tailW: 0.15, tongue: 1, fluff: ["fluffBody", "topfluff", "shaggy"], pal: { c: "#fbf9f4", f: "#ffffff" } },
    pekingese: { name: "Pekingese", s: 0.3, legH: 0.14, legW: 0.1, bodyW: 0.4, bodyL: 0.62, headW: 0.38, headH: 0.32, snL: 0.03, snW: 0.16, snH: 0.1, eye: 0.065, ears: "long", tail: "curl", tailW: 0.15, fluff: ["longcoat", "ruffBig"], marks: ["mask"], pal: { c: "#d39a5a", f: "#dca868" } },
    papillon: { name: "Papillon", s: 0.26, legH: 0.28, legW: 0.06, bodyL: 0.56, headW: 0.28, snL: 0.1, snW: 0.1, ears: "butterfly", earS: 1.5, tail: "curl", tailW: 0.13, fluff: ["feather"], marks: ["blaze", "patches"], pal: { c: "#f8f4ec", d: "#9a5a2a", ear: "#9a5a2a", hd: "#9a5a2a", f: "#fbf8f2" } },
    spitz: { name: "Spitz", s: 0.44, legH: 0.3, headW: 0.32, snL: 0.12, snW: 0.13, ears: "up", earS: 0.8, tail: "curl", tailW: 0.17, fluff: ["ruffBig", "pants", "fluffBody"], pal: { c: "#f6f3ee", f: "#fdfcf8" } },
    chow: { name: "Chow chow", s: 0.62, legH: 0.32, legW: 0.13, bodyW: 0.44, bodyH: 0.36, headW: 0.42, headH: 0.34, snL: 0.1, snW: 0.2, snH: 0.14, ears: "up", earS: 0.6, tail: "curl", tailW: 0.17, tongue: 1, fluff: ["ruffBig", "fluffBody", "pants"], pal: { c: "#c7773a", f: "#d4864a", p: "#3a2a5a" } },
    leonberger: { name: "Leonberger", s: 0.94, bodyW: 0.42, bodyH: 0.35, legW: 0.13, headW: 0.4, snL: 0.14, snW: 0.2, ears: "drop", tail: "plume", tailUp: -0.4, tailL: 0.42, tongue: 1, fluff: ["ruffBig", "feather", "pants", "belly"], marks: ["mask"], pal: { c: "#c28a46", f: "#cc9652" } },
    airedale: { name: "Airedale terrier", s: 0.62, legH: 0.44, headW: 0.26, headH: 0.26, headD: 0.32, snL: 0.22, snW: 0.16, ears: "fold", tail: "sickle", tailL: 0.24, fluff: ["wiry"], marks: ["saddle"], pal: { c: "#b9773a", d: "#231d19" } },
    scottie: { name: "Scottish terrier", s: 0.36, legH: 0.2, legW: 0.09, bodyL: 0.7, bodyW: 0.32, headW: 0.26, headD: 0.34, snL: 0.2, snW: 0.14, ears: "up", earS: 0.75, tail: "sickle", tailL: 0.22, fluff: ["wiry", "skirt"], pal: { c: "#1d1a19", f: "#2a2625" } },
    westie: { name: "West Highland terrier", s: 0.36, legH: 0.24, bodyL: 0.62, headW: 0.34, headH: 0.32, snL: 0.1, snW: 0.13, ears: "up", earS: 0.7, tail: "sickle", tailL: 0.2, tongue: 1, fluff: ["wiry", "topfluff", "skirt"], pal: { c: "#fbf9f4", f: "#ffffff" } },
    norwich: { name: "Norwich terrier", s: 0.3, legH: 0.22, bodyL: 0.62, headW: 0.3, snL: 0.11, snW: 0.13, ears: "up", earS: 0.75, tail: "stub", tailUp: 1.2, tongue: 1, fluff: ["wiry", "ruff"], pal: { c: "#c47a3a", f: "#cf8a4a" } },
    otterhound: { name: "Otterhound", s: 0.72, bodyW: 0.38, headW: 0.33, snL: 0.18, snW: 0.18, ears: "long", earS: 1.1, tail: "sabre", tailL: 0.38, fluff: ["shaggy", "wiry"], pal: { c: "#a08a70", f: "#ad9880", ear: "#6a5644" } },
    bloodhound: { name: "Bloodhound", s: 0.78, bodyL: 0.86, headW: 0.3, headH: 0.32, headD: 0.34, snL: 0.2, snW: 0.2, snH: 0.17, ears: "long", earS: 1.45, tail: "sickle", tailL: 0.4, fluff: ["jowls"], marks: ["saddle", "wrinkles"], pal: { c: "#a2582a", d: "#2a1e18", ear: "#8a4a22" } },
    coonhound: { name: "Coonhound", s: 0.66, legH: 0.44, headW: 0.29, snL: 0.18, snW: 0.17, ears: "long", earS: 1.25, tail: "sickle", tailL: 0.38, fluff: ["jowls"], pal: { c: "#9a3e1c", ear: "#863418" } },
    pointer: { name: "German shorthaired pointer", s: 0.64, legH: 0.46, bodyL: 0.78, chestDrop: 0.08, loin: 0.7, headW: 0.28, snL: 0.2, snW: 0.14, ears: "drop", tail: "whip", tailL: 0.22, tailUp: 0.4, tongue: 1, marks: ["ticking", "patches", "liverhead"], pal: { c: "#e8e2d8", d: "#5a3222", ear: "#5a3222" } },
    vizsla: { name: "Vizsla", s: 0.62, legH: 0.46, bodyL: 0.78, chestDrop: 0.08, loin: 0.7, headW: 0.27, snL: 0.2, snW: 0.14, ears: "drop", earS: 1.1, tail: "whip", tailL: 0.34, tongue: 1, pal: { c: "#b9652e", n: "#8a4a34", ear: "#a85a28" } },
    setter: { name: "Irish setter", s: 0.66, legH: 0.44, bodyL: 0.8, headW: 0.26, headD: 0.32, snL: 0.2, snW: 0.14, ears: "long", earS: 1.1, tail: "plume", tailL: 0.42, tongue: 1, fluff: ["feather", "belly", "pants"], pal: { c: "#9a3a18", f: "#a8441f" } },
    heeler: { name: "Australian cattle dog", s: 0.52, legH: 0.34, bodyW: 0.36, headW: 0.34, snL: 0.14, snW: 0.18, ears: "up", earS: 1.0, tail: "sabre", tongue: 1, marks: ["ticking", "tanpoints", "mask"], pal: { c: "#6f7f92", d: "#23262c", t: "#b5652c", mk: "#23262c" } },
    griffon: { name: "Brussels griffon", s: 0.26, legH: 0.22, bodyL: 0.56, headW: 0.36, headH: 0.32, snL: 0.03, snW: 0.16, snH: 0.1, eye: 0.072, ears: "semi", earS: 0.7, tail: "stub", tailUp: 1.2, fluff: ["wiry"], pal: { c: "#a85a2a", f: "#8a4a22" } },
    mutt: { name: "Mixed breed", s: 0.56, legH: 0.38, headW: 0.31, snL: 0.15, snW: 0.16, ears: "semi", tail: "sickle", tailL: 0.3, tongue: 1, marks: ["bib", "socks"], pal: { c: "#b8875a", b: "#f2e2c8" } },
  };

  const DEF = { s: 0.6, legH: 0.4, legW: 0.1, legD: 0, bodyW: 0.34, bodyH: 0.3, bodyL: 0.8, chestDrop: 0.03, loin: 0.88, neck: 0.1, headW: 0.32, headH: 0.28, headD: 0.28, headUp: 0.07,
    snL: 0.15, snW: 0.18, snH: 0.13, snY: -0.07, eye: 0.055, ears: "drop", earS: 1, tail: "otter", tailL: 0.32, tailW: 0.08, tailUp: 0, tongue: 0, marks: [], fluff: [] };
  const BASEPAL = { n: "#15110f", in: "#b9867e", p: "#e5707e", mk: "#1f1a17", b: "#f5f1ea" };

  /* ---------- look words: breed first, colour second ---------- */
  function applyLook(spec, look) {
    const w = " " + (look || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ") + " ";
    const pal = Object.assign({}, BASEPAL, spec.pal), marks = spec.marks.slice(), fluff = spec.fluff.slice(); let s = spec.s;
    const has = (x) => w.includes(" " + x + " ");
    const found = []; // colours in the order they're written
    Object.keys(NAMED).sort((a, b) => b.length - a.length).forEach((k) => { const i = w.indexOf(" " + k + " "); if (i >= 0 && !found.some((f) => f.k.includes(k))) found.push({ k, i }); });
    found.sort((a, b) => a.i - b.i);
    const cols = found.map((f) => NAMED[f.k]);
    if (cols.length) {
      const c = cols[0], dark = shade(c, -0.25), solid = c === NAMED.black || c === NAMED.white;
      pal.c = c; pal.f = shade(c, c === NAMED.black ? 0.08 : 0.06); pal.hd = c; pal.ear = solid ? c : shade(c, -0.12); pal.mz = c; pal.tip = c;
      if (solid) { pal.d = c; pal.sock = c; ["saddle", "sable", "brindle", "merle", "patches", "spots", "ticking", "liverhead"].forEach((m) => { const i = marks.indexOf(m); if (i >= 0) marks.splice(i, 1); }); }
      else if (!["spots", "patches", "ticking", "merle", "saddle"].some((m) => marks.includes(m))) pal.d = dark;
      if (c === NAMED.white) { pal.b = c; pal.t = NAMED.cream; ["tanpoints", "mask"].forEach((m) => { const i = marks.indexOf(m); if (i >= 0) marks.splice(i, 1); }); }
      if (c === NAMED.black && !marks.includes("tanpoints")) { pal.b = shade(c, 0.12); ["bib", "socks", "blaze", "huskyface", "urajiro", "tailtip", "wolfface"].forEach((m) => { const i = marks.indexOf(m); if (i >= 0) marks.splice(i, 1); }); }
      const c2 = cols[1];
      if (c2) { // "black and white", "black and tan", "white with brown spots"...
        if (c2 === NAMED.white || c2 === NAMED.cream) { pal.b = c2; ["bib", "socks", "blaze"].forEach((m) => marks.includes(m) || marks.push(m)); }
        else if (c === NAMED.white) { pal.d = c2; pal.ear = c2; if (!marks.some((m) => ["spots", "patches"].includes(m))) marks.push(has("spotted") || has("spots") ? "spots" : "patches"); }
        else { pal.t = c2; marks.includes("tanpoints") || marks.push("tanpoints"); }
        if (cols[2]) { pal.t = cols[2]; marks.includes("tanpoints") || marks.push("tanpoints"); }
      }
    }
    if (has("dapple") || has("merle")) { marks.push("merle"); pal.d = shade(pal.c, -0.45); }
    if (has("brindle")) marks.push("brindle");
    if (has("sable")) marks.push("sable");
    if ((has("spotted") || has("spots")) && !marks.includes("spots") && !marks.includes("patches")) { marks.push("spots"); if (!cols[1]) pal.d = shade(pal.c, -0.5); }
    if (has("blue nose") || has("blue")) pal.n = "#4a4e56";
    if (has("red nose") || has("redbone")) pal.n = "#7a3a2a";
    if (has("long haired") || has("long hair") || has("fluffy")) fluff.push("feather", "ruff", "belly");
    if (has("mini") || has("miniature") || has("toy") || has("tiny") || has("little") || has("baby") || has("puppy")) s *= 0.78;
    if (has("big") || has("giant") || has("xxl") || has("xl")) s *= 1.15;
    return { pal, marks, fluff, s };
  }

  /* ---------- building a rig ---------- */
  const CACHE = new Map();
  function rig(id, look) {
    const key = id + "|" + (look || ""); if (CACHE.has(key)) return CACHE.get(key);
    const spec = Object.assign({}, DEF, B[id] || B.mutt); const L = applyLook(spec, look); const pal = L.pal, M = new Set(L.marks), F = new Set(L.fluff);
    const col = (k) => pal[k] || ({ hd: pal.c, mz: pal.c, ear: pal.c, f: pal.c, sock: pal.c, d: shade(pal.c, -0.25), t: "#b8743a", tip: pal.c, eye: pal.n, sd: shade(pal.c, -0.3) })[k] || k;
    const parts = []; const r = mulberry(hash(id));
    const P = (bone, x, y, z, w, h, d, c, o) => { o = o || {}; parts.push({ bone, x, y, z, w, h, d, c: c[0] === "#" ? c : col(c), rx: o.rx || 0, ry: o.ry || 0, rz: o.rz || 0, core: !!o.core, collar: !!o.collar }); };
    // geometry
    const lh = spec.legH, lw = spec.legW, ld = spec.legD || lw * 1.1, bw = spec.bodyW, bh = spec.bodyH, bl = spec.bodyL;
    const bot = lh - 0.04, cy = bot + bh / 2, top = cy + bh / 2, zf = bl / 2, zr = -bl / 2, cd = spec.chestDrop;
    const hw = spec.headW, hh = spec.headH, hdp = spec.headD, hu = spec.headUp, hz = 0.08, front = hz + hdp / 2, htop = hu + hh / 2, side = hw / 2;
    const sl = spec.snL, sw = spec.snW, sh = spec.snH, sy = hu + spec.snY;
    const legX = Math.max(0.07, bw * 0.34), legZf = zf - Math.min(0.12, bl * 0.14), legZr = zr + Math.min(0.13, bl * 0.15);
    const pivots = [[0, 0, 0], [0, top + spec.neck * 0.85 + 0.02, zf + 0.02], [0, top - 0.05, zr + 0.03], [-legX, lh, legZf], [legX, lh, legZf], [-legX, lh, legZr], [legX, lh, legZr]];
    // body: deep chest at the front, a narrower loin at the back, a pale belly
    const hasBody = (k) => k;
    P(0, 0, cy - cd / 2, zf - 0.29 * bl, bw, bh + cd, 0.58 * bl, "c", { core: 1 });
    P(0, 0, top - (bh * spec.loin) / 2, zr + 0.25 * bl, bw * 0.94, bh * spec.loin, 0.5 * bl, "c", { core: 1 });
    P(0, 0, bot - cd + 0.012, zf - 0.32 * bl, bw * 0.7, 0.026, 0.42 * bl, "b");
    P(0, 0, top - 0.02, zr + 0.06, bw * 0.98, 0.1, 0.16, "c"); // rump
    // neck and collar
    const nk = spec.neck, nW = Math.min(bw * 0.8, hw * 0.66), nC = [0, top + nk * 0.35 - 0.01, zf - 0.07];
    P(0, nC[0], nC[1], nC[2], nW, bh * 0.45 + nk + 0.06, 0.17, "c", { rx: 0.3, core: 1 });
    const coll = { y: top + nk * 0.5 + 0.02, z: zf - 0.04, w: nW + 0.04, rx: 0.3 };
    P(0, 0, coll.y, coll.z, coll.w, 0.06, 0.21, "#c5242b", { rx: 0.3, core: 1, collar: 1 });
    // head (bone 1, local to the neck pivot)
    P(1, 0, hu, hz, hw, hh, hdp, "hd", { core: 1 });
    P(1, 0, sy, front + sl / 2 - 0.01, sw, sh, sl, "mz", { core: 1 });
    P(1, 0, sy + sh / 2 - 0.022, front + sl - 0.004, Math.max(0.06, sw * 0.45), 0.048, 0.034, "n");
    P(1, 0, sy - sh / 2 + 0.012, front + sl * 0.45, sw * 0.86, 0.024, sl * 0.8, "mz"); // chin
    if (spec.tongue) P(1, 0, sy - sh / 2 - 0.004, front + sl - 0.035, 0.06, 0.018, 0.07, "p");
    const ex = hw * 0.26, eY = hu + 0.045, E = spec.eye;
    // markings that sit under the eyes go first
    if (M.has("mask")) { P(1, 0, sy, front + sl / 2 - 0.006, sw + 0.006, sh + 0.006, sl + 0.002, "mk"); [-1, 1].forEach((sg) => P(1, sg * ex, eY, front + 0.002, E * 2, E * 1.7, 0.012, "mk")); }
    if (M.has("blaze")) { P(1, 0, hu + 0.05, front + 0.003, 0.055, hh * 0.78, 0.012, "b"); P(1, 0, sy + 0.005, front + sl / 2 - 0.006, sw * 0.5, sh + 0.008, sl + 0.002, "b"); }
    if (M.has("huskyface") || M.has("urajiro") || M.has("wolfface")) {
      const lc = M.has("wolfface") ? "b" : "b";
      P(1, 0, hu - 0.045, front + 0.003, hw * 0.92, hh * 0.42, 0.012, lc); P(1, 0, sy, front + sl / 2 - 0.006, sw + 0.006, sh + 0.006, sl + 0.002, lc);
      [-1, 1].forEach((sg) => { P(1, sg * (side + 0.004), hu - 0.05, hz + 0.05, 0.012, hh * 0.42, hdp * 0.55, lc); P(1, sg * ex, hu + 0.11, front + 0.004, 0.05, 0.028, 0.012, lc); });
      if (M.has("huskyface")) P(1, 0, hu + 0.07, front + 0.005, 0.045, 0.1, 0.012, "c"); // dark stripe between the eyes
    }
    if (M.has("tanpoints")) {
      [-1, 1].forEach((sg) => P(1, sg * ex, hu + 0.105, front + 0.004, 0.055, 0.03, 0.014, "t"));
      P(1, 0, sy - sh * 0.18, front + sl / 2 - 0.006, sw + 0.006, sh * 0.66, sl + 0.002, "t");
      [-1, 1].forEach((sg) => P(0, sg * bw * 0.2, cy + 0.03, zf + 0.004, 0.08, 0.09, 0.016, "t"));
    }
    if (M.has("liverhead")) { pal.hd = col("d"); parts.forEach((p) => { if (p.bone === 1 && p.c === pal.c) p.c = col("d"); }); }
    if (M.has("wrinkles")) [0, 1].forEach((k) => P(1, 0, htop - 0.05 - k * 0.04, front + 0.004, hw * (0.5 - k * 0.12), 0.014, 0.012, shade(col("hd"), -0.3)));
    // eyes with a glint
    [-1, 1].forEach((sg) => { P(1, sg * ex, eY, front + 0.004, E, E, 0.02, "eye"); P(1, sg * ex + sg * E * 0.22, eY + E * 0.24, front + 0.014, E * 0.36, E * 0.36, 0.01, "#ffffff"); });
    // ears
    const es = spec.earS, ear = spec.ears;
    [-1, 1].forEach((sg) => {
      if (ear === "drop") P(1, sg * (side + 0.022), hu - 0.02 - (es - 1) * 0.07, hz - 0.02, 0.045, hh * 0.82 * es, 0.15 * Math.min(1.2, es), "ear", { rz: sg * 0.12, core: 1 });
      else if (ear === "long") { P(1, sg * (side + 0.026), hu - 0.08 * es, hz, 0.055, 0.32 * es, 0.16, "ear", { rz: sg * 0.07, core: 1 }); P(1, sg * (side + 0.03), hu - 0.08 * es - 0.15 * es, hz, 0.075, 0.08, 0.19, "ear"); }
      else if (ear === "up" || ear === "semi" || ear === "butterfly" || ear === "bat") {
        const big = ear === "bat" ? 1.25 : 1, x = sg * side * (ear === "bat" ? 0.66 : 0.6), rz = -sg * (ear === "butterfly" ? 0.45 : 0.15);
        P(1, x, htop + 0.04 * es, hz - 0.035, 0.12 * es * big, 0.09 * es, 0.055, "ear", { rz, core: 1 });
        P(1, x + sg * 0.008 * es, htop + 0.105 * es, hz - 0.035, 0.075 * es * big, 0.05 * es, 0.05, "ear", { rz });
        P(1, x + sg * 0.014 * es, htop + 0.145 * es, hz - 0.035, 0.035 * es * big, 0.035 * es, 0.045, "ear", { rz });
        P(1, x, htop + 0.05 * es, hz - 0.005, 0.06 * es * big, 0.05 * es, 0.008, "in", { rz });
        if (ear === "semi") P(1, x, htop + 0.12 * es, hz - 0.0, 0.06 * es, 0.035, 0.06, "ear", { rx: 0.9, rz });
        if (ear === "butterfly") P(1, x + sg * 0.07 * es, htop + 0.07 * es, hz - 0.03, 0.05, 0.13 * es, 0.04, "f", { rz });
      } else if (ear === "rose") P(1, sg * side * 0.72, htop + 0.005, hz - 0.06, 0.09 * es, 0.045, 0.1 * es, "ear", { rz: -sg * 0.5, rx: -0.3, core: 1 });
      else if (ear === "fold") { P(1, sg * side * 0.62, htop, hz + 0.02, 0.1 * es, 0.04, 0.1 * es, "ear", { core: 1 }); P(1, sg * side * 0.66, htop - 0.045 * es, hz + 0.075, 0.09 * es, 0.07 * es, 0.025, "ear"); }
    });
    // legs (bones 3..6, local to the hip): upper, lower, paw; thighs on the back legs
    const socks = M.has("socks") ? "b" : M.has("tanpoints") ? "t" : "sock";
    for (let b = 3; b <= 6; b++) {
      const rear = b >= 5, lw2 = F.has("shaggy") ? lw * 1.25 : lw, wiry = F.has("wiry") ? 1.25 : 1;
      P(b, 0, -lh * 0.3 + 0.03, 0, lw2, lh * 0.6 + 0.06, ld, "c", { core: 1 });
      P(b, 0, -lh * 0.8, 0, lw2 * 0.92 * wiry, lh * 0.4, ld * 0.92 * wiry, socks);
      P(b, 0, -lh + 0.025, 0.015, lw2 * 1.12 * wiry, 0.05, ld * 1.35, socks);
      if (rear) P(b, 0, -lh * 0.1, -0.012, lw2 * 1.35, lh * 0.42, ld * 1.55, "c");
      if (F.has("feather") && !rear) P(b, 0, -lh * 0.45, -ld * 0.62, lw * 0.85, lh * 0.5, 0.05, "f");
      if ((F.has("pants") || F.has("feather")) && rear) P(b, 0, -lh * 0.28, -ld * 0.75, lw * 1.4, lh * 0.45, ld * 0.9, "f");
      if (F.has("poodle")) P(b, 0, -lh * 0.8, 0, lw * 2, lh * 0.24, ld * 2, "f");
    }
    // tail (bone 2): a chain of segments, angle 0 = straight back, + up
    const tl = spec.tailL, tw = spec.tailW, tailCol = M.has("saddle") && spec.tail === "sabre" ? "d" : "c";
    const chain = (segs) => { let y = 0, z = 0; segs.forEach(([a, len, w, c], i) => { const dy = Math.sin(a), dz = -Math.cos(a); P(2, 0, y + (dy * len) / 2, z + (dz * len) / 2, w, w, len + w * 0.3, i === segs.length - 1 && (M.has("tailtip") || pal.tip !== pal.c) ? (M.has("tailtip") ? "b" : "tip") : c || tailCol, { rx: a, core: i === 0 }); if (F.has("feather") || spec.tail === "plume") { if (a < 0.6) P(2, 0, y + (dy * len) / 2 - w * 0.75, z + (dz * len) / 2, w * 0.7, w * 1.2, len * 0.9, "f", { rx: a }); } y += dy * len; z += dz * len; }); return [y, z]; };
    const u = spec.tailUp, tt = spec.tail;
    if (tt === "otter") chain([[-0.25 + u, tl * 0.55, tw * 1.2], [-0.45 + u, tl * 0.45, tw * 0.8]]);
    else if (tt === "plume") chain([[-0.15 + u, tl * 0.5, tw], [-0.35 + u, tl * 0.5, tw * 0.85]]);
    else if (tt === "sabre") chain([[-0.75 + u, tl * 0.5, tw * 1.1], [-1.05 + u, tl * 0.5, tw * 1.35]]);
    else if (tt === "whip") chain([[-0.9 + u, tl * 0.5, tw * 0.7], [-0.55 + u, tl * 0.5, tw * 0.55]]);
    else if (tt === "sickle") chain([[0.9 + u, tl * 0.55, tw * 0.85], [1.4 + u, tl * 0.45, tw * 0.7]]);
    else if (tt === "curl") chain([[1.2, tl * 0.35, tw], [2.1, tl * 0.35, tw], [2.8, tl * 0.3, tw * 0.9]]);
    else if (tt === "curlTight") chain([[1.4, 0.07, 0.085], [2.4, 0.07, 0.08], [3.2, 0.05, 0.07]]);
    else if (tt === "stub") chain([[0.5 + u, 0.07, 0.085]]);
    else if (tt === "pom") { const [y, z] = chain([[0.9, tl * 0.45, 0.045]]); P(2, 0, y, z, 0.14, 0.14, 0.14, "f"); }
    // body markings
    const onBody = (n, size, colour, seed, minY) => { const rr = mulberry(seed); for (let i = 0; i < n; i++) { const sideHit = rr() < 0.75, s = size * (0.7 + rr() * 0.6), z = zr + 0.08 + rr() * (bl - 0.16); if (sideHit) { const sg = rr() < 0.5 ? -1 : 1, y = (minY || bot + 0.04) + rr() * (top - (minY || bot + 0.04) - 0.02); P(0, sg * (bw / 2 + 0.003), y, z, 0.012, s, s * 1.2, colour); } else P(0, (rr() - 0.5) * bw * 0.7, top + 0.004, z, s, 0.012, s * 1.2, colour); } };
    if (M.has("saddle")) { P(0, 0, top - 0.055, -0.04 * bl, bw + 0.014, 0.12, 0.74 * bl, "d"); P(0, 0, top + nk * 0.2, zf - 0.12, nW * 0.9, 0.08, 0.16, "d"); }
    if (M.has("sable")) P(0, 0, top - 0.03, 0, bw + 0.01, 0.07, bl * 0.86, "sd");
    if (M.has("bib")) { P(0, 0, cy - 0.02 - cd / 2, zf + 0.004, bw * 0.6, bh * 0.82 + cd, 0.02, "b"); P(0, 0, nC[1] - 0.02, zf + 0.055, nW * 0.62, bh * 0.45 + nk * 0.5, 0.03, "b", { rx: 0.4 }); }
    if (M.has("spots")) { onBody(26, 0.065, "d", 7); const rr = mulberry(3); for (let i = 0; i < 10; i++) { const b = 3 + (i % 4); P(b, (rr() < 0.5 ? -1 : 1) * (lw / 2 + 0.003), -lh * (0.15 + rr() * 0.6), 0, 0.012, 0.05, 0.05, "d"); } [-1, 1].forEach((sg) => P(1, sg * (side + 0.004), hu + 0.05, hz, 0.012, 0.05, 0.06, "d")); P(1, 0.05, htop + 0.004, hz, 0.06, 0.012, 0.05, "d"); }
    if (M.has("ticking")) onBody(34, 0.035, "d", 11);
    if (M.has("patches")) { [-1, 1].forEach((sg, i) => { P(0, sg * (bw / 2 + 0.004), cy + 0.02, (i ? -0.12 : 0.06) * bl, 0.014, bh * 0.7, bl * 0.34, "d"); }); P(0, 0, top + 0.005, -0.05 * bl, bw * 0.75, 0.014, bl * 0.4, "d"); if (!M.has("liverhead")) P(1, 0.07, hu + 0.04, front + 0.003, hw * 0.4, hh * 0.55, 0.012, "d"); }
    if (M.has("merle")) onBody(14, 0.1, "d", 5, cy - 0.02);
    if (M.has("brindle")) [-1, 1].forEach((sg) => { for (let k = 0; k < 6; k++) P(0, sg * (bw / 2 + 0.003), cy + (k % 2) * 0.02, zr + 0.12 + k * (bl - 0.24) / 5, 0.012, bh * 0.6, 0.02, shade(col("c"), -0.22), { rx: 0.25 }); });
    // fur
    if (F.has("ruff")) P(0, 0, top - 0.01, zf - 0.04, hw * 1.02 + 0.06, bh * 0.72 + nk, 0.3, "f", { rx: 0.35 });
    if (F.has("ruffBig")) P(0, 0, top, zf - 0.05, hw * 1.25 + 0.1, bh + nk, 0.38, "f", { rx: 0.35 });
    if (F.has("fluffBody")) { P(0, 0, cy - cd / 2, zf - 0.29 * bl, bw + 0.08, bh + cd + 0.06, 0.6 * bl, "f"); P(0, 0, top - (bh * spec.loin) / 2, zr + 0.25 * bl, bw + 0.06, bh * spec.loin + 0.05, 0.52 * bl, "f"); }
    if (F.has("belly")) P(0, 0, bot - cd * 0.5 - 0.035, 0, bw * 0.8, 0.07, bl * 0.6, "f");
    if (F.has("shaggy")) { P(0, 0, cy, 0, bw + 0.05, bh + 0.04, bl * 0.92, "f"); P(1, 0, hu + 0.025, hz - 0.03, hw + 0.06, hh + 0.04, hdp + 0.02, "f"); }
    if (F.has("longcoat")) { P(0, 0, cy + 0.01, 0, bw + 0.05, bh + 0.03, bl * 0.96, "f"); [-1, 1].forEach((sg) => { P(0, sg * (bw / 2 + 0.01), bot * 0.5 + 0.03, zf * 0.45, 0.04, bot - 0.02, bl * 0.34, "f"); P(0, sg * (bw / 2 + 0.01), bot * 0.5 + 0.03, zr * 0.45, 0.04, bot - 0.02, bl * 0.34, "f"); }); P(1, 0, sy - sh / 2 - 0.04, front + sl * 0.4, sw + 0.06, 0.1, sl + 0.05, "hd"); }
    if (F.has("topknot")) P(1, 0, htop + 0.045, hz - 0.02, hw * 0.42, 0.09, 0.12, "f");
    if (F.has("bow")) { P(1, -0.035, htop + 0.1, hz - 0.02, 0.06, 0.05, 0.03, "#ff5fa0"); P(1, 0.035, htop + 0.1, hz - 0.02, 0.06, 0.05, 0.03, "#ff5fa0"); P(1, 0, htop + 0.1, hz - 0.015, 0.025, 0.03, 0.035, "#e03a7e"); }
    if (F.has("wiry")) { P(1, 0, sy - sh / 2 - 0.03, front + sl * 0.62, sw * 0.95, 0.075, sl * 0.8, "f"); [-1, 1].forEach((sg) => P(1, sg * hw * 0.22, hu + 0.088, front + 0.02, 0.1, 0.032, 0.07, "f", { rz: sg * 0.15 })); }
    if (F.has("skirt")) [-1, 1].forEach((sg) => P(0, sg * (bw / 2 + 0.015), bot - 0.02, 0, 0.04, 0.11, bl * 0.8, "f"));
    if (F.has("topfluff")) P(1, 0, hu + 0.05, hz - 0.045, hw + 0.12, hh + 0.12, hdp + 0.04, "f");
    if (F.has("poodle")) { P(1, 0, htop + 0.05, hz - 0.01, hw * 1.15, 0.16, hdp, "f"); P(0, 0, cy + 0.02, zf - 0.22 * bl, bw + 0.14, bh + 0.14, 0.5 * bl, "f"); [-1, 1].forEach((sg) => P(0, sg * bw * 0.32, top - 0.04, zr + 0.1, 0.17, 0.17, 0.18, "f")); }
    if (F.has("jowls")) [-1, 1].forEach((sg) => P(1, sg * (sw / 2 - 0.01), sy - sh / 2 - 0.02, front + sl * 0.55, 0.06, 0.07, Math.max(0.08, sl * 0.8), "mz"));
    // matrices
    const geo = parts.map((p) => { const m = new T.Matrix4().compose(new T.Vector3(p.x, p.y, p.z), new T.Quaternion().setFromEuler(new T.Euler(p.rx, p.ry, p.rz)), new T.Vector3(p.w, p.h, p.d)); return { bone: p.bone, m, c: p.c, core: p.core, collar: p.collar }; });
    const out = { id, look: look || "", name: spec.name, s: L.s, parts: geo, pivots: pivots.map((v) => new T.Vector3(...v)), legH: lh,
      anchor: { collar: coll, medal: [0, coll.y - 0.075, coll.z + 0.14], hat: { y: htop, z: hz, w: hw }, tag: pivots[1][1] + htop + 0.05 } };
    out.collarIdx = geo.findIndex((p) => p.collar);
    CACHE.set(key, out); return out;
  }

  /* ---------- posing ---------- */
  const mA = new T.Matrix4(), mB = new T.Matrix4();
  function pose(rg, o, out) {
    const lh = rg.legH, drop = o.drop || 0, sit = o.sit || 0, run = o.run || 0, sw = Math.sin(o.ph || 0) * run;
    const D = drop * lh * 0.7;
    out[0].makeTranslation(0, -D, 0);
    for (let b = 1; b <= 6; b++) {
      const p = rg.pivots[b]; out[b].makeTranslation(p.x, p.y, p.z);
      if (b === 1) { out[b].multiply(mA.makeRotationY(o.look || 0)); if (drop) out[b].multiply(mA.makeRotationX(0.15 * drop)); }
      else if (b === 2) out[b].multiply(mA.makeRotationY(o.wag || 0));
      else {
        const rear = b >= 5, sgn = b === 3 || b === 6 ? 1 : -1;
        let sy = 1, rx = sw * 0.5 * sgn;
        if (drop) { sy = 1 - 0.7 * drop; rx = (rear ? 0.2 : -0.2) * drop; }
        else if (sit && rear) sy = 1 - 0.35 * sit;
        out[b].multiply(mA.makeRotationX(rx)); if (sy !== 1) out[b].multiply(mA.makeScale(1, sy, 1));
      }
      out[b].premultiply(out[0]);
    }
    return out;
  }

  /* ---------- a real mesh group (previews, videos) ---------- */
  const GEO = new T.BoxGeometry(1, 1, 1), MATS = {};
  const mat = (c) => MATS[c] || (MATS[c] = new T.MeshLambertMaterial({ color: c }));
  function group(rg) {
    const g = new T.Group(), inner = new T.Group(); inner.scale.setScalar(0.9 * (0.55 + rg.s * 0.8)); g.add(inner);
    const bones = []; for (let b = 0; b < 7; b++) { const o = new T.Object3D(); o.matrixAutoUpdate = false; inner.add(o); bones.push(o); }
    rg.parts.forEach((p) => { const m = new T.Mesh(GEO, mat(p.c)); m.matrixAutoUpdate = false; m.matrix.copy(p.m); m.castShadow = true; bones[p.bone].add(m); });
    const mats = bones.map(() => new T.Matrix4());
    g.update = (o) => { pose(rg, o, mats); bones.forEach((b, i) => { b.matrix.copy(mats[i]); b.matrixWorldNeedsUpdate = true; }); };
    g.update({}); g.rig = rg; return g;
  }

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const NAMES = Object.keys(B), LABEL = {}; NAMES.forEach((k) => (LABEL[k] = B[k].name));
  window.LPB = { NAMES, LABEL, rig, pose, group, shade, scaleOf: (rg) => 0.9 * (0.55 + rg.s * 0.8) };
})();
