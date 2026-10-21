import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Karakter petarung CHIBI prosedural — dibangun dari bentuk dasar
 * (bola, kapsul, torus) langsung di kode: tanpa file model, tanpa
 * unduhan, ringan di semua perangkat. Animasinya prosedural:
 * bob, miring mengikuti gerak, ayunan lengan, putaran serangan.
 */

function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export interface ChibiPalette {
  outfit: number;
  hair: number;
  band: number;
}

/** Bangun karakter chibi (tinggi ±1,35 m, kepala besar). Menghadap +Z. */
export function chibiModel(p: ChibiPalette): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(0xffd9b3, 0.65);

  // Kaki mungil + sepatu
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.1, 4, 10), mat(0x2c2c38));
    leg.position.set(0.11 * sx, 0.16, 0);
    leg.castShadow = true;
    g.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.22), mat(p.band, 0.7));
    shoe.position.set(0.11 * sx, 0.035, 0.03);
    shoe.castShadow = true;
    g.add(shoe);
  }

  // Badan mungil
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.2, 6, 14), mat(p.outfit));
  body.position.y = 0.52;
  body.castShadow = true;
  g.add(body);
  // Sabuk
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 20), mat(0xf2f2f2, 0.6));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.44;
  g.add(belt);

  // Lengan pendek (grup bahu supaya bisa diayun)
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = sx < 0 ? 'armL' : 'armR';
    arm.position.set(0.26 * sx, 0.66, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 10), mat(p.outfit));
    limb.position.y = -0.13;
    limb.castShadow = true;
    arm.add(limb);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skin);
    hand.position.y = -0.28;
    arm.add(hand);
    arm.rotation.z = 0.35 * sx;
    g.add(arm);
  }

  // Kepala BESAR (ciri chibi)
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.0;
  g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), skin);
  skull.castShadow = true;
  head.add(skull);
  // Rambut: belahan bola atas
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.355, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(p.hair, 0.95),
  );
  hair.position.set(0, 0.05, -0.02);
  head.add(hair);
  // Ikat kepala + ekor di belakang
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.042, 8, 24), mat(p.band, 0.6));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.1;
  head.add(band);
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.02), mat(p.band, 0.7));
    tail.position.set(0.1 * sx, -0.05, -0.35);
    tail.rotation.x = 0.4;
    head.add(tail);
  }
  // Mata besar menghadap +Z
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), mat(0x14141c, 0.35));
    eye.position.set(0.12 * sx, -0.01, 0.315);
    head.add(eye);
    const pipi = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xffa8a0, 0.9));
    pipi.position.set(0.2 * sx, -0.09, 0.27);
    pipi.scale.set(1, 0.6, 0.4);
    head.add(pipi);
  }

  return g;
}

export const FIGHTER_HEIGHT = 1.8;

/**
 * Muat GLB karakter asli; normalisasi skala ke FIGHTER_HEIGHT dan
 * pijak tanah y=0. Gagal -> chibi cadangan. Model tidak punya rig,
 * jadi animasi tetap prosedural pada model utuh.
 */
export async function loadFighterModel(url: string, fallback: ChibiPalette): Promise<THREE.Object3D> {
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
    return chibiModel(fallback);
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
  private armL: THREE.Object3D | null = null;
  private armR: THREE.Object3D | null = null;
  private headGrp: THREE.Object3D | null = null;

  constructor(model: THREE.Object3D) {
    this.group.add(this.inner);
    this.setModel(model);
  }

  /** Ganti model di dalam grup (chibi pembuka -> GLB asli saat selesai dimuat). */
  setModel(model: THREE.Object3D): void {
    this.inner.clear();
    this.inner.add(model);
    this.materials = [];
    this.armL = null;
    this.armR = null;
    this.headGrp = null;
    this.inner.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m && 'emissive' in m) this.materials.push(m);
      }
      if (o.name === 'armL') this.armL = o;
      if (o.name === 'armR') this.armR = o;
      if (o.name === 'head') this.headGrp = o;
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

    // Ayunan lengan: berlawanan arah saat berjalan, melebar saat menyerang
    const attacking = this.attackTimer > 0;
    if (this.armL && this.armR) {
      if (attacking) {
        this.armL.rotation.x = -2.4;
        this.armR.rotation.x = -2.4;
      } else if (moving) {
        const swing = Math.sin(t * bobFreq) * 0.75;
        this.armL.rotation.x = swing;
        this.armR.rotation.x = -swing;
      } else {
        this.armL.rotation.x = Math.sin(t * 2.2) * 0.08;
        this.armR.rotation.x = -Math.sin(t * 2.2) * 0.08;
      }
    }
    // Kepala sedikit menunduk saat menyerang
    if (this.headGrp) {
      this.headGrp.rotation.x = attacking ? 0.22 : Math.sin(t * 2.2) * 0.04;
    }

    // Serangan: putaran cepat 360 derajat
    if (attacking) {
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
