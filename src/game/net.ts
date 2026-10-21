// ============================================================
// Klien jaringan mode online 1v1 — WebSocket ke relay Cloudflare.
// Server hanya meneruskan pesan antar dua pemain dalam satu room;
// simulasi berjalan di browser host (host-authoritative).
// ============================================================

export interface GameMsg {
  kind: string;
  [key: string]: unknown;
}

export class NetClient {
  ws: WebSocket | null = null;
  role: 'host' | 'guest' = 'host';
  code = '';
  pingMs = -1;

  onGame: (m: GameMsg) => void = () => undefined;
  onCreated: (code: string) => void = () => undefined;
  onJoined: () => void = () => undefined;
  onPeerJoined: () => void = () => undefined;
  onPeerLeft: () => void = () => undefined;
  onError: (msg: string) => void = () => undefined;
  onClose: () => void = () => undefined;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSentAt = 0;
  private dead = false;

  /** Alamat server: ?server= di URL > env VITE_WS_URL > simpanan lokal. */
  static serverUrl(): string {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const env = import.meta.env.VITE_WS_URL as string | undefined;
    if (env) return env;
    return localStorage.getItem('us-ws') ?? '';
  }

  connect(mode: 'create' | 'join', code = ''): void {
    const base = NetClient.serverUrl();
    if (!base) {
      this.onError('Server online belum dikonfigurasi.');
      return;
    }
    this.role = mode === 'create' ? 'host' : 'guest';
    const url = mode === 'create' ? `${base}?mode=create` : `${base}?mode=join&code=${encodeURIComponent(code.toUpperCase())}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('message', (ev) => {
      let d: { t?: string; [k: string]: unknown };
      try {
        d = JSON.parse(String(ev.data)) as { t?: string };
      } catch {
        return;
      }
      if (d.t === 'game') this.onGame(d as GameMsg);
      else if (d.t === 'room') {
        this.code = String(d.code ?? '');
        this.onCreated(this.code);
      } else if (d.t === 'joined') this.onJoined();
      else if (d.t === 'peer-joined') this.onPeerJoined();
      else if (d.t === 'peer-left') this.onPeerLeft();
      else if (d.t === 'error') this.onError(String(d.msg ?? 'Koneksi ditolak server.'));
      else if (d.t === 'pong') {
        if (this.pingSentAt > 0) this.pingMs = Math.round(performance.now() - this.pingSentAt);
      }
    });
    ws.addEventListener('close', () => {
      this.stopPing();
      if (!this.dead) this.onClose();
    });
    ws.addEventListener('error', () => {
      if (!this.dead) this.onError('Tidak bisa terhubung ke server online.');
    });

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pingSentAt = performance.now();
        this.ws.send(JSON.stringify({ t: 'ping' }));
      }
    }, 2000);
  }

  sendGame(kind: string, data: Record<string, unknown> = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'game', kind, ...data }));
    }
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  close(): void {
    this.dead = true;
    this.stopPing();
    try {
      this.ws?.close();
    } catch {
      /* sudah tertutup */
    }
    this.ws = null;
  }
}
