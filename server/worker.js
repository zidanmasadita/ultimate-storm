// ============================================================
// Ultimate Storm — relay server online 1v1 (Cloudflare Worker)
// ------------------------------------------------------------
// Worker menerima koneksi WebSocket dan meneruskannya ke satu
// Durable Object per room (kode room = nama DO). DO hanya memegang
// 2 soket (host & tamu) dan meneruskan pesan antar keduanya —
// simulasi game tetap berjalan di browser host (host-authoritative).
//
// Protokol:
//   client -> worker : konek ke /ws?mode=create
//                      konek ke /ws?mode=join&code=XXXX
//   server -> client : {t:'room', code}        (host: room jadi)
//                      {t:'joined'}            (tamu: berhasil masuk)
//                      {t:'peer-joined'}       (host: tamu masuk)
//                      {t:'peer-left'}         (lawan putus)
//                      {t:'error', msg}
//                      {t:'pong'}              (balasan {t:'ping'})
//   client -> client : {t:'game', kind, ...}   (diteruskan apa adanya)
// ============================================================

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I/L

function makeCode() {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  let s = '';
  for (const b of buf) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export class Room {
  constructor(state) {
    this.state = state;
  }

  hostSocket() {
    return this.state.getWebSockets('host')[0] ?? null;
  }

  guestSocket() {
    return this.state.getWebSockets('guest')[0] ?? null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/status') {
      return Response.json({ hasHost: !!this.hostSocket(), hasGuest: !!this.guestSocket() });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const role = url.searchParams.get('role');
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (role === 'host') {
      if (this.hostSocket()) {
        this.state.acceptWebSocket(server, ['dup']);
        server.send(JSON.stringify({ t: 'error', msg: 'Kode room bertabrakan, coba lagi.' }));
        server.close(4001, 'collision');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.state.acceptWebSocket(server, ['host']);
      server.send(JSON.stringify({ t: 'room', code: this.state.id.name }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (role === 'guest') {
      if (!this.hostSocket()) {
        this.state.acceptWebSocket(server, ['dup']);
        server.send(JSON.stringify({ t: 'error', msg: 'Room tidak ditemukan. Cek lagi kodenya.' }));
        server.close(4004, 'not-found');
        return new Response(null, { status: 101, webSocket: client });
      }
      if (this.guestSocket()) {
        this.state.acceptWebSocket(server, ['dup']);
        server.send(JSON.stringify({ t: 'error', msg: 'Room sudah penuh (2 pemain).' }));
        server.close(4003, 'full');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.state.acceptWebSocket(server, ['guest']);
      server.send(JSON.stringify({ t: 'joined' }));
      const host = this.hostSocket();
      if (host) {
        try { host.send(JSON.stringify({ t: 'peer-joined' })); } catch { /* host pergi */ }
      }
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('bad role', { status: 400 });
  }

  webSocketMessage(ws, message) {
    let data;
    try { data = JSON.parse(String(message)); } catch { return; }

    if (data.t === 'ping') {
      try { ws.send(JSON.stringify({ t: 'pong' })); } catch { /* abaikan */ }
      return;
    }
    if (data.t !== 'game') return;

    const tags = this.state.getTags(ws);
    const target = tags.includes('host') ? this.guestSocket() : this.hostSocket();
    if (target) {
      try { target.send(String(message)); } catch { /* lawan pergi */ }
    }
  }

  webSocketClose(ws) {
    this.notifyPeerLeft(ws);
  }

  webSocketError(ws) {
    this.notifyPeerLeft(ws);
  }

  notifyPeerLeft(ws) {
    const tags = this.state.getTags(ws);
    if (tags.includes('dup')) return;
    const other = tags.includes('host') ? this.guestSocket() : this.hostSocket();
    if (other && other !== ws) {
      try { other.send(JSON.stringify({ t: 'peer-left' })); } catch { /* abaikan */ }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response('Ultimate Storm relay OK', { status: 200 });
    }
    if (url.pathname !== '/ws' || request.headers.get('Upgrade') !== 'websocket') {
      return new Response('not found', { status: 404 });
    }

    const mode = url.searchParams.get('mode');

    if (mode === 'create') {
      for (let i = 0; i < 6; i++) {
        const code = makeCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const st = await (await stub.fetch('https://do/status')).json();
        if (!st.hasHost) {
          return stub.fetch(new Request('https://do/ws?role=host', request));
        }
      }
      return new Response('coba lagi', { status: 503 });
    }

    if (mode === 'join') {
      const code = (url.searchParams.get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 4) return new Response('kode tidak valid', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request('https://do/ws?role=guest', request));
    }

    return new Response('mode tidak dikenal', { status: 400 });
  },
};
