import * as THREE from 'three';

/**
 * Environment arena — PLACEHOLDER prosedural.
 * Nanti lantai/ground dan bangunan diganti model 3D milik user:
 * cukup ganti isi buildArena() (kontrak keluarannya: ringTopY & ringRadius).
 */

export interface ArenaInfo {
  /** Ketinggian permukaan ring (y tempat karakter berpijak). */
  ringTopY: number;
  /** Radius area bermain yang bisa dipijak. */
  playRadius: number;
}

function floorTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;

  // Dasar batu
  g.fillStyle = '#7a7268';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i = 9000; i++) {
    const s = Math.random();
    g.fillStyle = s > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2.5, 2.5);
  }

  const cx = 512;
  const cy = 512;
  // Lingkaran konsentris
  const rings: Array<[number, string, number]> = [
    [500, '#565048', 10],
    [430, '#8d8478', 5],
    [300, '#5d564e', 6],
    [190, '#8d8478', 4],
  ];
  for (const [r, col, w] of rings) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  // Segmen radial seperti lantai arena turnamen
  g.strokeStyle = 'rgba(70,63,55,0.55)';
  g.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190);
    g.lineTo(cx + Math.cos(a) * 500, cy + Math.sin(a) * 500);
    g.stroke();
  }
  // Emblem tengah
  g.strokeStyle = '#ffb347';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(cx, cy, 92, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,179,71,0.85)';
  g.beginPath();
  g.arc(cx, cy, 16, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowsTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#11141f';
  g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 240; y += 18) {
    for (let x = 10; x < 118; x += 18) {
      if (Math.random() > 0.45) {
        g.fillStyle = Math.random() > 0.25 ? 'rgba(255,196,92,0.95)' : 'rgba(150,210,255,0.9)';
        g.fillRect(x, y, 9, 11);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyDome(): THREE.Mesh {
  // Gradasi langit senja via tekstur canvas — TANPA ShaderMaterial custom,
  // supaya tidak ada risiko gagal compile shader di driver GPU tertentu.
  const geo = new THREE.SphereGeometry(320, 24, 16);
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#131c3f');
  grad.addColorStop(0.3, '#2f2158');
  grad.addColorStop(0.44, '#4a2a6e');
  grad.addColorStop(0.54, '#ff8c42');
  grad.addColorStop(1.0, '#d96f35');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

export function buildArena(scene: THREE.Scene, opts?: { shadowMapSize?: number }): ArenaInfo {
  const shadowSize = opts?.shadowMapSize ?? 2048;
  const ringRadius = 14;
  const ringTopY = 1.2;

  scene.fog = new THREE.Fog(0x2a2138, 70, 240);
  scene.add(skyDome());

  // Cahaya
  const hemi = new THREE.HemisphereLight(0x93b8ff, 0x3a2a1c, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a3, 1.9);
  sun.position.set(20, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Lantai ring (atas)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ringRadius, 72),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = ringTopY;
  floor.receiveShadow = true;
  scene.add(floor);

  // Badan platform (silinder menyempit ke bawah = pulau melayang)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(ringRadius, ringRadius * 0.45, 7, 72),
    new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 }),
  );
  body.position.y = ringTopY - 3.5;
  scene.add(body);

  // Cincin tepi menyala
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

  // Tanah jauh di bawah (penangkap kabut visual)
  const far = new THREE.Mesh(
    new THREE.CircleGeometry(300, 40),
    new THREE.MeshStandardMaterial({ color: 0x1c1a26, roughness: 1 }),
  );
  far.rotation.x = -Math.PI / 2;
  far.position.y = ringTopY - 7.05;
  scene.add(far);

  // Bangunan siluet di sekeliling (placeholder — nanti diganti model user)
  const winTex = windowsTexture();
  const buildingMat = new THREE.MeshStandardMaterial({
    color: 0x232839,
    roughness: 0.9,
    emissive: 0xffffff,
    emissiveMap: winTex,
    emissiveIntensity: 0.55,
    map: winTex,
  });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + Math.random() * 0.14;
    const dist = 44 + Math.random() * 34;
    const w = 6 + Math.random() * 7;
    const h = 8 + Math.random() * 20;
    const d = 6 + Math.random() * 7;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
    b.position.set(Math.cos(a) * dist, ringTopY - 7 + h / 2 - 2, Math.sin(a) * dist);
    b.rotation.y = -a + Math.PI / 2;
    scene.add(b);
  }

  // Puncak gunung jauh
  const mMat = new THREE.MeshStandardMaterial({ color: 0x1a1626, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const dist = 130 + Math.random() * 40;
    const h = 26 + Math.random() * 22;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 5), mMat);
    cone.position.set(Math.cos(a) * dist, h / 2 - 8, Math.sin(a) * dist);
    scene.add(cone);
  }

  return { ringTopY, playRadius: ringRadius - 1.1 };
}
