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

  // Lantai ring (warna polos, tanpa tekstur)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ringRadius, 72),
    new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = ringTopY;
  floor.receiveShadow = true;
  scene.add(floor);

  // Badan platform (pulau melayang) — OPEN-ENDED: tutup atas silinder
  // bidangnya persis sama dengan lantai (y = ringTopY) dan menyebabkan
  // z-fighting bergaris di seluruh lantai. Sisi saja; pertemuan dengan
  // lantai ditutup cincin rim.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(ringRadius, ringRadius * 0.45, 7, 72, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x5b4a3f, roughness: 1 }),
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
