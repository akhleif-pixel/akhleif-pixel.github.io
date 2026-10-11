// 3D walk-through of the exhibition, rebuilt from the installation photos:
// a black wall and a white wall meeting at a wide angle, framed works on the
// walls, three works on the floor, the fence underfoot and the red thread.
// Sizes and positions were measured off "Exhibition Photo 2".
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const PIECES = window.PIECES;
const SIDES = window.EXHIBITION.sides;

// ---- booth dimensions (metres) ----
// The 50 cm Dichotomy photographs give the scale: each wall is about 1.7 m wide
// and 2.4 m tall, and the walls open to roughly 140 degrees.
const ANGLE = THREE.MathUtils.degToRad(70); // each wall's angle away from the centre line
const WALL_W = 1.7, WALL_H = 2.4;
const DIR = { left: new THREE.Vector3(-Math.sin(ANGLE), 0, Math.cos(ANGLE)), right: new THREE.Vector3(Math.sin(ANGLE), 0, Math.cos(ANGLE)) };
const NORMAL = { left: new THREE.Vector3(Math.cos(ANGLE), 0, Math.sin(ANGLE)), right: new THREE.Vector3(-Math.cos(ANGLE), 0, Math.sin(ANGLE)) };
const ROT_Y = { left: Math.PI / 2 - ANGLE, right: -(Math.PI / 2 - ANGLE) };

// A point on a wall: s = distance from the corner, y = height, off = distance out from the wall.
const onWall = (side, s, y, off = 0) =>
  DIR[side].clone().multiplyScalar(s).addScaledVector(NORMAL[side], off).setY(y);

const OVERVIEW = { pos: new THREE.Vector3(0, 1.55, 5.0), target: new THREE.Vector3(0, 1.15, 0.45) };

