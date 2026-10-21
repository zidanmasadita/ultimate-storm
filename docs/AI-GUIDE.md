# AI GUIDE — Ultimate Storm

Dokumen orientasi untuk AI (atau developer) yang baru pertama kali
menyentuh proyek ini. Baca seluruhnya sebelum mengubah kode — banyak
aturan di sini lahir dari bug nyata yang sudah pernah terjadi.

Pemilik proyek: Zidan Masadita Pramudia. Komunikasi dengan pemilik
**selalu Bahasa Indonesia**, santai, dan **tanpa emoji** di chat maupun
deliverable.

---

## 1. Gambaran proyek

**Ultimate Storm** — game web pertarungan arena 3D 1v1 ala Naruto
Ninja Storm: ring melingkar, karakter chibi dari model GLB, HP +
chakra, skill unik per karakter, lawan bot berlevel kesulitan, dan
mode **online 1v1 pakai room code** (host-authoritative).

- Produksi: https://ultimate-storm.vercel.app (Vercel, auto-deploy
  dari branch `main`)
- Repo: https://github.com/zidanmasadita/ultimate-storm
- Stack: Vite 8 + TypeScript + Three.js. Tanpa framework UI. Semua
  UI (HUD, layer pilih karakter, panel) adalah HTML/CSS di
  `index.html`; logika di `src/`.
- Server online: Cloudflare Worker + Durable Objects di folder
  `server/`, sudah ter-deploy di
  `wss://ultimate-storm-relay.masadita20.workers.dev/ws`

## 2. Peta file

| File | Isi |
|---|---|
| `index.html` | Seluruh markup + CSS: HUD, layer pilih karakter (carousel kartu), panel online, layar pemenang, kontrol sentuh, overlay putar perangkat. |
| `src/main.ts` | Orkestrasi: loop game, kamera lock-on, kontrol pemain & bot, combat (applyHit/tryAttack/castSkill), proyektil, mode online (host & tamu), UI wiring. File terbesar — cari fungsi berdasarkan nama. |
| `src/game/characters.ts` | **Data roster** (sumber kebenaran karakter): tipe, statistik, skill, basic attack. |
| `src/game/character.ts` | Kelas `Fighter` (state + animasi prosedural), model chibi fallback, loader GLB. |
| `src/game/difficulty.ts` | Tabel level bot Easy–Hell (parameter pilot saja). |
| `src/game/input.ts` | Keyboard (keybind bisa diubah, tersimpan `ringfighter-keybinds-v1`) + analog & tombol sentuh. |
| `src/game/arena.ts` | Arena ring (lantai polos + rim menyala). `playRadius`, `ringTopY`. |
| `src/game/effects.ts` | Partikel burst (efek kena/cast/portal). |
| `src/game/net.ts` | Klien WebSocket mode online. |
| `server/worker.js` | Relay room (1 Durable Object per kode room). |
| `server/wrangler.toml` | Konfigurasi deploy relay (binding `ROOMS`, migrasi DO). |

## 3. Aturan keras (jangan dilanggar)

1. **Target build ES2019 — WAJIB.** Pengguna utama bermain di iPhone
   Safari < 16.4. Three.js memakai class static blocks (ES2022) yang
   membuat seluruh bundle DITOLAK saat parse di Safari lama (pernah
   menyebabkan layar hitam total berhari-hari). `vite.config.ts`
   sudah `build.target = 'es2019'`. Setelah build, verifikasi bundle
   `dist/assets/index-*.js` lolos parse ES2019 (mis. pakai acorn),
   dan hindari API runtime di atas Safari 15: `Array.prototype.at`,
   `Object.hasOwn`, `findLast`, `replaceAll`, `structuredClone`
   (catatan: `Ray.at()` adalah method Three.js, aman).
2. **Model GLB WAJIB disalin per petarung.** `Fighter.setModel`
   melakukan `clone(true)` + clone material. Satu `Object3D` hanya
   bisa punya satu induk — memakai instance cache yang sama untuk
   dua petarung (mirror pick online) membuat petarung pertama tidak
   terlihat. Jangan "optimalkan" ini.
3. **TIDAK ADA AUTO-AIM.** Proyektil (skill & basic attack Koboi)
   terbang lurus searah hadap penembak. Ini keputusan pemilik.
   Serangan putar jarak dekat memang mengenai sekeliling (visual
   360°) — itu disengaja.
4. **Karakter = data.** Menambah/mengubah karakter cukup lewat
   `characters.ts` + aset. Jangan hardcode statistik karakter di
   `main.ts`.
5. **Level kesulitan bot hanya mengatur pilot** (kecepatan mikir,
   akurasi, keberanian), tidak pernah mengubah statistik karakter.
6. **Mode online: host adalah otoritas tunggal.** Tamu tidak
   menjalankan simulasi — jangan tambahkan logika gameplay di sisi
   tamu selain mengirim input & menerapkan snapshot.
7. **Satu keluar = semua keluar.** Bila satu pemain meninggalkan
   match online (termasuk dari layar pemenang), room ditutup untuk
   keduanya. Jangan buat jalur "tetap di room sendirian" seusai
   match.
