/**
 * Level kesulitan BOT — hanya mengubah "pilot" (refleks, kecepatan,
 * akurasi, keberanian), tidak mengubah statistik karakter/skill.
 * Level baru cukup ditambah sebagai satu entri di DIFFICULTIES.
 */
export interface DifficultyDef {
  id: string;
  name: string;
  /** Warna chip pemilih (CSS). */
  color: string;
  /** Interval berpikir bot (detik, acak di rentang ini). */
  thinkMin: number;
  thinkMax: number;
  /** Pengali kecepatan gerak bot terhadap pemain. */
  speedMul: number;
  /** Kecepatan bot memutar hadap (rad/detik). */
  turnRate: number;
  /** Peluang menembak skill tiap keputusan bila siap. */
  skillChance: number;
  /** Simpangan bidik maksimum (rad, ±). Makin kecil makin presisi. */
  aimError: number;
  /** Peluang dash menutup jarak saat di jendela dash. */
  dashChance: number;
  /** Laju reaksi menghindar dari proyektil (per detik; 0 = tidak pernah). */
  dodgeRate: number;
  /** Peluang lompat menghindari serangan putar saat keputusan diambil. */
  jumpChance: number;
  /** true = pukul setiap cooldown selesai; false = pakai meleeRate. */
  meleeInstant: boolean;
  /** Laju peluang memukul per detik (bila meleeInstant = false). */
  meleeRate: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'easy', name: 'EASY', color: '#59d977',
    thinkMin: 0.7, thinkMax: 1.1, speedMul: 0.55, turnRate: 5,
    skillChance: 0.25, aimError: 0.3, dashChance: 0, dodgeRate: 0,
    jumpChance: 0, meleeInstant: false, meleeRate: 1.2,
  },
  {
    id: 'normal', name: 'NORMAL', color: '#35a7ff',
    thinkMin: 0.45, thinkMax: 0.7, speedMul: 0.8, turnRate: 7,
    skillChance: 0.5, aimError: 0.18, dashChance: 0.3, dodgeRate: 2.5,
    jumpChance: 0.15, meleeInstant: false, meleeRate: 4,
  },
  {
    id: 'hard', name: 'HARD', color: '#ffb52e',
    thinkMin: 0.2, thinkMax: 0.35, speedMul: 1.0, turnRate: 10,
    skillChance: 0.85, aimError: 0.05, dashChance: 0.7, dodgeRate: 7,
    jumpChance: 0.4, meleeInstant: true, meleeRate: 0,
  },
  {
    id: 'extreme', name: 'EXTREME', color: '#ff7847',
    thinkMin: 0.12, thinkMax: 0.2, speedMul: 1.08, turnRate: 12,
    skillChance: 1, aimError: 0.025, dashChance: 0.9, dodgeRate: 12,
    jumpChance: 0.6, meleeInstant: true, meleeRate: 0,
  },
  {
    id: 'hell', name: 'HELL', color: '#c04dff',
    thinkMin: 0.06, thinkMax: 0.11, speedMul: 1.16, turnRate: 15,
    skillChance: 1, aimError: 0.008, dashChance: 1, dodgeRate: 22,
    jumpChance: 0.85, meleeInstant: true, meleeRate: 0,
  },
];