export async function createTour({ pieceInfo, img, esc, zoom, photosOf }) {
  const stage = document.getElementById("tourStage");
  const canvas = document.getElementById("tourCanvas");
  const spotsEl = document.getElementById("tourSpots");
  const panel = document.getElementById("tourPanel");
  const hint = document.getElementById("tourHint");
  const loading = document.getElementById("tourLoading");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x868e96);
  scene.fog = new THREE.Fog(0x868e96, 9, 24);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 60);
  camera.position.copy(OVERVIEW.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(OVERVIEW.target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.35;
  controls.maxDistance = 7.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minAzimuthAngle = -0.8;
  controls.maxAzimuthAngle = 0.8;

  // ---- light: a dim hall, with the booth picked out from above ----
  scene.add(new THREE.HemisphereLight(0xf2f5f8, 0x7c8792, 0.42));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.25);
  key.position.set(1.4, 5.5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.4, bottom: -2.2, near: 0.5, far: 14 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key);
  for (const [x, tx] of [[-1.6, -0.9], [1.6, 0.9]]) {
    const spot = new THREE.SpotLight(0xfff4e6, 26, 9, 0.5, 0.7, 1.6);
    spot.position.set(x, 4.3, 2.6);
    spot.target.position.set(tx, 1.3, 0.3);
    scene.add(spot, spot.target);
  }

  // ---- helpers ----
  const loader = new THREE.TextureLoader();
  const tex = (url) => new Promise((resolve, reject) =>
    loader.load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      resolve(t);
    }, undefined, reject));
  const image = (url) => new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  const png = (name) => img(name).replace(".jpg", ".png");
  const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, envMapIntensity: 0.4, ...opts });
  // photographs are shown at their true colours, unaffected by the room light
  const photo = (map, opts = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...opts });
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const box = (w, h, d, mat) => shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));

  // Part of a texture, given as fractions from the top-left of the image.
  function crop(map, l, t, r, b) {
    const c = map.clone();
    c.repeat.set(r - l, b - t);
    c.offset.set(l, 1 - b);
    c.needsUpdate = true;
    return c;
  }

  function canvasTexture(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // A rod between two points (thread, rails, stand legs).
  function rod(a, b, material, radius = 0.004, cast = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), material);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = cast;
    scene.add(m);
    return m;
  }

  // Sculpts a cut-out photograph into relief using its depth map, so a
  // sculpture has real volume and parallax instead of being a flat picture.
  //   height: size in metres, depth: how far the nearest point stands out
  function reliefGeometry(colorImg, depthImg, { height, depth, seg = 180, alphaMin = 110 }) {
    const aspect = colorImg.width / colorImg.height;
    const nx = seg, ny = Math.max(2, Math.round(seg / aspect));
    const sample = (im) => {
      const c = document.createElement("canvas");
      c.width = nx + 1; c.height = ny + 1;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(im, 0, 0, nx + 1, ny + 1);
      return g.getImageData(0, 0, nx + 1, ny + 1).data;
    };
    const dData = sample(depthImg), aData = sample(colorImg);
    const n = (nx + 1) * (ny + 1);
    const d = new Float32Array(n), ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) { d[i] = dData[i * 4] / 255; ok[i] = aData[i * 4 + 3] > alphaMin ? 1 : 0; }
    // grow the object's depth one step past its outline, so the photo's own
    // transparency draws a clean edge instead of a stair-stepped one
    for (let pass = 0; pass < 2; pass++) {
      const grown = [];
      for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
        const i = y * (nx + 1) + x;
        if (ok[i]) continue;
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx > nx || yy > ny) continue;
          const j = yy * (nx + 1) + xx;
          if (ok[j]) { sum += d[j]; count++; }
        }
        if (count) grown.push([i, sum / count]);
      }
      for (const [i, v] of grown) { d[i] = v; ok[i] = 1; }
    }
    const w = height * aspect;
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
      const i = y * (nx + 1) + x;
      pos.set([(x / nx - 0.5) * w, (0.5 - y / ny) * height, d[i] * depth], i * 3);
      uv.set([x / nx, 1 - y / ny], i * 2);
    }
    const index = [];
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const a = y * (nx + 1) + x, b = a + 1, c = a + nx + 1, e = c + 1;
      if (ok[a] && ok[b] && ok[c]) index.push(a, c, b);
      if (ok[b] && ok[c] && ok[e]) index.push(b, c, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  }

  // Sculpted photos only hold up from near the angle they were taken at, so
  // these turn part of the way towards the visitor as they walk around.
  const turning = []; // [object, share of the visitor's angle to follow]

  const v3 = new THREE.Vector3();
  const focus = {};      // piece id -> { pos, target } camera placement
  const anchors = {};    // piece id -> Vector3 where the numbered marker sits
  const pickables = [];  // objects that select a piece when clicked

  function register(id, object, anchor, camPos, target) {
    object.traverse((o) => { o.userData.pieceId = id; });
    pickables.push(object);
    anchors[id] = anchor;
    focus[id] = { pos: camPos, target };
  }

  // ---- the hall ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), std(0x9aabba, { roughness: 0.42, envMapIntensity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const pillar = box(0.62, 6, 0.62, std(0xe9e9e6));
  pillar.position.set(0, 3, -0.62);
  scene.add(pillar);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x9da3a8 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 5.6;
  scene.add(ceiling);
  for (const [x, z, len] of [[-2.6, 1.5, 3], [2.4, 0.5, 3.4], [-1, -3, 3], [3.4, -3.5, 2.6], [0.8, 4, 3]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    strip.position.set(x, 5.58, z);
    scene.add(strip);
  }
  // the tall windows behind the booth, on the left
  const windowTex = canvasTexture(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#cfc6b0"); grad.addColorStop(0.6, "#c2b9a3"); grad.addColorStop(1, "#a3a39b");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8b9198";
    for (let x = 0; x <= w; x += 128) g.fillRect(x - 5, 0, 10, h);
  });
  const windows = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.2), new THREE.MeshBasicMaterial({ map: windowTex, toneMapped: false }));
  windows.position.set(-6.5, 2.3, -5.5);
  windows.rotation.y = 0.35;
  scene.add(windows);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshBasicMaterial({ color: 0xb4b9bd }));
  backWall.position.set(8, 3, -9);
  scene.add(backWall);

  // ---- the two fabric walls ----
  for (const [side, color] of [["left", 0x0a0a0b], ["right", 0xf0eee8]]) {
    const geo = new THREE.PlaneGeometry(WALL_W, WALL_H, 70, 60);
    const p = geo.attributes.position;
    const sign = side === "left" ? 1 : -1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * sign, y = p.getY(i) + WALL_H / 2;
      // soft vertical folds in the cloth, and the hem pooling out on the floor
      let z = 0.005 * Math.sin(x * 7.5 + Math.sin(y * 2.1) * 1.4) + 0.003 * Math.sin(x * 19 + y * 3.3);
      const hem = THREE.MathUtils.clamp((0.4 - y) / 0.4, 0, 1);
      z += hem * hem * (side === "right" ? 0.16 : 0.07) + hem * 0.018 * Math.sin(x * 15 + 1);
      p.setZ(i, z);
    }
    geo.computeVertexNormals();
    const cloth = shadow(new THREE.Mesh(geo, std(color, { roughness: 1, envMapIntensity: 0.15 })), false);
    cloth.position.copy(onWall(side, WALL_W / 2, WALL_H / 2, 0.012));
    cloth.rotation.y = ROT_Y[side];
    scene.add(cloth);
    const board = box(WALL_W, WALL_H, 0.04, std(side === "left" ? 0x0a0a0b : 0xd9d6cf, { roughness: 1 }));
    board.position.copy(onWall(side, WALL_W / 2, WALL_H / 2, -0.022));
    board.rotation.y = ROT_Y[side];
    scene.add(board);
    // the metal stand at the outer end of each wall
    const steel = std(0x9ea3a8, { metalness: 0.7, roughness: 0.4 });
    const top = onWall(side, WALL_W + 0.02, 0.95, -0.03);
    rod(top, onWall(side, WALL_W + 0.02, 0.02, 0.5), steel, 0.018, true);
    rod(top, onWall(side, WALL_W + 0.02, 0.02, -0.45), steel, 0.018, true);
    rod(onWall(side, WALL_W + 0.02, 0.02, 0.5), onWall(side, WALL_W + 0.02, 0.02, -0.45), steel, 0.018, true);
  }
  // the black rail across the corner that Dichotomy hangs from
  rod(new THREE.Vector3(-0.56, 2.0, 0.19), new THREE.Vector3(0.56, 2.0, 0.19), std(0x111112, { roughness: 0.5 }), 0.012, true);

  // ---- the red thread: flat across the black wall, a heartbeat across the white ----
  const thread = new THREE.MeshBasicMaterial({ color: 0xa3122a });
  const T = 0.016;
  rod(onWall("left", WALL_W, 1.22, T), onWall("left", 0.5, 1.22, T), thread, 0.0028);
  const beat = [[0.5, 1.22], [0.92, 1.22], [0.98, 1.58], [1.05, 1.04], [1.12, 1.42], [1.18, 1.22], [WALL_W, 1.22]];
  for (let i = 0; i < beat.length - 1; i++)
    rod(onWall("right", beat[i][0], beat[i][1], T), onWall("right", beat[i + 1][0], beat[i + 1][1], T), thread, 0.0028);

  // ---- the fence on the floor ----
  const fenceTex = canvasTexture(256, 148, (g, w, h) => {
    // one tile of hexagonal chicken wire
    g.strokeStyle = "rgba(238,243,248,0.95)";
    g.lineWidth = 4;
    const r = w / 3;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2]]) {
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * i;
        g[i ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + (h / 2) * (Math.sin(a) / Math.sin(Math.PI / 3)));
      }
      g.stroke();
    }
  });
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  const fenceGeo = new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(0, -0.08), new THREE.Vector2(1.72, -0.66), new THREE.Vector2(1.55, -2.0),
    new THREE.Vector2(-1.25, -2.15), new THREE.Vector2(-1.85, -1.35), new THREE.Vector2(-1.72, -0.66),
  ]), 1);
  // ShapeGeometry UVs are in metres; one wire tile is about 9 cm wide
  const fuv = fenceGeo.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) / 0.09, fuv.getY(i) / 0.052);
  const fence = new THREE.Mesh(fenceGeo, new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, opacity: 0.8, depthWrite: false }));
  fence.rotation.x = -Math.PI / 2;
  fence.position.y = 0.006;
  scene.add(fence);

  // ---- load the photographs ----
  const [tDichA, tDichB, tBelong, tEndless, tMoment, tFruit, tLove, tChoose, tLook, tDream] = await Promise.all([
    ...["dichotomy-a", "dichotomy-b", "belonging", "endless", "moment", "fruit", "love-story-top"].map((n) => tex(img("tex-" + n))),
    ...["choose-wisely", "look-away", "a-delicious-dream"].map((n) => tex(png("cut-" + n))),
  ]);
  const [dChoose, dLook, dDream, dLove] = await Promise.all(
    ["choose-wisely", "look-away", "a-delicious-dream", "love-story-top"].map((n) => image(png("depth-" + n))));

  // ---- small printed cards beside the works ----
  const cardTex = (border) => canvasTexture(256, 112, (g, w, h) => {
    g.fillStyle = border || "#fbfbf8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fbfbf8"; g.fillRect(7, 7, w - 14, h - 14);
    g.fillStyle = "#222"; g.fillRect(18, 18, 120, 7);
    g.fillStyle = "#666";
    for (let y = 36; y < h - 16; y += 9) g.fillRect(18, y, (0.78 + 0.18 * Math.sin(y)) * (w - 36), 3);
  });
  const plainCard = cardTex(), redCard = cardTex("#b3202a"), orangeCard = cardTex("#d98a2b"), blueCard = cardTex("#3aa7b5");
  function card(side, s, y, map = plainCard, w = 0.17, h = 0.075) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photo(map));
    m.position.copy(onWall(side, s, y, 0.02));
    m.rotation.y = ROT_Y[side];
    scene.add(m);
  }

  // A work hung on a wall. `build` fills a group whose origin is the centre of
  // the work, facing out from the wall.
  function wallWork(id, side, s, y, h, build) {
    const g = new THREE.Group();
    build(g);
    g.position.copy(onWall(side, s, y, 0.022));
    g.rotation.y = ROT_Y[side];
    scene.add(g);
    register(id, g, onWall(side, s, y + h / 2 + 0.1, 0.08), onWall(side, s, y, 1.05), onWall(side, s, y, 0.04));
  }
  // A picture frame with real depth: four bars around a recessed picture.
  function frame(g, w, h, { bar, deep, color, picture, glass = false }) {
    const mat = std(color, { roughness: 0.55 });
    const side = (bw, bh, x, y) => { const b = box(bw, bh, deep, mat); b.position.set(x, y, deep / 2); g.add(b); };
    side(w, bar, 0, h / 2 - bar / 2); side(w, bar, 0, -h / 2 + bar / 2);
    side(bar, h - 2 * bar, -w / 2 + bar / 2, 0); side(bar, h - 2 * bar, w / 2 - bar / 2, 0);
    const back = box(w - bar, h - bar, 0.006, std(0x1a1a1a));
    back.position.z = 0.003;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * bar, h - 2 * bar), photo(picture));
    pic.position.z = deep * 0.45;
    g.add(back, pic);
    if (glass) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * bar, h - 2 * bar),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0.2, envMapIntensity: 1.6 }));
      pane.position.z = deep * 0.8;
      g.add(pane);
    }
  }

  // Belonging: a linocut on paper, mounted on black board
  wallWork("belonging", "left", 1.21, 1.72, 0.34, (g) => {
    const mount = box(0.44, 0.35, 0.012, std(0x161617, { roughness: 0.8 }));
    mount.position.z = 0.006;
    const edge = std(0xf2f0ea);
    const paper = box(0.365, 0.265, 0.002, [edge, edge, edge, edge, photo(crop(tBelong, 0.085, 0.13, 0.925, 0.915)), edge]);
    paper.position.z = 0.0135;
    g.add(mount, paper);
  });
  card("left", 1.31, 1.46);

  // Endless Struggles, Endless Strength: a deep teal box, lit from inside
  wallWork("endless", "right", 0.71, 1.54, 0.35, (g) => {
    frame(g, 0.35, 0.35, { bar: 0.022, deep: 0.055, color: 0x2a8f92, picture: crop(tEndless, 0.07, 0.065, 0.925, 0.915) });
    const glow = new THREE.PointLight(0xdff3ff, 0.35, 1.4, 2);
    glow.position.z = 0.25;
    g.add(glow);
  });
  card("right", 0.71, 1.29, blueCard);

  // The Moment Of Truth: a collagraph behind glass
  wallWork("moment", "right", 1.01, 1.84, 0.37, (g) => {
    frame(g, 0.27, 0.37, { bar: 0.024, deep: 0.03, color: 0xdfe3d6, picture: crop(tMoment, 0.115, 0.09, 0.915, 0.9), glass: true });
  });
  card("right", 1.0, 2.1);

  // The Fruit Of Resistance: nails and thread on wood, orange frame
  wallWork("fruit", "right", 1.39, 1.78, 0.34, (g) => {
    frame(g, 0.43, 0.335, { bar: 0.02, deep: 0.035, color: 0xc97a1f, picture: crop(tFruit, 0.055, 0.07, 0.95, 0.93) });
  });
  card("right", 1.33, 1.53, orangeCard);

  // the curatorial text, hung deep inside on the black wall
  const textTex = canvasTexture(256, 384, (g, w, h) => {
    g.fillStyle = "#fbfbf8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#333";
    g.fillRect(20, 20, 150, 7);
    for (let y = 44; y < h - 20; y += 9) g.fillRect(20, y, (y % 63 === 8 ? 0.55 : 0.84 + 0.12 * Math.sin(y)) * (w - 40), 3);
  });
  const textPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.33), photo(textTex));
  textPanel.position.copy(onWall("left", 0.68, 1.6, 0.02));
  textPanel.rotation.y = ROT_Y.left;
  scene.add(textPanel);
  card("left", 0.55, 1.19, plainCard, 0.15, 0.05);
  card("left", 0.55, 1.1, plainCard, 0.15, 0.05);

  // ---- Dichotomy: two photographs on a black and a white board, across the corner ----
  {
    const g = new THREE.Group();
    const board = (x, color, map, flip) => {
      const b = box(0.49, 0.68, 0.02, std(color, { roughness: 0.7 }));
      b.position.x = x;
      // the PVC prints have two opposite corners cut off
      const w = 0.38, h = 0.5, c = 0.06;
      let pts = [[-w / 2 + c, h / 2], [w / 2, h / 2], [w / 2, -h / 2 + c], [w / 2 - c, -h / 2], [-w / 2, -h / 2], [-w / 2, h / 2 - c]];
      if (flip) pts = pts.map(([px, py]) => [-px, py]).reverse();
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px, py))), { depth: 0.004, bevelEnabled: false });
      const uv = geo.attributes.uv, pp = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / w + 0.5, pp.getY(i) / h + 0.5);
      const print = shadow(new THREE.Mesh(geo, photo(map)));
      print.position.set(x, 0, 0.012);
      g.add(b, print);
    };
    board(-0.245, 0x0b0b0c, tDichA, false);
    board(0.245, 0xf5f4f0, tDichB, true);
    g.position.set(0, 1.46, 0.2);
    scene.add(g);
    register("dichotomy", g, new THREE.Vector3(0, 1.9, 0.26), new THREE.Vector3(0, 1.46, 1.75), new THREE.Vector3(0, 1.44, 0.2));
  }

  // ---- Choose Wisely: the two hands, sculpted from the photograph ----
  {
    const m = shadow(new THREE.Mesh(
      reliefGeometry(tChoose.image, dChoose, { height: 0.17, depth: 0.11, seg: 260 }),
      photo(tChoose, { alphaTest: 0.5, side: THREE.DoubleSide })), true, false);
    const g = new THREE.Group();
    m.rotation.x = -0.12;
    g.add(m);
    g.position.set(0.005, 1.1, 0.24);
    scene.add(g);
    turning.push([g, 0.5]);
    register("choose-wisely", g, new THREE.Vector3(0.005, 0.97, 0.38), new THREE.Vector3(0.06, 1.25, 1.0), new THREE.Vector3(0.005, 1.1, 0.3));
  }

  // ---- A Delicious Dream: resin poured over a black plinth ----
  {
    const g = new THREE.Group();
    const H = 0.88, S = 0.35;
    const plinth = box(S, H, S, std(0x141416, { roughness: 0.5, envMapIntensity: 0.6 }));
    plinth.position.y = H / 2;
    g.add(plinth);
    // The resin is the real photograph, laid onto the plinth where it really
    // is: the slab flat across the top, the see-through film and its drips
    // down the front face. The photo shows the plinth corner-on, so each face
    // takes the part of the picture that belongs to it.
    // Pixel positions below are in the 680x917 cut-out (which has an 8px border).
    const PAD = 8, IW = tDream.image.width, IH = tDream.image.height;
    const N = [255, 306], R = [673, 102], L = [20, 143]; // the top's nearest, right and left corners in the photo
    const resin = photo(tDream, { transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide });
    function sheet(a0, a1, b0, b1, place, pixel, n = 24) {
      const pos = [], uv = [], index = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n), b = b0 + (b1 - b0) * (j / n);
        pos.push(...place(a, b));
        const [x, y] = pixel(a, b);
        uv.push((x + PAD) / IW, 1 - (y + PAD) / IH);
        if (i < n && j < n) { const k = j * (n + 1) + i; index.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(index);
      const m = new THREE.Mesh(geo, resin);
      m.renderOrder = 2;
      g.add(m);
    }
    // the slab on top (a runs along the front edge, b towards the back; it overhangs a little)
    sheet(-0.3, 1.1, -0.15, 1.25,
      (a, b) => [-S / 2 + a * S, H + 0.004, S / 2 - b * S],
      (a, b) => [N[0] + a * (R[0] - N[0]) + b * (L[0] - N[0]), N[1] + a * (R[1] - N[1]) + b * (L[1] - N[1])]);
    // the film and drips down the front face (b runs downwards)
    const DROP = 0.42, N2 = [255, 928], R2 = [673, 663];
    sheet(-0.05, 1.05, 0, 1,
      (a, b) => [-S / 2 + a * S, H + 0.004 - b * DROP, S / 2 + 0.004],
      (a, b) => {
        const top = [N[0] + a * (R[0] - N[0]), N[1] + a * (R[1] - N[1])], bottom = [N2[0] + a * (R2[0] - N2[0]), N2[1] + a * (R2[1] - N2[1])];
        return [top[0] + b * (bottom[0] - top[0]), top[1] + b * (bottom[1] - top[1])];
      });
    g.position.set(-0.55, 0, 0.5);
    g.rotation.y = 0.7; // the plinth stands corner-on to the entrance
    g.scale.setScalar(0.88);
    scene.add(g);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.07), photo(redCard));
    tag.position.set(-S / 2 - 0.001, H - 0.24, 0);
    tag.rotation.y = -Math.PI / 2;
    g.add(tag);
    register("a-delicious-dream", g, new THREE.Vector3(-0.55, H * 0.88 + 0.22, 0.5), new THREE.Vector3(0.2, 1.12, 1.5), new THREE.Vector3(-0.45, 0.65, 0.62));
  }

  // ---- Look Away: the rocks and wreckage, sculpted from the photograph ----
  {
    const g = new THREE.Group();
    const m = shadow(new THREE.Mesh(
      reliefGeometry(tLook.image, dLook, { height: 0.58, depth: 0.37, seg: 220 }),
      photo(tLook, { alphaTest: 0.5, side: THREE.DoubleSide })), true, false);
    m.rotation.x = -0.62; // the photo was taken looking down at the pile
    g.add(m);
    g.position.set(-1.02, 0, 1.08);
    scene.add(g);
    turning.push([g, 0.75]);
    // Sit the pile on the floor. The very lowest points are stray wisps of
    // wire, so settle it on the base of the rocks and let those sink below.
    g.updateMatrixWorld(true);
    const pp = m.geometry.attributes.position, ys = [];
    for (const i of new Set(m.geometry.index.array)) ys.push(v3.fromBufferAttribute(pp, i).applyMatrix4(m.matrixWorld).y);
    ys.sort((a, b) => a - b);
    g.position.y = -ys[Math.floor(ys.length * 0.22)];
    // the dark patch of soil and shadow it rests on
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.87), new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 256, (c, w, h) => {
        const grad = c.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w / 2);
        grad.addColorStop(0, "rgba(28,22,18,0.85)"); grad.addColorStop(0.6, "rgba(28,22,18,0.5)"); grad.addColorStop(1, "rgba(28,22,18,0)");
        c.fillStyle = grad; c.fillRect(0, 0, w, h);
      }), transparent: true, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-1.02, 0.004, 1.1);
    scene.add(ground);
    register("look-away", g, new THREE.Vector3(-1.02, 0.55, 1.08), new THREE.Vector3(-0.72, 0.95, 2.4), new THREE.Vector3(-1.02, 0.15, 1.1));
    card("left", 1.46, 0.55, plainCard, 0.2, 0.075);
  }

  // ---- A Love Story: a slab of soil with a crater and a rose ----
  {
    const g = new THREE.Group();
    const S = 0.66, TH = 0.07, N = 96;
    const soil = std(0x4a372a, { roughness: 1, envMapIntensity: 0.1 });
    // four sides rather than a solid block, so the crater can dip inside
    const body = new THREE.Group();
    const wallH = TH - 0.012;
    for (const [x, z, w, d] of [[0, S / 2 - 0.006, S, 0.012], [0, -S / 2 + 0.006, S, 0.012], [S / 2 - 0.006, 0, 0.012, S], [-S / 2 + 0.006, 0, 0.012, S]]) {
      const side = box(w, wallH, d, soil);
      side.position.set(x, wallH / 2, z);
      body.add(side);
    }
    // the top surface: a real crater, with the rose and stones standing up out of the photo
    const geo = new THREE.PlaneGeometry(S, S, N, N);
    const c = document.createElement("canvas");
    c.width = c.height = N + 1;
    const cg = c.getContext("2d");
    cg.drawImage(dLove, 0, 0, N + 1, N + 1);
    const relief = cg.getImageData(0, 0, N + 1, N + 1).data;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)) / (S / 2);
      const bowl = -0.028 * Math.exp(-r * r * 3.2) + 0.012 * Math.exp(-Math.pow((r - 0.78) / 0.2, 2));
      const reach = Math.max(Math.abs(p.getX(i)), Math.abs(p.getY(i))) / (S / 2);
      const edge = THREE.MathUtils.smoothstep(reach, 0.9, 1);
      // the rose, leaves and petals stand up out of the photo; fade that out towards the rim
      const stand = (relief[i * 4] / 255 - 0.5) * 0.06 * (1 - THREE.MathUtils.smoothstep(reach, 0.55, 0.85));
      p.setZ(i, (bowl + stand) * (1 - edge));
    }
    geo.computeVertexNormals();
    const top = shadow(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tLove, color: 0xd2c2b4, roughness: 1, envMapIntensity: 0.1 })));
    top.rotation.x = -Math.PI / 2;
    top.position.y = TH - 0.012;
    g.add(body, top);
    g.position.set(0.12, 0, 1.0);
    g.rotation.y = 0.62;
    scene.add(g);
    register("a-love-story", g, new THREE.Vector3(0.12, 0.28, 1.0), new THREE.Vector3(0.45, 1.05, 2.0), new THREE.Vector3(0.12, 0.05, 1.0));
  }

  // ---- words over each side, visible from the overview ----
  const word = (text, color, pos) => {
    const t = canvasTexture(1024, 128, (g, w, h) => {
      g.font = "500 54px Inter, system-ui, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = color;
      g.fillText(text.split("").join("  "), w / 2, h / 2);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    s.scale.set(2.0, 0.25, 1);
    s.position.copy(pos);
    scene.add(s);
    return s;
  };
  const words = [
    word("← DESTRUCTION", "#0d0d0e", onWall("left", 0.95, 2.62, 0.1)),
    word("GROWTH →", "#f4f1ea", onWall("right", 0.95, 2.62, 0.1)),
  ];

  // ---- numbered markers ----
  const spots = PIECES.map((p, i) => {
    const b = document.createElement("button");
    b.className = "spot";
    b.textContent = i + 1;
    b.dataset.label = p.title;
    b.setAttribute("aria-label", `${i + 1}. ${p.title}`);
    b.addEventListener("click", () => select(p.id));
    spotsEl.appendChild(b);
    return b;
  });

  // ---- camera moves ----
  let current = null;
  let move = null;
  function flyTo({ pos, target }, pullBack = 1) {
    // on tall, narrow screens stand further back so the piece still fits
    const p = target.clone().add(pos.clone().sub(target).multiplyScalar(pullBack));
    move = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: p, toTarget: target.clone(), t: 0 };
    controls.enabled = false;
  }
  const pullBack = () => Math.max(1, 1.15 / camera.aspect);

  function select(id) {
    current = id;
    hint.style.opacity = 0;
    if (id) flyTo(focus[id], pullBack());
    else flyTo(OVERVIEW, Math.max(1, 1.25 / camera.aspect));
    renderPanel();
    spots.forEach((s, i) => s.classList.toggle("is-active", PIECES[i].id === id));
  }

  function renderPanel() {
    const i = PIECES.findIndex((p) => p.id === current);
    if (i < 0) {
      const group = (side) => PIECES.map((p, n) => p.side === side
        ? `<li><button data-go="${p.id}"><span class="n">${n + 1}</span>${esc(p.title)}</button></li>` : "").join("");
      panel.innerHTML = `
        <p class="piece__tag">The exhibition as a whole</p>
        <h2>${esc(window.EXHIBITION.title)}</h2>
        <p>Seen from a distance, the entire exhibition is visible — our ability to see what is happening around us, yet often choose to remain detached. Two diagonal walls invite you in; the fence on the floor makes stepping in an effort.</p>
        <p><em>Dichotomy</em> splits the space in two. From the centre, the works are arranged towards destruction on the left and towards growth on the right, on a spectrum from chaos to order. The red thread runs flat across the black wall and beats across the white one.</p>
        ${["center", "destruction", "growth"].map((s) => `<p class="tour__group">${SIDES[s]}</p><ul class="tour__list">${group(s)}</ul>`).join("")}
        <div class="piece__actions" style="margin-top:22px"><button class="btn btn--dark" data-go="${PIECES[0].id}">Start the walk-through →</button></div>`;
    } else {
      const p = PIECES[i];
      panel.innerHTML = `
        <div class="tour__step">
          <span>${i + 1} of ${PIECES.length}</span>
          <div>
            <button class="iconbtn" data-go="${PIECES[(i + PIECES.length - 1) % PIECES.length].id}" aria-label="Previous piece">←</button>
            <button class="iconbtn" data-go="${PIECES[(i + 1) % PIECES.length].id}" aria-label="Next piece">→</button>
          </div>
        </div>
        <div class="gallery">
          <button class="gallery__main" data-zoom="${img(p.images[0])}" data-set="${p.id}" aria-label="Enlarge photo of ${esc(p.title)}">
            <img src="${img(p.images[0])}" alt="${esc(p.title)}">
            <span class="gallery__zoom">Click to enlarge</span>
          </button>
          ${p.images.length > 1 ? `<div class="gallery__thumbs">${p.images.map((n, k) =>
            `<button data-show="${img(n)}" class="${k ? "" : "is-on"}" aria-label="Show photo ${k + 1}"><img src="${img(n + "-thumb")}" alt=""></button>`).join("")}</div>` : ""}
        </div>
        ${pieceInfo(p, { thumbs: false })}
        <div class="piece__actions"><button class="btn btn--dark" data-go="">See the whole exhibition</button></div>`;
    }
    panel.scrollTop = 0;
  }
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) return select(b.dataset.go || null);
    // a thumbnail swaps the large photo of the real piece
    const t = e.target.closest("[data-show]");
    if (t) {
      const main = panel.querySelector(".gallery__main");
      main.dataset.zoom = t.dataset.show;
      main.querySelector("img").src = t.dataset.show;
      panel.querySelectorAll("[data-show]").forEach((x) => x.classList.toggle("is-on", x === t));
    }
  });
  document.getElementById("tourOverview").addEventListener("click", () => select(null));

  // ---- picking pieces directly in the scene ----
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pieceAt(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    return hit ? hit.object.userData.pieceId : null;
  }
  let down = null;
  canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const id = pieceAt(e);
    if (!id) return;
    // clicking the piece you are already standing at opens its real photos full screen
    if (id === current && !move) {
      const photos = photosOf(PIECES.find((p) => p.id === id));
      zoom(photos[0], photos);
    } else select(id);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && !e.buttons) canvas.classList.toggle("is-pointing", !!pieceAt(e));
  });
  controls.addEventListener("start", () => { hint.style.opacity = 0; });

  // ---- render loop ----
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  const clock = new THREE.Clock();
  const v = new THREE.Vector3();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let running = false;

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (move) {
      move.t = Math.min(1, move.t + dt / 1.3);
      const k = ease(move.t);
      camera.position.lerpVectors(move.fromPos, move.toPos, k);
      controls.target.lerpVectors(move.fromTarget, move.toTarget, k);
      camera.lookAt(controls.target);
      if (move.t === 1) { move = null; controls.enabled = true; }
    } else {
      controls.update();
    }
    for (const [o, share] of turning)
      o.rotation.y = share * Math.atan2(camera.position.x - o.position.x, camera.position.z - o.position.z);
    // the side words fade out when you step in close
    const far = THREE.MathUtils.smoothstep(camera.position.distanceTo(OVERVIEW.target), 2.4, 3.8);
    words.forEach((s) => { s.material.opacity = far; });

    renderer.render(scene, camera);

    // keep the numbered markers pinned to their pieces
    const w = stage.clientWidth, h = stage.clientHeight;
    PIECES.forEach((p, i) => {
      v.copy(anchors[p.id]).project(camera);
      const hidden = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
      spots[i].classList.toggle("is-hidden", hidden);
      if (!hidden) spots[i].style.translate = `${((v.x + 1) / 2) * w}px ${((1 - v.y) / 2) * h}px`;
    });
  }

  return {
    open(id) {
      resize();
      running = true;
      clock.getDelta();
      loading.classList.add("is-done");
      select(id && focus[id] ? id : null);
      tick();
    },
    close() { running = false; },
  };
}