8. **Kontrol sentuh hanya tampil saat pertandingan berjalan**
   (gerbang CSS `body.touch-on.in-match`); jangan tampilkan analog/
   tombol skill di layer menu.
9. Jangan mengganti ejaan/nama yang diberikan pemilik (nama
   karakter, nama repo, dsb.) tanpa diminta.
10. Angka dari pemilik adalah otoritas; selain itu labeli sebagai
    estimasi/balancing sementara.

## 4. Sistem pertarungan

- **Dua mode**: DUEL (1v1 klasik; satu-satunya mode online saat
  ini) dan **BRAWL** (offline, 3–6 petarung, eliminasi
  last-standing per ronde, target poin dari best-of, batas ronde
  120 detik). Di BRAWL: combat generik — melee mengenai semua
  dalam radius, proyektil mengenai petarung pertama yang
  dilewati, bot memilih targetnya sendiri, plat nama+HP di atas
  kepala, klasemen berjalan di strip atas. Petarung match berjalan
  ada di daftar `fighters[]`; `player`/`enemy` hanya anggota
  tetapnya di DUEL.

- Loop: `updatePlayer`/`updateEnemy` (atau `driveRemote` online) →
  `integrate` (fisika, gravitasi, timer, regen chakra) →
  `updateProjectiles`. Semua aksi pemain lokal maupun input tamu
  melewati satu jalur: `driveFighter(f, foe, wish, mag, acts, dt)`.
- **Basic attack**: putaran jarak dekat (kena setelah 130 ms, radius
  `basicRange`), KECUALI karakter dengan `rangedBasic` (saat ini
  Koboi, tipe Projectile): tembakan lurus searah hadap.
- **Skill** (`SkillDef.kind`):
  - `projectile` — proyektil biasa (Omen: Light Shadow; Koboi: Pistol).
  - `projectile` + `displace` — Portal Wichy: musuh berpindah ke
    **arah acak** ±jarak dari titik kena (bukan knockback!).
  - `buff` — Penguatan Ryu/Ronin: damage ×`buffMultiplier` selama
    `buffDuration` detik, badan berpijar.
- **Ronde**: HP 0 → banner K.O. → kedua petarung reset posisi/HP →
  FIGHT lagi (tanpa batas di mode bot). Penjaga `roundOver` mencegah
  satu ronde berakhir dua kali.
- **Tipe karakter** (konvensi balancing):
  - *Penyihir* (Omen, Wichy): chakra besar (160, regen 14), damage
    kecil (6), cast cepat (0,7 dtk), gerak 1,15×, basic cepat 0,38.
  - *Projectile* (Koboi): chakra kecil (60, regen 5), damage skill
    besar (22), cast lambat (2,5 dtk), gerak 1,05×, basic tembakan.
  - *Fighter* (Ryu, Ronin): chakra normal (100, regen 7), melee
    besar (13/11), gerak lambat (0,85×/0,92×), basic berat
    (0,55/0,5 dtk, jangkauan 2,7), skill buff.

## 5. Menambah karakter baru (resep)

1. Aset dari pemilik: gambar karakter (PNG) + file GLB mentah
   (biasanya hasil Hunyuan3D, 13–25 MB).
2. **Slim GLB** dengan gltf-transform: `weld` lalu
   `simplify --ratio 0.28 --error 0.001` → target ±7–11 MB,
   tekstur utuh. Simpan sebagai `public/models/<id>.glb`.
3. **Foto muka**: crop area wajah dari gambar ke
   `public/faces/<id>.jpg` (kartu hanya menampilkan muka + nama).
4. Tambah **satu entri** di `CHARACTERS` (`src/game/characters.ts`):
   id, nama (kapital), typeName, spek sesuai tipe, skill, palet
   chibi (untuk fallback), `accent` (warna bingkai kartu).
5. Build, uji parse ES2019, commit, push. Karakter otomatis muncul
   di carousel, bisa dipilih bot sebagai lawan, dan tersedia online.

**Model bertulang (rigged)**: bila GLB membawa skin + klip animasi
(seperti Ryu dari Meshy AI), `Fighter` otomatis memakai jalur
AnimationMixer — status: diam = pose ikat, gerak pelan = klip
bernama *walk*, cepat = *run*, menyerang = klip *box* (potongan awal
2,2× selama 0,45 dtk). Clone model bertulang WAJIB lewat
SkeletonUtils. Gerak maju pada tulang Hips dikunci di loader
(`flattenHipsXZ`) karena posisi diatur logika game. Karakter tanpa
klip tetap prosedural; jalur dipilih per karakter dari ada/tidaknya
klip, jadi roster campuran aman.

## 6. Mode online — cara kerja

- **Relay** (`server/worker.js`): Worker menerima WebSocket di
  `/ws?mode=create` atau `/ws?mode=join&code=XXXX`, meneruskan ke
  Durable Object bernama = kode room (4 huruf, tanpa karakter
  ambigu). DO memegang tepat 2 soket (host & tamu), meneruskan
  pesan `{t:'game', kind, ...}` apa adanya ke lawan, mengirim
  `{t:'peer-left'}` saat satu putus, dan menjawab `{t:'ping'}`.
