import type { ChibiPalette } from './character';

/**
 * Roster karakter — DATA-DRIVEN. Karakter baru cukup ditambah sebagai
 * satu entri di CHARACTERS: layer pilih karakter, pemuatan model, dan
 * skill per petarung semuanya membaca dari sini.
 */

export interface SkillDef {
  name: string;
  /** 'projectile' = tembakan lurus; 'buff' = penguatan diri sementara. */
  kind: 'projectile' | 'buff';
  /** Biaya chakra sekali pakai. */
  chakraCost: number;
  /** Damage saat proyektil kena (abaikan untuk buff). */
  damage: number;
  /** Jeda antar pemakaian (detik). */
  cooldown: number;
  projectileColor: number;
  projectileSpeed: number;
  /** Khusus buff: pengali damage selama buff aktif. */
  buffMultiplier?: number;
  /** Khusus buff: lama buff (detik). */
  buffDuration?: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** Tipe karakter — identitas gaya main (Penyihir, Projectile, ...). */
  typeName: string;
  epithet: string;
  /** Kapasitas chakra maksimum (tiap tipe beda). */
  chakraMax: number;
  /** Pemulihan chakra per detik. */
  chakraRegen: number;
  /** Pengali kecepatan gerak terhadap kecepatan dasar. */
  moveSpeedMul: number;
  /** Damage serangan jarak dekat (putaran) per kena. */
  meleeDamage: number;
  modelUrl: string;
  /** Foto muka karakter untuk kartu pilih (di dalam jajar genjang). */
  faceUrl: string;
  /** Palet chibi: dipakai saat model belum termuat / gagal. */
  palette: ChibiPalette;
  /** Warna aksen kartu pilih karakter (CSS). */
  accent: string;
  skill: SkillDef;
}

/** Skill netral sebelum karakter dipilih. */
export const DEFAULT_SKILL: SkillDef = {
  name: 'Jurus',
  kind: 'projectile',
  chakraCost: 25,
  damage: 12,
  cooldown: 0.9,
  projectileColor: 0x66ccff,
  projectileSpeed: 19,
};

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'omen',
    name: 'OMEN',
    typeName: 'Penyihir',
    epithet: 'Jubah Putih',
    chakraMax: 160,
    chakraRegen: 14,
    moveSpeedMul: 1.15,
    meleeDamage: 6,
    modelUrl: 'models/player1.glb',
    faceUrl: 'faces/omen.jpg',
    palette: { outfit: 0x2f6fd6, hair: 0x23202e, band: 0x2440a0 },
    accent: '#dfe7ff',
    skill: {
      name: 'Light Shadow',
      kind: 'projectile',
      chakraCost: 10, // minim chakra
      damage: 6, // damage tidak terlalu sakit
      cooldown: 0.7, // cast cepat
      projectileColor: 0xf2f5ff,
      projectileSpeed: 21,
    },
  },
  {
    id: 'koboi',
    name: 'KOBOI',
    typeName: 'Projectile',
    epithet: 'Penembak Barat',
    chakraMax: 60,
    chakraRegen: 5,
    moveSpeedMul: 1.05,
    meleeDamage: 6,
    modelUrl: 'models/player2.glb',
    faceUrl: 'faces/koboi.jpg',
    palette: { outfit: 0xd64a2f, hair: 0x3a2318, band: 0xa02418 },
    accent: '#ffb52e',
    skill: {
      name: 'Pistol',
      kind: 'projectile',
      chakraCost: 15, // chakra kecil
      damage: 22, // damage tinggi
      cooldown: 2.5, // cast lambat
      projectileColor: 0xffc46b,
      projectileSpeed: 30,
    },
  },
  {
    id: 'ryu',
    name: 'RYU',
    typeName: 'Fighter',
    epithet: 'Gi Putih Berikat Merah',
    chakraMax: 100, // chakra normal
    chakraRegen: 7,
    moveSpeedMul: 0.85, // lambat
    meleeDamage: 13, // serangan sangat besar
    modelUrl: 'models/ryu.glb',
    faceUrl: 'faces/ryu.jpg',
    palette: { outfit: 0xe8e4da, hair: 0x2e2622, band: 0xc0272d },
    accent: '#ff5a4e',
    skill: {
      name: 'Penguatan',
      kind: 'buff', // memperkuat damage diri sendiri
      chakraCost: 30,
      damage: 0,
      cooldown: 12, // lumayan lama
      projectileColor: 0xff6a3c, // warna pijar buff
      projectileSpeed: 0,
      buffMultiplier: 1.8, // damage x1.8 selama buff
      buffDuration: 4, // durasi singkat
    },
  },
];
