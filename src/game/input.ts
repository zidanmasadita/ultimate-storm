/**
 * Input keyboard + keybind yang bisa diatur user.
 * Gerak selalu WASD (sesuai permintaan). Aksi (lompat/dash/serang/jurus)
 * bisa di-rebind dari panel pengaturan dan tersimpan di localStorage.
 */

export type ActionId = 'jump' | 'dash' | 'attack' | 'skill';

export interface Keybinds {
  jump: string;
  dash: string;
  attack: string;
  skill: string;
}

export const ACTION_LABELS: Record<ActionId, string> = {
  jump: 'Lompat',
  dash: 'Dash',
  attack: 'Serangan',
  skill: 'Jurus (Skill)',
};

export const DEFAULT_BINDS: Keybinds = {
  jump: 'Space',
  dash: 'ShiftLeft',
  attack: 'KeyJ',
  skill: 'KeyK',
};

const STORAGE_KEY = 'ringfighter-keybinds-v1';

export function loadBinds(): Keybinds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BINDS, ...(JSON.parse(raw) as Partial<Keybinds>) };
  } catch (_) { /* abaikan */ }
  return { ...DEFAULT_BINDS };
}

export function saveBinds(binds: Keybinds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
  } catch (_) { /* abaikan */ }
}

/** Label ramah untuk KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code === 'Space') return 'SPASI';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft') return 'SHIFT KIRI';
  if (code === 'ShiftRight') return 'SHIFT KANAN';
  if (code === 'ControlLeft') return 'CTRL KIRI';
  if (code === 'ControlRight') return 'CTRL KANAN';
  if (code === 'AltLeft') return 'ALT KIRI';
  if (code === 'AltRight') return 'ALT KANAN';
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  return code.toUpperCase();
}

export class Input {
  binds: Keybinds;
  private down = new Set<string>();
  private pressedEdge = new Set<string>();
  private captureCb: ((code: string) => void) | null = null;

  /** Sumbu analog dari joystick sentuh (null = tidak aktif). */
  touchAxis: { x: number; z: number } | null = null;
  /** Aksi yang ditekan lewat tombol sentuh pada frame ini. */
  private touchPressed = new Set<ActionId>();

  constructor() {
    this.binds = loadBinds();
    window.addEventListener('keydown', (e) => {
      if (this.captureCb) {
        e.preventDefault();
        const cb = this.captureCb;
        this.captureCb = null;
        cb(e.code);
        return;
      }
      if (!e.repeat) {
        this.down.add(e.code);
        this.pressedEdge.add(e.code);
      }
      // Cegah scroll halaman untuk tombol game umum
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pressedEdge.clear();
    });
  }

  /** Mode tangkap tombol berikutnya (untuk rebind). Esc membatalkan. */
  captureNext(cb: (code: string | null) => void): void {
    this.captureCb = (code) => cb(code === 'Escape' ? null : code);
  }

  /** Sumbu gerak: WASD, atau joystick sentuh bila aktif (analog, ada magnitud). */
  moveAxis(): { x: number; z: number } {
    if (this.touchAxis && (Math.abs(this.touchAxis.x) > 0.12 || Math.abs(this.touchAxis.z) > 0.12)) {
      return this.touchAxis;
    }
    let x = 0;
    let z = 0;
    if (this.down.has('KeyW')) z -= 1;
    if (this.down.has('KeyS')) z += 1;
    if (this.down.has('KeyA')) x -= 1;
    if (this.down.has('KeyD')) x += 1;
    return { x, z };
  }

  /** Dipanggil tombol sentuh saat ditekan. */
  pressAction(action: ActionId): void {
    this.touchPressed.add(action);
  }

  isDown(action: ActionId): boolean {
    return this.down.has(this.binds[action]);
  }

  /** True sekali saat tombol aksi baru ditekan (keyboard ATAU sentuh), ter-reset tiap frame. */
  consume(action: ActionId): boolean {
    return this.pressedEdge.has(this.binds[action]) || this.touchPressed.has(action);
  }

  endFrame(): void {
    this.pressedEdge.clear();
    this.touchPressed.clear();
  }
}
