import * as THREE from 'three';

/**
 * Environment arena MINIMAL — hanya panggung pertarungan, tanpa
 * dekorasi pendukung (gunung, gedung, tanah jauh, tekstur prosedural
 * semua dibuang demi muat awal yang ringan). Kontrak keluaran:
 * ringTopY & playRadius.
 */

export interface ArenaInfo {
  /** Ketinggian permukaan ring (y tempat karakter berpijak). */
  ringTopY: number;
  /** Radius area bermain yang bisa dipijak. */
  playRadius: number;
}

export function buildArena(scene: THREE.Scene, opts?: { shadowMapSize?: number }): ArenaInfo {
  const shadowSize = opts?.shadowMapSize ?? 2048;
  const ringRadius = 14;
  const ringTopY = 1.2;

  // Langit warna polos + kabut sewarna (tanpa mesh/tekstur langit)
  scene.background = new THREE.Color(0x353a6e);
  scene.fog = new THREE.Fog(0x353a6e, 45, 110);

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
  sun.shadow.bias = -0.0004;
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

  // Badan platform (pulau melayang)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(ringRadius, ringRadius * 0.45, 7, 72),
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

  return { ringTopY, playRadius: ringRadius - 1.1 };
}
