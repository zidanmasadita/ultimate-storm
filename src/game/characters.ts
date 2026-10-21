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
  /** Khusus proyektil: jarak musuh berpindah tempat ACAK saat kena (unit). */
  displace?: number;
  /** Khusus proyektil: gerakan korban dikali factor selama duration detik. */
  slow?: { factor: number; duration: number };
}

/** Basic attack jarak jauh (tipe Projectile): tembakan lurus searah hadap. */
export interface RangedBasicDef {
  damage: number;
  projectileSpeed: number;
  color: number;
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
  /** Jeda antar basic attack (detik) — variasi rasa per tipe. */
  basicCooldown?: number;
  /** Jangkauan basic attack putar (unit). */
  basicRange?: number;
  /** Bila ada: basic attack-nya tembakan jarak jauh, bukan putaran. */
  rangedBasic?: RangedBasicDef;
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
    basicCooldown: 0.38, // putaran cepat khas penyihir
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
    basicCooldown: 0.42,
    rangedBasic: { damage: 5, projectileSpeed: 27, color: 0xffd76a }, // basic attack tembakan jarak jauh
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
    basicCooldown: 0.55, // ayunan berat: lambat tapi sakit
    basicRange: 2.7,
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
  {
    id: 'wichy',
    name: 'WICHY',
    typeName: 'Penyihir',
    epithet: 'Lingkaran Sihir Oranye',
    chakraMax: 160, // spek sama seperti Omen
    chakraRegen: 14,
    moveSpeedMul: 1.15,
    meleeDamage: 6,
    basicCooldown: 0.38, // putaran cepat seperti Omen
    modelUrl: 'models/wichy.glb',
    faceUrl: 'faces/wichy.jpg',
    palette: { outfit: 0x2c3e8f, hair: 0x2a1e24, band: 0xc0272d },
    accent: '#ff9a3c',
    skill: {
      name: 'Portal',
      kind: 'projectile',
      chakraCost: 10,
      damage: 6,
      cooldown: 0.7, // cast cepat seperti Omen
      projectileColor: 0xffa63c,
      projectileSpeed: 21,
      displace: 2.2, // musuh berpindah ±2,2 unit ke ARAH ACAK saat kena
    },
  },
  {
    id: 'ronin',
    name: 'RONIN',
    typeName: 'Fighter',
    epithet: 'Samurai Bertopi Lebar',
    chakraMax: 100, // spek sama seperti Ryu...
    chakraRegen: 7,
    moveSpeedMul: 0.92, // ...kecuali sedikit lebih cepat dari Ryu (0.85)
    meleeDamage: 11, // ...dan damage sedikit lebih kecil dari Ryu (13)
    basicCooldown: 0.5, // ayunan berat khas fighter
    basicRange: 2.7,
    modelUrl: 'models/ronin.glb',
    faceUrl: 'faces/ronin.jpg',
    palette: { outfit: 0x2c2c34, hair: 0xe8e8ec, band: 0xc0272d },
    accent: '#d8b25c',
    skill: {
      name: 'Penguatan',
      kind: 'buff',
      chakraCost: 30,
      damage: 0,
      cooldown: 12,
      projectileColor: 0xff6a3c,
      projectileSpeed: 0,
      buffMultiplier: 1.8,
      buffDuration: 4,
    },
  },
  {
    id: 'jangkung',
    name: 'JANGKUNG',
    typeName: 'Penyihir',
    epithet: 'Ksatria Naga Es',
    chakraMax: 160, // spek penyihir seperti Omen & Wichy
    chakraRegen: 14,
    moveSpeedMul: 1.15,
    meleeDamage: 6,
    basicCooldown: 0.38, // putaran cepat khas penyihir
    modelUrl: 'models/jangkung.glb',
    faceUrl: 'faces/jangkung.jpg',
    palette: { outfit: 0x2e5ea8, hair: 0x16283f, band: 0x7fd8ff },
    accent: '#57b8ff',
    skill: {
      name: 'Pecahan Es',
      kind: 'projectile',
      chakraCost: 10,
      damage: 6,
      cooldown: 0.7, // cast cepat seperti penyihir lain
      projectileColor: 0x7fd8ff,
      projectileSpeed: 21,
      slow: { factor: 0.5, duration: 2.5 }, // kena = gerakan lawan separuh kecepatan selama 2,5 detik
    },
  },
];