- **Host**: menjalankan simulasi penuh. Petarung tamu digerakkan
  `driveRemote` dari paket `input` tamu (30×/detik: arah gerak
  ruang-dunia `wx/wz/mag` + aksi tepi `acts[]`). Host menyiarkan
  `snap` 20×/detik: `{a: SnapF, b: SnapF, pr: [[id,x,y,z,color]]}`
  dengan `SnapF = [x,y,z,vx,vz,facing,hp,chakra,attackTimer,
  dashTimer,hitTimer,buffTimer]`, plus event `cast`/`hit`/`ko`/
  `fight` untuk efek di sisi tamu.
- **Tamu**: mengirim input saja; menggambar dari snapshot
  (interpolasi eksponensial) + proyektil cermin berdasarkan id.
  Kamera tamu mengikuti petarung kedua (`enemy`).
- **Alur room**: Buat Room → kode tampil → tamu Gabung → keduanya
  kirim `hello {name}` (username) → pilih karakter (`pick`) → host
  kirim `start {host, guest, bo, hn, gn}` → bertarung.
- **Link undangan**: selain kode, host dapat tombol BAGIKAN LINK
  UNDANGAN (share sheet/clipboard) berisi `?room=XXXX`. Yang membuka
  link cukup isi username lalu pilih karakter — otomatis bergabung
  (parameter dibersihkan dari URL setelah dipakai; ada tombol
  ABAIKAN UNDANGAN untuk yang hanya mau main vs bot).
- **Best of**: dipilih host (BO1/3/5/7, tersimpan `us-bestof`),
  disebar via `roominfo` & `start`. Pemenang ronde dari K.O. di
  host; skor disiarkan (`score`). Capai target → `matchwin` →
  **layar pemenang** (foto karakter + username + skor) di kedua
  sisi. `MAIN LAGI`: host memulai ulang langsung, tamu mengirim
  `rematch`. Tombol Ganti Karakter disembunyikan selama match dan
  muncul lagi setelah ada pemenang.
- **Username**: wajib sebelum memilih karakter di mode online;
  selama kosong kartu terkunci (grayscale, `pointer-events: none`).
  Username hanya variabel memori — refresh = hilang, memang
  disengaja. Label HUD online: `username - NAMAKARAKTER`.
- **Keterbatasan yang diketahui (v1)**: input tamu terasa delay
  sebesar RTT (belum ada prediksi/rollback); host secara teknis
  bisa curang (diterima untuk main antar teman); relay meneruskan
  tanpa validasi isi pesan game.
- **Deploy relay**: `cd server && npx wrangler deploy` (butuh login
  Cloudflare pemilik). Dashboard web TIDAK bisa membuat namespace
  Durable Object baru — migrasi hanya lewat wrangler. Alamat relay
  adalah default di `NetClient.serverUrl()`; bisa ditimpa dengan
  `?server=` di URL atau env `VITE_WS_URL`.

## 7. Performa & perangkat

- Perangkat sentuh otomatis **LIGHT_MODE** (tanpa bayangan,
  pixelRatio 1, tanpa antialias) kecuali `?full=1`. Model GLB
  dimuat di latar; selama memuat, petarung tampil sebagai chibi
  prosedural lalu ditukar saat model tiba.
- Mobile dipaksa landscape (overlay "PUTAR PERANGKATMU" saat
  portrait di perangkat sentuh).
- Total ukuran model saat ini ±34 MB untuk 5 karakter. Bila roster
  membesar, pertimbangkan memuat hanya dua model yang bertarung.

## 8. Alur kerja pengembangan

1. `npm run build` harus bersih (itu menjalankan tsc + vite).
2. Verifikasi bundle lolos parse ES2019 (aturan 1).
3. Gaya commit: `feat(scope): ringkasan` / `fix(scope): ...` dalam
   Bahasa Indonesia, menjelaskan sebab-akibat, bukan hanya "update".
4. Push ke `main` → Vercel auto-deploy. Pemilik **tidak** melakukan
   push manual; jangan menyuruhnya.
5. Untuk fitur besar: susun audit + implementation plan dulu,
   tunggu persetujuan pemilik ("gas") sebelum membangun. Untuk
   laporan bug: perbaiki dari fakta/gejala yang diberikan pemilik,
   jangan menumpuk teori — bila tidak bisa direproduksi, minta
   urutan langkah/gejala persisnya.
6. Tampilkan preview sebelum menyimpan/menyebarkan deliverable
   tertulis (dokumen, prompt, teks panjang).

## 9. Yang belum dikerjakan (backlog)

- Prediksi input sisi tamu / kompensasi lag online.
- Combat fase 2 (kombo, block, variasi animasi serangan).
- Map/ground model 3D asli dari pemilik (arena saat ini prosedural).
- Karakter berikutnya dari pemilik (ikuti resep bab 5).
