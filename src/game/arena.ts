import * as THREE from 'three';

/**
 * Environment arena — panggung pertarungan polos + langit prosedural
 * ringan: tekstur langit DIGAMBAR kode di canvas saat memuat (0 KB
 * unduhan, ±2 MB memori grafis, 1 draw call), bukan file aset.
 * Kontrak keluaran: ringTopY & playRadius & skyTexture.
 */

export interface ArenaInfo {
  /** Ketinggian permukaan ring (y tempat karakter berpijak). */
  ringTopY: number;
  /** Radius area bermain yang bisa dipijak. */
  playRadius: number;
  /** Tekstur langit prosedural (untuk drift awan pelan di loop). */
  skyTexture: THREE.CanvasTexture;
}

/**
 * Gambar tekstur langit senja 1024x512 di canvas: gradasi indigo ke
 * pijar oranye di horizon (v=0,5 = garis horizon bola), gumpalan awan
 * lembut, dan bintang samar di atas. Awan digambar juga pada salinan
 * x±lebar agar sambungan bungkus (wrap) tidak terpotong.
 */
function makeSkyTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, '#171d3d');
  grad.addColorStop(0.3, '#2c3263');
  grad.addColorStop(0.44, '#4a4f8f');
  grad.addColorStop(0.5, '#b06a44');
  grad.addColorStop(0.54, '#4a4470');
  grad.addColorStop(0.7, '#232046');
  grad.addColorStop(1.0, '#14122b');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Pijar matahari senja sedikit di atas horizon
  const sun = g.createRadialGradient(W * 0.3, H * 0.47, 10, W * 0.3, H * 0.47, 280);
  sun.addColorStop(0, 'rgba(255,170,90,0.55)');
  sun.addColorStop(0.5, 'rgba(255,140,70,0.18)');
  sun.addColorStop(1, 'rgba(255,140,70,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);

  // Bintang samar di separuh atas
  let seed = 42;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = '#dfe8ff';
  for (let i = 0; i < 110; i++) {
    g.globalAlpha = 0.15 + rnd() * 0.5;
    const r = 0.6 + rnd() * 1.1;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H * 0.38, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Awan: gumpalan elips bergradasi radial, hangat di dekat horizon
  const puff = (x: number, y: number, w: number, h: number, warm: boolean, a: number) => {
    for (const dx of [-W, 0, W]) {
      const rg = g.createRadialGradient(x + dx, y, 1, x + dx, y, w / 2);
      const col = warm ? '255,205,160' : '235,238,255';
      rg.addColorStop(0, `rgba(${col},${a})`);
      rg.addColorStop(1, `rgba(${col},0)`);
      g.save();
      g.translate(x + dx, y);
      g.scale(1, h / w);
      g.translate(-(x + dx), -y);
      g.fillStyle = rg;
      g.fillRect(x + dx - w / 2, y - h / 2, w, h);
      g.restore();
    }
  };
  for (let i = 0; i < 52; i++) {
    const y = H * (0.14 + rnd() * 0.4);
    const warm = y > H * 0.4;
    const w = 90 + rnd() * 200;
    puff(rnd() * W, y, w, w * (0.22 + rnd() * 0.14), warm, 0.05 + rnd() * 0.11);
  }
  // Pita awan tipis memanjang di horizon
  for (let i = 0; i < 9; i++) {
    puff(rnd() * W, H * (0.47 + rnd() * 0.05), 260 + rnd() * 260, 26 + rnd() * 16, true, 0.1 + rnd() * 0.08);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** RNG sederhana ber-seed agar pola tekstur konsisten tiap muat. */
function seededRnd(seedStart: number): () => number {
  let seed = seedStart;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * Tekstur lantai ring 1024x1024 digambar prosedural (0 KB aset):
 * lempeng batu melingkar (lingkaran konsentris + garis radial) dengan
 * variasi rona per lempeng, grain, dan retakan halus. Dipakai juga
 * sebagai bumpMap ringan agar garis ukir terasa di bawah cahaya.
 */
function makeFloorTexture(): THREE.CanvasTexture {
  const S = 1024;
  const C = S / 2;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const rnd = seededRnd(777);

  g.fillStyle = '#8a7f72';
  g.fillRect(0, 0, S, S);
  const base = g.createRadialGradient(C, C, 40, C, C, C);
  base.addColorStop(0, 'rgba(255,246,230,0.13)');
  base.addColorStop(0.55, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(20,14,10,0.28)');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  // Variasi rona per lempeng (pita radial x sektor 15 derajat)
  const bands = [0, 0.22, 0.45, 0.68, 0.86, 0.97, 1];
  for (let b = 0; b < bands.length - 1; b++) {
    for (let sIdx = 0; sIdx < 24; sIdx++) {
      const a1 = (sIdx / 24) * Math.PI * 2;
      const a2 = ((sIdx + 1) / 24) * Math.PI * 2;
      g.beginPath();
      g.arc(C, C, bands[b + 1] * C, a1, a2);
      g.arc(C, C, bands[b] * C, a2, a1, true);
      g.closePath();
      g.fillStyle = rnd() < 0.5 ? `rgba(255,250,238,${0.02 + rnd() * 0.05})` : `rgba(24,18,14,${0.02 + rnd() * 0.05})`;
      g.fill();
    }
  }

  // Garis ukir: lingkaran konsentris + garis radial antar lempeng
  g.strokeStyle = 'rgba(38,30,24,0.4)';
  g.lineWidth = 3;
  for (const f of [0.22, 0.45, 0.68, 0.86, 0.97]) {
    g.beginPath();
    g.arc(C, C, f * C, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(38,30,24,0.26)';
  g.lineWidth = 2.4;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * C * 0.1, C + Math.sin(a) * C * 0.1);
    g.lineTo(C + Math.cos(a) * C * 0.99, C + Math.sin(a) * C * 0.99);
    g.stroke();
  }

  // Pita hangat samar di tepi (menyambung pijar rim oranye)
  g.beginPath();
  g.arc(C, C, C * 0.985, 0, Math.PI * 2);
  g.arc(C, C, C * 0.9, 0, Math.PI * 2, true);
  g.fillStyle = 'rgba(255,150,70,0.07)';
  g.fill();

  // Lambang pusat samar: dua lingkaran + empat berlian arah mata angin
  g.strokeStyle = 'rgba(52,40,30,0.45)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(C, C, C * 0.17, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2.4;
  g.beginPath();
  g.arc(C, C, C * 0.135, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(52,40,30,0.4)';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = C + Math.cos(a) * C * 0.152;
    const y = C + Math.sin(a) * C * 0.152;
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 4);
    g.fillRect(-7, -7, 14, 14);
    g.restore();
  }

  // Grain batu: ribuan titik terang/gelap halus
  for (let i = 0; i < 2800; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 0.6 + rnd() * 1.9;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,250,240,${0.04 + rnd() * 0.08})` : `rgba(20,15,12,${0.04 + rnd() * 0.08})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Retakan halus: jalan acak pendek bercabang
  g.strokeStyle = 'rgba(30,24,20,0.20)';
  g.lineWidth = 1.3;
  for (let i = 0; i < 11; i++) {
    let x = C + (rnd() - 0.5) * S * 0.85;
    let y = C + (rnd() - 0.5) * S * 0.85;
    let a = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 4 + Math.floor(rnd() * 5);
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      a += (rnd() - 0.5) * 1.1;
      x += Math.cos(a) * (10 + rnd() * 22);
      y += Math.sin(a) * (10 + rnd() * 22);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Tekstur sisi pulau 512x256: batuan gelap bergaris-garis vertikal
 * dan lapisan horizontal samar; diulang 6x mengelilingi silinder.
 */
function makeRockTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const rnd = seededRnd(31337);

  g.fillStyle = '#5b4a3f';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const w = 6 + rnd() * 30;
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    const dark = rnd() < 0.55;
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, dark ? `rgba(18,12,9,${0.08 + rnd() * 0.13})` : `rgba(255,238,214,${0.05 + rnd() * 0.07})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, H);
  }
  g.strokeStyle = 'rgba(22,16,12,0.25)';
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * H + rnd() * 14;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y + (rnd() - 0.5) * 10);
    g.stroke();
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,240,220,${0.03 + rnd() * 0.06})` : `rgba(12,9,7,${0.03 + rnd() * 0.07})`;
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 1.6, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 6;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildArena(scene: THREE.Scene, opts?: { shadowMapSize?: number }): ArenaInfo {
  const shadowSize = opts?.shadowMapSize ?? 2048;
  const ringRadius = 14;
  const ringTopY = 1.2;

  // Langit: kubah bola sisi-dalam bertekstur prosedural (0 KB aset).
  // Warna latar polos dipertahankan sebagai cadangan; kabut sewarna
  // langit tengah.
  scene.background = new THREE.Color(0x353a6e);
  scene.fog = new THREE.Fog(0x353a6e, 45, 110);
  const skyTexture = makeSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(95, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  // Cahaya
  const hemi = new THREE.HemisphereLight(0xbdd7ff, 0x54452c, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.9);
  sun.position.set(20, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0002;
  // Anti shadow-acne: tanpa ini, lantai datar sudut landai penuh garis
  // berkedip (artefak self-shadowing). Geser sampel sepanjang normal.
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  // Lantai ring bertekstur lempeng batu prosedural (+ bump ringan)
  const floorTex = makeFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ringRadius, 72),
    new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 0.25, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = ringTopY;
  floor.receiveShadow = true;
  scene.add(floor);

  // Badan platform (pulau melayang) — OPEN-ENDED: tutup atas silinder
  // bidangnya persis sama dengan lantai (y = ringTopY) dan menyebabkan
  // z-fighting bergaris di seluruh lantai. Sisi saja; pertemuan dengan
  // lantai ditutup cincin rim.
  const rockTex = makeRockTexture();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(ringRadius, ringRadius * 0.45, 7, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: rockTex, bumpMap: rockTex, bumpScale: 0.4, roughness: 1 }),
  );
  body.position.y = ringTopY - 3.5;
  scene.add(body);

  // Cincin tepi menyala (identitas ring, tetap dipertahankan)
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(ringRadius - 0.05, 0.09, 10, 90),
    new THREE.MeshStandardMaterial({
      color: 0x331f00,
      emissive: 0xff9a3c,
      emissiveIntensity: 2.2,
    }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = ringTopY;
  scene.add(rim);

  return { ringTopY, playRadius: ringRadius - 1.1, skyTexture };
}
