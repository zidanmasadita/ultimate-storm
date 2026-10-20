import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  // PENTING: target ES2019. Three.js memakai class static blocks (ES2022)
  // yang tidak bisa di-parse Safari < 16.4 — bundle gagal dibaca dan modul
  // mati sebelum baris pertama (gejala: layar hitam, hanya HUD HTML).
  // Target rendah memaksa bundler mengurai sintaks modern itu.
  build: { target: 'es2019' },
});
