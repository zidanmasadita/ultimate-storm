import type { ChibiPalette } from './character';

/**
 * Roster karakter — DATA-DRIVEN. Karakter baru cukup ditambah sebagai
 * satu entri di CHARACTERS: layer pilih karakter, pemuatan model, dan
 * skill per petarung semuanya membaca dari sini.
 */

export interface SkillDef {
  name: string;
  /** Biaya chakra sekali pakai. */
  chakraCost: number;
  /** Damage saat proyektil kena. */
  damage: number;
  /** Jeda antar pemakaian (detik). */
  cooldown: number;
  projectileColor: number;
  projectileSpeed: number;
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
    modelUrl: 'models/player1.glb',
    faceUrl: 'faces/omen.jpg',
    palette: { outfit: 0x2f6fd6, hair: 0x23202e, band: 0x2440a0 },
    accent: '#dfe7ff',
    skill: {
      name: 'Light Shadow',
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
    modelUrl: 'models/player2.glb',
    faceUrl: 'faces/koboi.jpg',
    palette: { outfit: 0xd64a2f, hair: 0x3a2318, band: 0xa02418 },
    accent: '#ffb52e',
    skill: {
      name: 'Pistol',
      chakraCost: 15, // chakra kecil
      damage: 22, // damage tinggi
      cooldown: 2.5, // cast lambat
      projectileColor: 0xffc46b,
      projectileSpeed: 30,
    },
  },
];
