# Server Relay Ultimate Storm (Cloudflare Worker + Durable Objects)

Relay WebSocket untuk mode online 1v1. Satu file `worker.js`, gratis di
tier Cloudflare, tidak pernah tidur.

## Deploy (sekali saja, dari Mac)

```bash
cd server
npx wrangler login
npx wrangler deploy
```

Setelah deploy, wrangler menampilkan alamat seperti:

```
https://ultimate-storm-relay.<subdomain-kamu>.workers.dev
```

## Sambungkan ke game

Alamat WebSocket-nya = alamat di atas + `/ws`, contoh:

```
wss://ultimate-storm-relay.<subdomain-kamu>.workers.dev/ws
```

Dua cara menyambungkan (pilih satu):

1. **Cepat (untuk tes)**: buka game dengan parameter
   `https://ultimate-storm.vercel.app/?server=wss://.../ws`
2. **Permanen**: di Vercel → project ultimate-storm → Settings →
   Environment Variables, tambah `VITE_WS_URL` = alamat `wss://.../ws`
   di atas, lalu redeploy project-nya.

## Cara kerja

- `Buat Room` → worker membuat kode 4 huruf → Durable Object room.
- `Gabung Room` → konek ke DO dengan kode yang sama.
- DO hanya meneruskan pesan `{t:'game', ...}` antar dua pemain;
  simulasi berjalan di browser host (host-authoritative).
