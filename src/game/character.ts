import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Karakter petarung. Model hasil generate TIDAK punya rig/tulang,
 * jadi animasinya prosedural (transform model utuh): bob idle,
 * miring mengikuti gerak, putaran serangan, dsb.
 */

export const FIGHTER_HEIGHT = 1.8;

/** Model kapsul placeholder (dipakai sebelum GLB selesai dimuat / bila gagal). */
export function placeholderModel(color: number): THREE.Object3D {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242e, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 6, 14), mat);
  body.position.y = 0.95;
  body.castShadow = true;
  grp.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), mat);
  head.position.y = 1.78;
  head.castShadow = true;
  grp.add(head);

  // Ikat kepala penanda arah hadap (+Z)
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.06), dark);
  band.position.set(0, 1.84, 0.24);
  grp.add(band);
  const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.03), dark);
  tail1.position.set(0.12, 1.66, -0.26);
  tail1.rotation.x = 0.35;
  grp.add(tail1);
  const tail2 = tail1.clone();
  tail2.position.x = -0.12;
  grp.add(tail2);

  return grp;
}

/** Muat GLB; normalisasi skala ke FIGHTER_HEIGHT dan pijak tanah y=0. Gagal -> placeholder. */
export async function loadFighterModel(url: string, fallbackColor: number): Promise<THREE.Object3D> {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const scale = size.y > 0 ? FIGHTER_HEIGHT / size.y : 1;
    root.scale.setScalar(scale);
    root.position.x = -center.x * scale;
    root.position.z = -center.z * scale;
    root.position.y = -box.min.y * scale;

    const wrap = new THREE.Group();
    wrap.add(root);
    wrap.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
      }
    });
    return wrap;
  } catch (_) {
    return placeholderModel(fallbackColor);
  }
}

export class Fighter {
  /** Grup akar — posisinya = titik pijak di tanah. */
  group = new THREE.Group();
  /** Model di dalam grup (untuk animasi prosedural tanpa mengganggu posisi akar). */
  inner = new THREE.Group();

  vel = new THREE.Vector3();
  vy = 0;
  grounded = true;
  /** Sudut hadap (radian, sumbu Y). Model menghadap +Z saat facing = 0. */
  facing = 0;

  hp = 100;
  chakra = 100;

  attackTimer = 0;
  attackCooldown = 0;
  dashTimer = 0;
  dashCooldown = 0;
  skillCooldown = 0;
  hitTimer = 0;
  /** Arah dorongan saat terkena pukul (knockback), meluruh tiap frame. */
  knockback = new THREE.Vector3();

  private materials: THREE.MeshStandardMaterial[] = [];

  constructor(model: THREE.Object3D) {
    this.group.add(this.inner);
    this.setModel(model);
  }

  /** Ganti model di dalam grup (mis. placeholder -> GLB asli saat selesai dimuat). */
  setModel(model: THREE.Object3D): void {
    this.inner.clear();
    this.inner.add(model);
    this.materials = [];
    this.inner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m && 'emissive' in m) this.materials.push(m);
      }
    });
  }

  get pos(): THREE.Vector3 {
    return this.group.position;
  }

  /** Animasi prosedural per frame. t = waktu total (detik). */
  animate(dt: number, t: number, speed2D: number): void {
    const inner = this.inner;

    // Napas/bob idle + bob lebih cepat saat bergerak
    const moving = speed2D > 0.4;
    const bobFreq = moving ? 11 : 2.2;
    const bobAmp = moving ? 0.05 : 0.028;
    inner.position.y = Math.abs(Math.sin(t * bobFreq)) * bobAmp;

    // Miring ke arah gerak (lean) — dari kecepatan lokal
    const localVel = this.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.facing);
    const targetLeanX = THREE.MathUtils.clamp(localVel.z * 0.045, -0.28, 0.28);
    const targetLeanZ = THREE.MathUtils.clamp(-localVel.x * 0.045, -0.28, 0.28);
    inner.rotation.x = THREE.MathUtils.damp(inner.rotation.x, targetLeanX, 12, dt);
    inner.rotation.z = THREE.MathUtils.damp(inner.rotation.z, targetLeanZ, 12, dt);

    // Serangan: putaran cepat 360 derajat
    if (this.attackTimer > 0) {
      const p = 1 - this.attackTimer / 0.35; // 0..1
      inner.rotation.y = p * Math.PI * 2;
      inner.position.y += Math.sin(p * Math.PI) * 0.12;
    } else {
      inner.rotation.y = 0;
    }

    // Berkedip merah saat terkena serangan
    const flash = this.hitTimer > 0 ? 0.85 : 0;
    for (const m of this.materials) {
      m.emissive.setRGB(flash, flash * 0.12, flash * 0.08);
    }

    // Hadap
    this.group.rotation.y = this.facing;
  }

  reset(spawn: THREE.Vector3, facing: number): void {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.vy = 0;
    this.facing = facing;
    this.hp = 100;
    this.chakra = 100;
    this.attackTimer = 0;
    this.hitTimer = 0;
  }
}

/** Putar sudut a ke arah target dengan kecepatan maksimum (rad/detik), jalan terpendek. */
export function turnToward(a: number, target: number, maxStep: number): number {
  let diff = (target - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  const step = THREE.MathUtils.clamp(diff, -maxStep, maxStep);
  return a + step;
}
