import * as THREE from 'three';
import { buildArena } from './game/arena';
import { Fighter, chibiModel, loadFighterAsset, turnToward, type FighterAsset } from './game/character';
import { CHARACTERS, type CharacterDef, type RangedBasicDef } from './game/characters';
import { DIFFICULTIES, type DifficultyDef } from './game/difficulty';
import { Effects } from './game/effects';
import { ACTION_LABELS, ActionId, DEFAULT_BINDS, Input, keyLabel, saveBinds } from './game/input';
import { NetClient, type GameMsg } from './game/net';

// ============================================================ Jaring pengaman error
// Kegagalan apa pun ditampilkan di layar (kotak merah), bukan layar hitam diam.
const fatalEl = document.getElementById('fatal');
function showFatal(msg: string): void {
  if (fatalEl) {
    fatalEl.style.display = 'block';
    fatalEl.textContent = 'Error: ' + msg;
  }
}
window.addEventListener('error', (e) => showFatal(e.message || 'kesalahan tidak dikenal'));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as Error | string;
  showFatal(typeof r === 'string' ? r : r?.message || 'promise gagal');
});

// ============================================================ Renderer
const app = document.getElementById('app')!;
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Mode ringan: bayangan mati, tanpa tone mapping, pixelRatio 1.
// Aktif lewat ?ringan=1 atau otomatis bila renderer terbukti tidak menggambar.
// Mode ringan SEKARANG DEFAULT di perangkat sentuh: bayangan mati,
// tanpa tone mapping, pixelRatio 1, tanpa antialias — frame pertama
// harus murah supaya halaman cepat "jadi" di HP lama (Safari meredupkan
// snapshot halaman lama selama halaman baru belum selesai digambar).
// Paksa mode penuh dengan ?full=1.
const LIGHT_MODE =
  !new URLSearchParams(location.search).has('full') &&
  (isTouchDevice ||
    new URLSearchParams(location.search).has('ringan') ||
    sessionStorage.getItem('us-ringan') === '1');

// Three r163+ wajib WebGL2 — cek dulu supaya kegagalannya berupa pesan
// yang terbaca, bukan layar hitam.
if (!document.createElement('canvas').getContext('webgl2')) {
  showFatal('Browser ini tidak mendukung WebGL2, jadi adegan 3D tidak bisa digambar. Coba browser versi terbaru (Chrome/Edge/Firefox/Safari).');
  throw new Error('WebGL2 tidak tersedia');
}

const renderer = new THREE.WebGLRenderer({ antialias: !LIGHT_MODE });
renderer.setPixelRatio(LIGHT_MODE ? 1 : Math.min(window.devicePixelRatio, isTouchDevice ? 1.75 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LIGHT_MODE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = LIGHT_MODE ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);
// Konteks WebGL hilang (GPU kehabisan memori) harus bersuara, bukan diam.
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  showFatal('Konteks WebGL hilang — GPU kehabisan memori atau driver bermasalah. Coba tutup aplikasi lain lalu refresh.');
});

const scene = new THREE.Scene();
// Latar paksa: bila semua mesh gagal digambar pun, canvas menunjukkan
// warna ini — canvas yang tetap hitam berarti pipeline GL tidak menggambar.
scene.background = new THREE.Color(0x2a2138);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 6, 14);

const arena = buildArena(scene, { shadowMapSize: isTouchDevice ? 1024 : 2048 });
const effects = new Effects(scene);
const input = new Input();

// ============================================================ Petarung
const SPAWN_1 = new THREE.Vector3(-6, arena.ringTopY, 0);
const SPAWN_2 = new THREE.Vector3(6, arena.ringTopY, 0);

// Petarung dibuka instan sebagai chibi; model GLB semua karakter roster
// dimuat di latar dan ditukar masuk sesuai pilihan di layer karakter.
const player = new Fighter(chibiModel(CHARACTERS[0].palette));
const enemy = new Fighter(chibiModel(CHARACTERS[1].palette));
player.reset(SPAWN_1, Math.PI / 2);
enemy.reset(SPAWN_2, -Math.PI / 2);
scene.add(player.group, enemy.group);

const modelCache = new Map<string, FighterAsset>();
/** Pasang aset ke petarung: model bertulang memakai jalur klip animasi. */
function installAsset(f: Fighter, a: FighterAsset): void {
  if (a.animations.length > 0) f.setModelRigged(a.root, a.animations);
  else f.setModel(a.root);
}
for (const c of CHARACTERS) {
  loadFighterAsset(c.modelUrl, c.palette).then((a) => {
    modelCache.set(c.id, a);
    if (player.charId === c.id) installAsset(player, a);
    if (enemy.charId === c.id) installAsset(enemy, a);
  });
}

// ============================================================ HUD & panel
const $ = (id: string) => document.getElementById(id)!;
const hp1El = $('hp1');
const ck1El = $('ck1');
const hp2El = $('hp2');
const ck2El = $('ck2');
const bannerEl = $('banner');
const hintsEl = $('hints');

let bannerTimer = 0;
function showBanner(text: string, seconds: number): void {
  bannerEl.textContent = text;
  bannerEl.classList.add('show');
  bannerTimer = seconds;
}

function renderHints(): void {
  const b = input.binds;
  hintsEl.innerHTML =
    `<b>W A S D</b> Gerak &nbsp; <b>${keyLabel(b.jump)}</b> Lompat &nbsp; <b>${keyLabel(b.dash)}</b> Dash<br>` +
    `<b>${keyLabel(b.attack)}</b> Serangan &nbsp; <b>${keyLabel(b.skill)}</b> ${player.skill.name}`;
}

const rowsEl = $('bind-rows');
let listeningAction: ActionId | null = null;

function renderBindRows(): void {
  rowsEl.innerHTML = '';
  (Object.keys(ACTION_LABELS) as ActionId[]).forEach((action) => {
    const row = document.createElement('div');
    row.className = 'row';

    const name = document.createElement('div');
    name.className = 'act';
    name.textContent = ACTION_LABELS[action];

    const keyWrap = document.createElement('div');
    keyWrap.className = 'key';

    const kbd = document.createElement('div');
    kbd.className = 'kbd' + (listeningAction === action ? ' listening' : '');
    kbd.textContent = listeningAction === action ? 'tekan tombol...' : keyLabel(input.binds[action]);

    const btn = document.createElement('button');
    btn.className = 'mini';
    btn.textContent = 'Ubah';
    btn.addEventListener('click', () => {
      listeningAction = action;
      renderBindRows();
      input.captureNext((code) => {
        listeningAction = null;
        if (code) {
          // Hindari duplikat: tombol yang sama untuk aksi lain ditukar
          (Object.keys(input.binds) as ActionId[]).forEach((other) => {
            if (other !== action && input.binds[other] === code) {
              input.binds[other] = input.binds[action];
            }
          });
          input.binds[action] = code;
          saveBinds(input.binds);
        }
        renderBindRows();
        renderHints();
      });
    });

    keyWrap.append(kbd, btn);
    row.append(name, keyWrap);
    rowsEl.appendChild(row);
  });
}

$('btn-settings').addEventListener('click', () => {
  $('settings').classList.add('open');
  renderBindRows();
});
$('btn-close-settings').addEventListener('click', () => $('settings').classList.remove('open'));
$('btn-reset-binds').addEventListener('click', () => {
  input.binds = { ...DEFAULT_BINDS };
  saveBinds(input.binds);
  renderBindRows();
  renderHints();
});
renderHints();

// ============================================================ Jurus (proyektil — placeholder fase environment)
interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  owner: Fighter;
  /** Korban terkunci, atau null = mengenai petarung mana pun yang dilewati. */
  target: Fighter | null;
  damage: number;
  color: number;
  displace: number;
  /** Efek lambat yang dibawa proyektil ini (null = tidak ada). */
  slow: { factor: number; duration: number } | null;
  /** Skala visual mesh (skill = besar, basic = 1). */
  scale: number;
  id: number;
}
let projSeq = 0;
const projectiles: Projectile[] = [];
const projGeo = new THREE.SphereGeometry(0.22, 16, 12);
const basicGeo = new THREE.SphereGeometry(0.15, 12, 10);

/** Lahirkan satu proyektil (dipakai skill & basic attack jarak jauh). */
/**
 * Basic attack jarak jauh EFEKTIF seorang karakter:
 * - `rangedBasic` eksplisit di data karakter selalu menang.
 * - Tipe Projectile: tembakan ringan turunan skill (damage ±22%
 *   skill, tanpa chakra, jeda cepat). Skill tetap tembakan
 *   beratnya — damage besar, pakai chakra, jeda lama, proyektil
 *   BESAR.
 * - Tipe Penyihir: lemparan sihir kecil (damage 50% skill — skill
 *   penyihir memang ringan), TANPA efek khusus skill (Portal/slow
 *   hanya milik skill), jeda mengikuti basicCooldown cepatnya.
 * - Tipe lain: null (basic melee).
 */
function effectiveRangedBasic(c: CharacterDef): RangedBasicDef | null {
  if (c.rangedBasic) return c.rangedBasic;
  if (c.skill.kind !== 'projectile') return null;
  if (c.typeName === 'Projectile') {
    return {
      damage: Math.max(2, Math.round(c.skill.damage * 0.22)),
      projectileSpeed: Math.max(18, Math.round(c.skill.projectileSpeed * 0.9)),
      color: c.skill.projectileColor,
    };
  }
  if (c.typeName === 'Penyihir') {
    return {
      damage: Math.max(3, Math.round(c.skill.damage * 0.5)),
      projectileSpeed: Math.round(c.skill.projectileSpeed * 1.1),
      color: c.skill.projectileColor,
    };
  }
  return null;
}

function spawnProjectile(owner: Fighter, target: Fighter | null, start: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, color: number, geo: THREE.BufferGeometry, displace = 0, slow: { factor: number; duration: number } | null = null, scale = 1): void {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  mesh.position.copy(start);
  mesh.scale.setScalar(scale);
  scene.add(mesh);
  projectiles.push({ mesh, vel: dir.clone().multiplyScalar(speed), life: 2.2, owner, target, damage, color, displace, slow, scale, id: ++projSeq });
}

// ============================================================ Kontrol sentuh (mobile)
// Tampilkan UI sentuh begitu ada sentuhan pertama terdeteksi.
window.addEventListener('touchstart', () => document.body.classList.add('touch-on'), { once: true });

const stickBase = $('stick-base');
const stickKnob = $('stick-knob');
const STICK_RADIUS = 44;
let stickPointerId: number | null = null;

function stickMove(e: PointerEvent): void {
  const rect = stickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > STICK_RADIUS) {
    dx *= STICK_RADIUS / len;
    dy *= STICK_RADIUS / len;
  }
  stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  input.touchAxis = { x: dx / STICK_RADIUS, z: dy / STICK_RADIUS };
}

function stickEnd(): void {
  stickPointerId = null;
  stickKnob.style.transform = 'translate(-50%,-50%)';
  input.touchAxis = null;
}

stickBase.addEventListener('pointerdown', (e) => {
  stickPointerId = e.pointerId;
  stickBase.setPointerCapture(e.pointerId);
  stickMove(e);
  e.preventDefault();
});
stickBase.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickPointerId) stickMove(e);
});
stickBase.addEventListener('pointerup', stickEnd);
stickBase.addEventListener('pointercancel', stickEnd);

function bindTouchButton(id: string, action: ActionId): void {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.pressAction(action);
  });
}
bindTouchButton('btn-atk', 'attack');
bindTouchButton('btn-skill', 'skill');
bindTouchButton('btn-dash', 'dash');
bindTouchButton('btn-jump', 'jump');

// Tombol layar penuh di gerbang putar: minta fullscreen lalu kunci
// orientasi landscape (Android Chrome mendukung; iOS mengabaikan
// dengan aman — pengguna iOS cukup memutar perangkatnya).
$('btn-fullscreen').addEventListener('click', async () => {
  try {
    await document.documentElement.requestFullscreen();
    const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* tidak didukung / ditolak — gerbang putar CSS tetap berlaku */
  }
});

function castSkill(caster: Fighter, aimError = 0): void {
  const sk = caster.skill;
  if (caster.skillCooldown > 0 || caster.chakra < sk.chakraCost) return;
  caster.chakra -= sk.chakraCost;
  caster.skillCooldown = sk.cooldown;

  // Skill BUFF: perkuat damage diri sendiri sementara (tanpa proyektil)
  if (sk.kind === 'buff') {
    caster.buffTimer = sk.buffDuration ?? 4;
    caster.buffMul = sk.buffMultiplier ?? 1.5;
    const c = caster.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    effects.burst(c, sk.projectileColor, 30, 4.5, 0.5, 0.16);
    if (netRole === 'host' && net) net.sendGame('cast', { x: c.x, y: c.y, z: c.z, c: sk.projectileColor });
    return;
  }

  const start = caster.pos.clone().add(new THREE.Vector3(0, 1.35, 0));

  // TANPA auto-aim: proyektil terbang lurus mengikuti arah hadap
  // penembak. Pemain harus menghadapkan karakter sendiri ke musuh.
  // (Bot diberi aimError kecil supaya tembakannya bisa dihindari.)
  const aim = caster.facing + aimError;
  const dir = new THREE.Vector3(Math.sin(aim), 0, Math.cos(aim));
  // Proyektil SKILL digambar BESAR (1,9x) agar jelas berbeda dari
  // tembakan basic yang kecil & ringan.
  spawnProjectile(caster, null, start, dir, sk.projectileSpeed, sk.damage, sk.projectileColor, projGeo, sk.displace ?? 0, sk.slow ?? null, 1.9);
  effects.burst(start, sk.projectileColor, 14, 3, 0.35, 0.12);
  if (netRole === 'host' && net) net.sendGame('cast', { x: start.x, y: start.y, z: start.z, c: sk.projectileColor });
}

function updateProjectiles(dt: number): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    effects.burst(p.mesh.position, p.color, 2, 0.6, 0.3, 0.1);

    // Korban: petarung pertama (selain penembak) yang dilewati
    // proyektil — di DUEL praktisnya satu-satunya musuh.
    let victim: Fighter | null = null;
    for (const f of fighters) {
      if (f === p.owner || !f.alive) continue;
      const tp = f.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
      if (p.mesh.position.distanceTo(tp) < 1.05) {
        victim = f;
        break;
      }
    }
    const hit = victim !== null;
    if (hit || p.life <= 0) {
      effects.burst(p.mesh.position, p.color, 30, 6, 0.55, 0.16);
      if (hit && victim && p.slow) {
        // ES JANGKUNG: gerakan korban melambat sementara.
        victim.slowTimer = p.slow.duration;
        victim.slowFactor = p.slow.factor;
        effects.burst(victim.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0x7fd8ff, 20, 3.5, 0.45, 0.13);
      }
      if (hit && victim && p.displace > 0) {
        // PORTAL: musuh langsung berpindah tempat ke ARAH ACAK di
        // sekitar titik kena (bukan knockback searah tembakan),
        // tetap di dalam ring.
        const before = victim.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        const ang = Math.random() * Math.PI * 2;
        const distP = p.displace * (0.75 + Math.random() * 0.5);
        victim.pos.x += Math.sin(ang) * distP;
        victim.pos.z += Math.cos(ang) * distP;
        const r = Math.hypot(victim.pos.x, victim.pos.z);
        if (r > arena.playRadius) {
          victim.pos.x *= arena.playRadius / r;
          victim.pos.z *= arena.playRadius / r;
        }
        victim.vel.multiplyScalar(0.25);
        effects.burst(before, p.color, 22, 4, 0.4, 0.14);
        effects.burst(victim.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), p.color, 22, 4, 0.4, 0.14);
        applyHit(victim, p.owner, p.damage, 1.5);
      } else if (hit && victim) {
        applyHit(victim, p.owner, p.damage, 7);
      }
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      projectiles.splice(i, 1);
    }
  }
}

// ============================================================ Pertarungan dasar (placeholder — sistem penuh di fase combat)
let shake = 0;

function applyHit(victim: Fighter, attacker: Fighter, damage: number, knock: number): void {
  // Buff penguatan memperbesar semua damage penyerang selama aktif
  if (attacker.buffTimer > 0) damage *= attacker.buffMul;
  victim.hp = Math.max(0, victim.hp - damage);
  victim.hitTimer = 0.22;
  const away = victim.pos.clone().sub(attacker.pos);
  away.y = 0;
  if (away.lengthSq() > 0.001) {
    away.normalize();
    victim.knockback.addScaledVector(away, knock);
  }
  const chest = victim.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
  effects.burst(chest, 0xffa347, 24, 5.5, 0.45, 0.15);
  shake = Math.min(shake + 0.22, 0.4);
  if (netRole === 'host' && net) net.sendGame('hit', { x: chest.x, y: chest.y, z: chest.z });

  if (victim.hp <= 0 && victim.alive) {
    victim.alive = false;
    victim.downT = 0;
    if (gameMode === 'brawl' && !net) {
      // BRAWL: gugur dari ronde; ronde berlanjut sampai sisa satu.
      onBrawlDown(victim);
    } else if (!roundOver) {
      roundOver = true;
      showBanner('K.O.!', 1.6);
      if (netRole === 'host' && net) {
        net.sendGame('ko', {});
        onlineRoundEnd(victim);
      } else {
        setTimeout(resetRound, 1600);
      }
    }
  }
}

/** Reset posisi/HP kedua petarung untuk ronde berikutnya. */
function resetRound(): void {
  player.reset(SPAWN_1, Math.PI / 2);
  enemy.reset(SPAWN_2, -Math.PI / 2);
  roundOver = false;
  showBanner('FIGHT!', 0.9);
  if (netRole === 'host' && net) net.sendGame('fight', {});
}

/** Host online: catat pemenang ronde, siarkan skor, putuskan match. */
function onlineRoundEnd(victim: Fighter): void {
  if (!net) return;
  const winner: 'host' | 'guest' = victim === enemy ? 'host' : 'guest';
  if (winner === 'host') roundsHost++;
  else roundsGuest++;
  net.sendGame('score', { h: roundsHost, g: roundsGuest });
  updateScoreLabel();
  if (roundsHost >= matchTarget || roundsGuest >= matchTarget) {
    matchDecided = true;
    setTimeout(() => {
      if (!net) return;
      net.sendGame('matchwin', { winner, h: roundsHost, g: roundsGuest });
      decideWinner(winner);
    }, 1700);
  } else {
    setTimeout(resetRound, 1600);
  }
}

/** Match selesai: hentikan simulasi, tampilkan layar pemenang. */
function decideWinner(winner: 'host' | 'guest'): void {
  matchStarted = false;
  showWinnerScreen(winner);
  // Tombol ganti karakter boleh muncul lagi setelah ada pemenang
  $('btn-chars').style.display = '';
}

function showWinnerScreen(winner: 'host' | 'guest'): void {
  const wc = winner === 'host' ? curHostChar : curGuestChar;
  const wn = winner === 'host' ? hostUser : guestUser;
  if (!wc) return;
  ($('ws-img') as HTMLImageElement).src = wc.faceUrl;
  $('ws-name').textContent = wn.toUpperCase();
  $('ws-char').textContent = `${wc.name} · ${wc.typeName}`;
  $('ws-score').textContent = `SKOR ${roundsHost} — ${roundsGuest} · BEST OF ${matchBo}`;
  $('winner-screen').classList.add('open');
}

function updateScoreLabel(): void {
  $('net-score').textContent = `BO${matchBo} · ${roundsHost} — ${roundsGuest}`;
}

function tryAttack(attacker: Fighter): void {
  if (attacker.attackCooldown > 0) return;
  attacker.attackTimer = 0.35;
  attacker.attackCooldown = attacker.basicCooldown;

  // Basic attack JARAK JAUH (tipe Projectile): tembakan lurus searah
  // hadap, tanpa auto-aim. Damage per tembakan lebih kecil dari
  // pukulan, ditukar jangkauan jauh.
  const rb = attacker.rangedBasic;
  if (rb) {
    const dir = new THREE.Vector3(Math.sin(attacker.facing), 0, Math.cos(attacker.facing));
    const start = attacker.pos.clone().addScaledVector(dir, 0.7).add(new THREE.Vector3(0, 1.3, 0));
    spawnProjectile(attacker, null, start, dir, rb.projectileSpeed, rb.damage, rb.color, basicGeo);
    effects.burst(start, rb.color, 6, 2, 0.2, 0.08);
    if (netRole === 'host' && net) net.sendGame('cast', { x: start.x, y: start.y, z: start.z, c: rb.color });
    return;
  }

  // Putaran serangan: mengenai SEMUA lawan dalam jangkauan (di DUEL
  // praktisnya satu musuh; di BRAWL bisa banyak sekaligus)
  setTimeout(() => {
    for (const v of fighters) {
      if (v === attacker || !v.alive) continue;
      if (attacker.pos.distanceTo(v.pos) < attacker.basicRange) applyHit(v, attacker, attacker.meleeDamage, 5);
    }
  }, 130);
}

// ============================================================ AI musuh (level kesulitan dari difficulty.ts)
// ============================================================ Mode permainan
// DUEL = 1v1 klasik. BRAWL = sampai 6 petarung sekaligus, eliminasi
// last-standing per ronde; poin ronde menentukan juara match.
type GameMode = 'duel' | 'brawl';
let gameMode: GameMode = localStorage.getItem('us-mode') === 'brawl' ? 'brawl' : 'duel';
let brawlCount = Math.min(6, Math.max(3, Number(localStorage.getItem('us-brawl-count') ?? 4) || 4));
/** Semua petarung di match berjalan (DUEL: [player, enemy]). */
let fighters: Fighter[] = [player, enemy];
/** Petarung ekstra mode BRAWL (dibuat per match, dibuang setelahnya). */
const extraFighters: Fighter[] = [];
let brawlTimer = 0;
let brawlRound = 0;
let brawlPick: CharacterDef | null = null;
let lastStripSecond = -1;
/** Arah & tinggi kamera manual BRAWL (digeser pemain, tanpa otomatis). */
let brawlYaw = 0;
let brawlElev = 3.4;

// Geser layar/mouse di area kosong = putar kamera BRAWL mengelilingi
// pemain. Sentuhan pada analog/tombol adalah elemen DOM di atas
// canvas sehingga tidak pernah sampai ke pendengar ini.
{
  const el = renderer.domElement;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  el.addEventListener('pointerdown', (e) => {
    if (gameMode !== 'brawl' || net || !matchStarted) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {
      /* abaikan */
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    brawlYaw -= dx * 0.0048;
    brawlElev = THREE.MathUtils.clamp(brawlElev + dy * 0.02, 1.4, 6.2);
  });
  const stop = () => {
    dragging = false;
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

function aliveOthers(f: Fighter): Fighter[] {
  return fighters.filter((x) => x !== f && x.alive);
}

function nearestFoe(f: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bd = Infinity;
  for (const o of aliveOthers(f)) {
    const d = f.pos.distanceTo(o.pos);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Musuh utama untuk kamera & lock-on pemain (BRAWL: yang terdekat). */
function mainFoe(): Fighter {
  return gameMode === 'brawl' && !net ? (nearestFoe(player) ?? enemy) : enemy;
}
let botDiff: DifficultyDef =
  DIFFICULTIES.find((d) => d.id === localStorage.getItem('us-difficulty')) ?? DIFFICULTIES[2];

function botDash(f: Fighter, dir: THREE.Vector3): void {
  f.dashTimer = 0.18;
  f.dashCooldown = 0.85;
  f.vel.copy(dir.clone().normalize().multiplyScalar(17));
  effects.burst(f.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xffc9a3, 16, 2.5, 0.35, 0.12);
}

function updateBot(enemy: Fighter, dt: number): void {
  if (!enemy.alive) return;
  // Target: yang dipilih bot & masih hidup; selain itu musuh terdekat.
  let player = enemy.botTarget;
  if (!player || !player.alive || !fighters.includes(player)) {
    player = nearestFoe(enemy);
    enemy.botTarget = player;
  }
  if (!player) return;
  const dist = enemy.pos.distanceTo(player.pos);
  const toPlayer = player.pos.clone().sub(enemy.pos);
  toPlayer.y = 0;
  const toPlayerAng = Math.atan2(toPlayer.x, toPlayer.z);

  // Selalu hadap pemain (skill mengikuti hadap; kecepatan putar per level)
  enemy.facing = turnToward(enemy.facing, toPlayerAng, dt * botDiff.turnRate);

  // --- Menghindar: proyektil lawan mendekat -> dash menyamping
  if (botDiff.dodgeRate > 0 && enemy.dashCooldown <= 0) {
    for (const p of projectiles) {
      if (p.owner === enemy) continue;
      const toBot = enemy.pos.clone().sub(p.mesh.position);
      toBot.y = 0;
      if (toBot.length() < 5.2 && Math.random() < dt * botDiff.dodgeRate) {
        const pv = p.vel.clone();
        pv.y = 0;
        pv.normalize();
        botDash(enemy, new THREE.Vector3(-pv.z, 0, pv.x).multiplyScalar(enemy.botStrafe));
        break;
      }
    }
  }

  // --- Keputusan berkala (kecepatannya diatur level kesulitan)
  enemy.botThink -= dt;
  if (enemy.botThink <= 0) {
    enemy.botThink = botDiff.thinkMin + Math.random() * (botDiff.thinkMax - botDiff.thinkMin);
    if (Math.random() < 0.3) enemy.botStrafe = -enemy.botStrafe;
    if (enemy.hp <= 30 && Math.random() < 0.35) enemy.botMode = 'retreat';
    else if (dist <= 3.4 && Math.random() < 0.45) enemy.botMode = 'strafe';
    else enemy.botMode = 'chase';

    // Kadang ganti target (keramaian tidak monoton): utamakan HP terendah
    if (Math.random() < 0.3) {
      const others = aliveOthers(enemy);
      if (others.length > 1) {
        others.sort((a, b) => a.hp - b.hp);
        enemy.botTarget = Math.random() < 0.6 ? others[0] : others[Math.floor(Math.random() * others.length)];
      }
    }

    // Dash menutup jarak dari menengah
    if (botDiff.dashChance > 0 && dist > 4.5 && dist < 10.5 && enemy.dashCooldown <= 0 && Math.random() < botDiff.dashChance) {
      botDash(enemy, toPlayer);
    }
    // Tembak skill bila siap & tidak sedang dash (jitter bidik per level)
    if (
      enemy.dashTimer <= 0 &&
      enemy.skillCooldown <= 0 &&
      enemy.chakra >= enemy.skill.chakraCost &&
      (enemy.skill.kind === 'buff' ? dist < 9 : dist < 15) &&
      Math.random() < botDiff.skillChance
    ) {
      castSkill(enemy, (Math.random() * 2 - 1) * botDiff.aimError);
    }
    // Kadang lompat menghindari serangan putar pemain
    if (player.attackTimer > 0 && dist < 3.2 && enemy.grounded && Math.random() < botDiff.jumpChance) {
      enemy.vy = 9.2;
      enemy.grounded = false;
    }
  }

  // --- Gerakan sesuai mode (kecepatan diskalakan per level)
  const desired = new THREE.Vector3();
  if (enemy.dashTimer <= 0) {
    if (enemy.botMode === 'chase') {
      if (dist > 2.1) desired.copy(toPlayer.clone().normalize().multiplyScalar(WALK_SPEED * botDiff.speedMul * enemy.moveSpeedMul));
    } else if (enemy.botMode === 'strafe') {
      const tangent = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(enemy.botStrafe * 5 * botDiff.speedMul);
      const inward = toPlayer.clone().normalize().multiplyScalar(dist > 3.4 ? 2 : -1);
      desired.copy(tangent).add(inward);
    } else {
      desired.copy(toPlayer.clone().normalize().multiplyScalar(-WALK_SPEED * botDiff.speedMul * enemy.moveSpeedMul));
    }
    // Efek lambat memperlambat seluruh vektor gerak yang diinginkan
    if (enemy.slowTimer > 0) desired.multiplyScalar(enemy.slowFactor);
    steer(enemy, desired, dt);
  }

  // --- Serangan (jarak dekat, atau tembakan untuk tipe Projectile)
  const atkRange = enemy.rangedBasic ? 15 : 2.5;
  if (dist < atkRange) {
    if (botDiff.meleeInstant) {
      if (enemy.attackCooldown <= 0) tryAttack(enemy);
    } else if (Math.random() < dt * botDiff.meleeRate) {
      tryAttack(enemy);
    }
  }
}

// ============================================================ Gerak generik
const GRAVITY = 24;
const WALK_SPEED = 6.4;

function steer(f: Fighter, desired: THREE.Vector3, dt: number): void {
  const accel = f.grounded ? 14 : 4;
  f.vel.x = THREE.MathUtils.damp(f.vel.x, desired.x, accel, dt);
  f.vel.z = THREE.MathUtils.damp(f.vel.z, desired.z, accel, dt);
}

function integrate(f: Fighter, dt: number): void {
  // Knockback meluruh
  f.knockback.multiplyScalar(Math.max(1 - dt * 6, 0));

  f.pos.x += (f.vel.x + f.knockback.x) * dt;
  f.pos.z += (f.vel.z + f.knockback.z) * dt;

  // Gravitasi & lompat
  f.vy -= GRAVITY * dt;
  f.pos.y += f.vy * dt;
  if (f.pos.y <= arena.ringTopY) {
    f.pos.y = arena.ringTopY;
    f.vy = 0;
    f.grounded = true;
  } else {
    f.grounded = false;
  }

  // Batas ring
  const r = Math.hypot(f.pos.x, f.pos.z);
  if (r > arena.playRadius) {
    f.pos.x *= arena.playRadius / r;
    f.pos.z *= arena.playRadius / r;
  }

  // Timer
  f.attackTimer = Math.max(0, f.attackTimer - dt);
  f.attackCooldown = Math.max(0, f.attackCooldown - dt);
  f.dashTimer = Math.max(0, f.dashTimer - dt);
  f.dashCooldown = Math.max(0, f.dashCooldown - dt);
  f.skillCooldown = Math.max(0, f.skillCooldown - dt);
  f.buffTimer = Math.max(0, f.buffTimer - dt);
  f.slowTimer = Math.max(0, f.slowTimer - dt);
  f.hitTimer = Math.max(0, f.hitTimer - dt);
  f.chakra = Math.min(f.chakraMax, f.chakra + f.chakraRegen * dt);

  const speed2D = Math.hypot(f.vel.x, f.vel.z);
  f.animate(dt, perfTime, speed2D);
}

// ============================================================ Kontrol pemain
/** Aksi tepi (edge) untuk satu frame: dari input lokal atau paket jaringan. */
interface DriveActs {
  dash: boolean;
  jump: boolean;
  attack: boolean;
  skill: boolean;
}

/**
 * Jalankan satu petarung dari arah ingin (ruang dunia) + aksi.
 * Dipakai pemain lokal (input sendiri) DAN musuh online (input tamu
 * dari jaringan, di host) — satu jalur logika untuk keduanya.
 */
function driveFighter(f: Fighter, foe: Fighter, wish: THREE.Vector3, axisMag: number, acts: DriveActs, dt: number): void {
  const moving = wish.lengthSq() > 0.001;

  // Dash
  if (acts.dash && f.dashCooldown <= 0) {
    f.dashTimer = 0.18;
    f.dashCooldown = 0.85;
    const dir = moving ? wish.clone() : new THREE.Vector3(Math.sin(f.facing), 0, Math.cos(f.facing));
    f.vel.copy(dir.multiplyScalar(17));
    effects.burst(f.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 0x9fc1ff, 16, 2.5, 0.35, 0.12);
  }

  const speed = f.dashTimer > 0 ? 17 : WALK_SPEED * f.moveSpeedMul * axisMag * (f.slowTimer > 0 ? f.slowFactor : 1);
  const desired = moving ? wish.clone().multiplyScalar(speed) : new THREE.Vector3();
  if (f.dashTimer <= 0) steer(f, desired, dt);

  if (gameMode === 'brawl' && !net && f === player) {
    // BRAWL: arah hadap pemain dikunci ke arah kamera manual
    // (gaya shift lock) — memutar kamera = memutar badan, arah
    // serangan, dan arah skill.
    f.facing = brawlYaw;
  } else if (moving && f.dashTimer <= 0) {
    f.facing = turnToward(f.facing, Math.atan2(wish.x, wish.z), dt * 11);
  } else if (!(gameMode === 'brawl' && !net)) {
    const toFoe = Math.atan2(foe.pos.x - f.pos.x, foe.pos.z - f.pos.z);
    f.facing = turnToward(f.facing, toFoe, dt * 8);
  }

  // Lompat
  if (acts.jump && f.grounded) {
    f.vy = 9.2;
    f.grounded = false;
  }

  // Serangan & jurus
  if (acts.attack) tryAttack(f);
  if (acts.skill) castSkill(f);
}

function updatePlayer(dt: number): void {
  const axis = input.moveAxis();
  // Arah kamera di bidang tanah (untuk gerak relatif kamera)
  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);
  camFwd.y = 0;
  camFwd.normalize();
  const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).negate();

  const wish = new THREE.Vector3()
    .addScaledVector(camFwd, -axis.z)
    .addScaledVector(camRight, -axis.x);
  if (wish.lengthSq() > 0.001) wish.normalize();
  // Magnitud analog: dorongan kecil pada joystick = jalan pelan (keyboard selalu 1)
  const axisMag = Math.min(1, Math.hypot(axis.x, axis.z));

  driveFighter(player, mainFoe(), wish, axisMag, {
    dash: input.consume('dash'),
    jump: input.consume('jump'),
    attack: input.consume('attack'),
    skill: input.consume('skill'),
  }, dt);
}

// ============================================================ Kamera lock-on ala Storm
const camPos = new THREE.Vector3(0, 5.5, 13);
function updateCamera(dt: number): void {
  // Di mode online tamu, "aku" adalah petarung kedua (enemy).
  const me = netRole === 'guest' ? enemy : player;
  // BRAWL: kamera mengunci musuh terdekat dari si pemain.
  const foe = netRole === 'guest' ? player : gameMode === 'brawl' && !net ? (nearestFoe(me) ?? enemy) : enemy;

  // BRAWL (pemain masih hidup): kamera MANUAL penuh — orbit
  // mengikuti brawlYaw/brawlElev yang digeser pemain, titik pandang
  // ke depan arah kamera. Tidak ada kamera otomatis di mode ini.
  // (Bila pemain sudah gugur, jatuh ke kamera penonton biasa di
  // bawah yang membingkai musuh terdekat.)
  if (gameMode === 'brawl' && !net && me.alive) {
    const back = new THREE.Vector3(Math.sin(brawlYaw), 0, Math.cos(brawlYaw));
    const behind = me.pos.clone().addScaledVector(back, -7.6).add(new THREE.Vector3(0, brawlElev, 0));
    behind.y = Math.max(behind.y, arena.ringTopY + 1.1);
    camPos.x = THREE.MathUtils.damp(camPos.x, behind.x, 18, dt);
    camPos.y = THREE.MathUtils.damp(camPos.y, behind.y, 18, dt);
    camPos.z = THREE.MathUtils.damp(camPos.z, behind.z, 18, dt);
    camera.position.copy(camPos);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.4);
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    }
    const look = me.pos.clone().addScaledVector(back, 3.2).add(new THREE.Vector3(0, 1.35, 0));
    camera.lookAt(look);
    return;
  }

  const toEnemy = foe.pos.clone().sub(me.pos);
  toEnemy.y = 0;
  const dist = Math.max(toEnemy.length(), 0.001);
  toEnemy.normalize();

  const behind = me.pos.clone().addScaledVector(toEnemy, -7.6).add(new THREE.Vector3(0, 3.4, 0));
  behind.y = Math.max(behind.y, arena.ringTopY + 1.4);
  camPos.x = THREE.MathUtils.damp(camPos.x, behind.x, 5, dt);
  camPos.y = THREE.MathUtils.damp(camPos.y, behind.y, 5, dt);
  camPos.z = THREE.MathUtils.damp(camPos.z, behind.z, 5, dt);

  camera.position.copy(camPos);
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.4);
    camera.position.x += (Math.random() - 0.5) * shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
  }
  const mid = me.pos.clone().add(foe.pos).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.35, 0));
  // Geser titik pandang sedikit ke arah musuh mengikuti jarak
  mid.addScaledVector(toEnemy, Math.min(dist * 0.12, 1.2));
  camera.lookAt(mid);
}

// ============================================================ Pilih karakter
// Layer awal: pertandingan tidak mulai sampai pemain memilih. Musuh =
// karakter lain (acak bila roster > 2). Karakter baru di characters.ts
// otomatis muncul di sini.
let matchStarted = false;

function applyCharacter(f: Fighter, c: CharacterDef): void {
  f.charId = c.id;
  f.displayName = c.name;
  f.skill = c.skill;
  f.chakraMax = c.chakraMax;
  f.chakraRegen = c.chakraRegen;
  f.moveSpeedMul = c.moveSpeedMul;
  f.meleeDamage = c.meleeDamage;
  f.basicCooldown = c.basicCooldown ?? 0.45;
  f.basicRange = c.basicRange ?? 2.5;
  f.rangedBasic = effectiveRangedBasic(c);
  const a = modelCache.get(c.id);
  if (a) installAsset(f, a);
  else f.setModel(chibiModel(c.palette));
}

function startMatch(pick: CharacterDef): void {
  if (gameMode === 'brawl' && !net) {
    startBrawl(pick);
    return;
  }
  clearBrawl();
  fighters = [player, enemy];
  const others = CHARACTERS.filter((c) => c.id !== pick.id);
  const foe = others[Math.floor(Math.random() * others.length)] ?? pick;
  roundOver = false;
  applyCharacter(player, pick);
  applyCharacter(enemy, foe);
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  player.reset(SPAWN_1, Math.PI / 2);
  enemy.reset(SPAWN_2, -Math.PI / 2);
  matchStarted = true;
  $('char-select').classList.remove('open');
  $('name1').textContent = `${pick.name} · ${pick.typeName}`;
  $('name2').textContent = `${foe.name} · ${foe.typeName}`;
  renderBindRows();
  const tbLabel = document.querySelector('#tb-skill .tb-label');
  if (tbLabel) tbLabel.textContent = pick.skill.name.toUpperCase();
  showBanner('FIGHT!', 1.1);
}

// ============================================================ Mode BRAWL

function startBrawl(pick: CharacterDef): void {
  clearBrawl();
  brawlPick = pick;
  fighters = [player];
  applyCharacter(player, pick);
  player.displayName = 'KAMU';
  player.score = 0;
  // Karakter bot: utamakan yang berbeda dari pilihan pemain & sesama
  // bot; berulang hanya bila jumlah petarung melebihi roster.
  const pool = [...CHARACTERS.filter((c) => c.id !== pick.id), ...CHARACTERS];
  for (let i = 0; i < brawlCount - 1; i++) {
    const c = pool[i % pool.length];
    const f = new Fighter(chibiModel(c.palette));
    scene.add(f.group);
    applyCharacter(f, c);
    f.score = 0;
    extraFighters.push(f);
    fighters.push(f);
  }
  enemy.group.visible = false;
  document.body.classList.add('brawl');
  matchTarget = Math.floor(bestOf / 2) + 1;
  brawlRound = 0;
  matchStarted = true;
  $('char-select').classList.remove('open');
  $('name1').textContent = `${pick.name} · ${pick.typeName}`;
  const tbLabel = document.querySelector('#tb-skill .tb-label');
  if (tbLabel) tbLabel.textContent = pick.skill.name.toUpperCase();
  buildPlates();
  resetBrawlRound();
}

function resetBrawlRound(): void {
  brawlRound++;
  const n = fighters.length;
  fighters.forEach((f, i) => {
    const a = (i / n) * Math.PI * 2;
    const pos = new THREE.Vector3(Math.sin(a) * 6, arena.ringTopY, Math.cos(a) * 6);
    f.reset(pos, Math.atan2(-pos.x, -pos.z));
  });
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  roundOver = false;
  brawlTimer = 120;
  brawlYaw = player.facing;
  brawlElev = 3.4;
  lastStripSecond = -1;
  updateBrawlStrip();
  showBanner(brawlRound === 1 ? 'FIGHT!' : `RONDE ${brawlRound} — FIGHT!`, 1.1);
}

/** Satu petarung BRAWL gugur (dipanggil applyHit). */
function onBrawlDown(victim: Fighter): void {
  updateBrawlStrip();
  const alive = fighters.filter((f) => f.alive);
  if (alive.length > 1) {
    showBanner(`${victim.displayName} GUGUR!`, 1.0);
    return;
  }
  if (roundOver) return; // akhir ronde sudah diproses jalur lain
  const winner = alive[0] ?? null;
  if (winner) winner.score++;
  roundOver = true;
  updateBrawlStrip();
  setTimeout(() => {
    if (!matchStarted || gameMode !== 'brawl') return;
    if (winner && winner.score >= matchTarget) {
      endBrawlMatch();
    } else {
      showBanner(winner ? `${winner.displayName} MENANG RONDE!` : 'RONDE SERI!', 1.4);
      setTimeout(() => {
        if (matchStarted && gameMode === 'brawl') resetBrawlRound();
      }, 1500);
    }
  }, 1200);
}

function updateBrawlTimer(dt: number): void {
  if (roundOver) return;
  brawlTimer -= dt;
  const sec = Math.ceil(brawlTimer);
  if (sec !== lastStripSecond) {
    lastStripSecond = sec;
    updateBrawlStrip();
  }
  if (brawlTimer > 0) return;
  // Waktu habis: sisa HP tertinggi memenangkan ronde.
  roundOver = true;
  let winner: Fighter | null = null;
  for (const f of fighters) {
    if (f.alive && (!winner || f.hp > winner.hp)) winner = f;
  }
  if (winner) winner.score++;
  updateBrawlStrip();
  setTimeout(() => {
    if (!matchStarted || gameMode !== 'brawl') return;
    if (winner && winner.score >= matchTarget) {
      endBrawlMatch();
    } else {
      showBanner(`WAKTU HABIS — ${winner ? winner.displayName : '-'} MENANG RONDE!`, 1.4);
      setTimeout(() => {
        if (matchStarted && gameMode === 'brawl') resetBrawlRound();
      }, 1500);
    }
  }, 600);
}

function endBrawlMatch(): void {
  matchStarted = false;
  const sorted = [...fighters].sort((a, b) => b.score - a.score);
  const champ = sorted[0];
  const c = CHARACTERS.find((x) => x.id === champ.charId) ?? CHARACTERS[0];
  ($('ws-img') as HTMLImageElement).src = c.faceUrl;
  $('ws-name').textContent = champ.displayName;
  $('ws-char').textContent = `${c.name} · JUARA BRAWL`;
  $('ws-score').textContent = sorted.map((f) => `${f.displayName} ${f.score}`).join('  ·  ');
  $('btn-again').style.display = '';
  $('winner-screen').classList.add('open');
}

/** Buang petarung ekstra & kembalikan keadaan DUEL. Aman dipanggil kapan pun. */
function clearBrawl(): void {
  for (const f of extraFighters) scene.remove(f.group);
  extraFighters.length = 0;
  fighters = [player, enemy];
  enemy.group.visible = true;
  document.body.classList.remove('brawl');
  $('brawl-strip').style.display = 'none';
  clearPlates();
}

function updateBrawlStrip(): void {
  const el = $('brawl-strip');
  if (gameMode !== 'brawl' || !matchStarted) {
    el.style.display = 'none';
    return;
  }
  const sorted = [...fighters].sort((a, b) => b.score - a.score);
  const t = Math.max(0, Math.ceil(brawlTimer));
  const mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  el.textContent = `BRAWL · ${sorted.map((f) => `${f.displayName} ${f.score}`).join(' · ')} · ${mm}`;
  el.style.display = 'block';
}

// --- Plat nama + HP mini di atas kepala tiap lawan (BRAWL) ---
const plateMap = new Map<Fighter, HTMLDivElement>();
const plateV = new THREE.Vector3();

function buildPlates(): void {
  clearPlates();
  const wrap = $('plates');
  for (const f of fighters) {
    if (f === player) continue;
    const d = document.createElement('div');
    d.className = 'plate';
    d.innerHTML = `<div class="pl-name">${f.displayName}</div><div class="pl-hp"><div></div></div>`;
    wrap.appendChild(d);
    plateMap.set(f, d);
  }
}

function clearPlates(): void {
  $('plates').innerHTML = '';
  plateMap.clear();
}

function updatePlates(): void {
  for (const [f, d] of plateMap) {
    if (!f.alive || !matchStarted) {
      d.style.display = 'none';
      continue;
    }
    plateV.copy(f.pos);
    plateV.y += 2.35;
    plateV.project(camera);
    if (plateV.z > 1 || plateV.z < -1) {
      d.style.display = 'none';
      continue;
    }
    d.style.display = '';
    const x = (plateV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-plateV.y * 0.5 + 0.5) * window.innerHeight;
    d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    const bar = d.querySelector('.pl-hp > div') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.max(0, f.hp)}%`;
  }
}

function buildCharCards(): void {
  const wrap = $('char-cards');
  wrap.innerHTML = '';
  for (const c of CHARACTERS) {
    const card = document.createElement('button');
    card.className = 'char-card';
    card.style.setProperty('--accent', c.accent);
    card.innerHTML =
      `<span class="cc-face"><img src="${c.faceUrl}" alt="${c.name}"></span>` +
      `<span class="cc-name">${c.name}</span>`;
    card.addEventListener('click', () => {
      if (net) pickOnline(c);
      else if (inviteCode) joinViaInvite(c);
      else startMatch(c);
    });
    wrap.appendChild(card);
  }
}
buildCharCards();

// ============================================================ Zoom carousel kartu
// Kartu terdekat ke tengah strip diperbesar, yang jauh mengecil.
const cardsEl = $('char-cards');
function updateCardZoom(): void {
  const cr = cardsEl.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  cardsEl.querySelectorAll<HTMLElement>('.char-card').forEach((el) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - cx);
    const t = Math.max(0, 1 - d / Math.max(r.width, 1) / 1.6);
    el.style.transform = `scale(${(0.88 + 0.27 * t).toFixed(3)})`;
    el.style.zIndex = String(Math.round(t * 10));
  });
}
let zoomQueued = false;
cardsEl.addEventListener(
  'scroll',
  () => {
    if (zoomQueued) return;
    zoomQueued = true;
    requestAnimationFrame(() => {
      zoomQueued = false;
      updateCardZoom();
    });
  },
  { passive: true },
);
window.addEventListener('resize', updateCardZoom);
requestAnimationFrame(updateCardZoom);

// Seret pakai kursor mouse untuk menggeser carousel mendatar
// (sentuh sudah bisa scroll bawaan). Seretan melewati ambang 6px
// menelan klik berikutnya agar tidak ikut memilih karakter.
{
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startScroll = 0;
  cardsEl.style.cursor = 'grab';
  cardsEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startScroll = cardsEl.scrollLeft;
    cardsEl.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) moved = true;
    cardsEl.scrollLeft = startScroll - dx;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
    cardsEl.style.cursor = 'grab';
  });
  cardsEl.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    },
    true,
  );
}

function buildDiffChips(): void {
  const row = $('diff-row');
  row.innerHTML = '';
  for (const d of DIFFICULTIES) {
    const chip = document.createElement('button');
    chip.className = 'diff-chip' + (d.id === botDiff.id ? ' sel' : '');
    chip.style.setProperty('--c', d.color);
    chip.innerHTML = `<span>${d.name}</span>`;
    chip.addEventListener('click', () => {
      botDiff = d;
      localStorage.setItem('us-difficulty', d.id);
      buildDiffChips();
    });
    row.appendChild(chip);
  }
}

// --- Pemilih mode (DUEL / BRAWL) & jumlah petarung BRAWL ---
function buildModeRow(): void {
  const row = $('mode-row');
  row.innerHTML = '';
  const modes: { id: GameMode; label: string }[] = [
    { id: 'duel', label: 'DUEL 1V1' },
    { id: 'brawl', label: 'BRAWL' },
  ];
  for (const m of modes) {
    const chip = document.createElement('button');
    chip.className = 'diff-chip' + (gameMode === m.id ? ' sel' : '');
    chip.innerHTML = `<span>${m.label}</span>`;
    chip.addEventListener('click', () => {
      gameMode = m.id;
      localStorage.setItem('us-mode', m.id);
      buildModeRow();
      syncModeRows();
    });
    row.appendChild(chip);
  }
}

function buildCountRow(): void {
  const row = $('count-row');
  row.innerHTML = '';
  for (const n of [3, 4, 5, 6]) {
    const chip = document.createElement('button');
    chip.className = 'diff-chip' + (brawlCount === n ? ' sel' : '');
    chip.innerHTML = `<span>${n} PETARUNG</span>`;
    chip.addEventListener('click', () => {
      brawlCount = n;
      localStorage.setItem('us-brawl-count', String(n));
      buildCountRow();
    });
    row.appendChild(chip);
  }
}

function syncModeRows(): void {
  const brawl = gameMode === 'brawl';
  $('count-label').style.display = brawl ? '' : 'none';
  $('count-row').style.display = brawl ? '' : 'none';
  $('diff-label').style.display = brawl ? 'none' : '';
  $('diff-row').style.display = brawl ? 'none' : '';
}
buildModeRow();
buildCountRow();
syncModeRows();
buildDiffChips();
$('char-select').classList.add('open');
$('btn-chars').addEventListener('click', () => {
  if (net) cleanupNet();
  clearBrawl();
  matchStarted = false;
  $('char-select').classList.add('open');
  requestAnimationFrame(updateCardZoom);
});

// ============================================================ Mode online 1v1
// Host-authoritative: browser host menjalankan simulasi; tamu
// mengirim input & menggambar dari snapshot host (20x/detik).
let net: NetClient | null = null;
let netRole: 'host' | 'guest' | '' = '';
let guestJoined = false;
let hostPick: CharacterDef | null = null;
let guestPick: CharacterDef | null = null;
/** Username sesi ini saja (hilang saat refresh — memang disengaja). */
let myName = '';
/** Username lawan dari pesan hello/pick/start. */
let peerName = '';
/** Best of yang dipilih host (1/3/5/7) & yang berlaku di match ini. */
let bestOf = Number(localStorage.getItem('us-bestof') ?? 3) || 3;
let matchBo = 3;
let roundsHost = 0;
let roundsGuest = 0;
let matchTarget = 2;
let matchDecided = false;
/** Penjaga: satu ronde hanya boleh berakhir sekali (K.O. ganda). */
let roundOver = false;
let curHostChar: CharacterDef | null = null;
let curGuestChar: CharacterDef | null = null;
let hostUser = 'HOST';
let guestUser = 'TAMU';
let snapTimer = 0;
let inputTimer = 0;
let lastPingShown = -2;

/** Input tamu terakhir yang diterima host. */
const remote = { wx: 0, wz: 0, mag: 0, acts: new Set<string>() };

type SnapF = [number, number, number, number, number, number, number, number, number, number, number, number];
type SnapP = [number, number, number, number, number, (number | undefined)?];
interface SnapMsg {
  a: SnapF;
  b: SnapF;
  pr: SnapP[];
}
let latestSnap: SnapMsg | null = null;
const mirrorProjs = new Map<number, THREE.Mesh>();
const mirrorGeo = new THREE.SphereGeometry(0.3, 14, 12);

function snapFighter(f: Fighter): SnapF {
  return [
    f.pos.x, f.pos.y, f.pos.z, f.vel.x, f.vel.z, f.facing,
    f.hp, f.chakra, f.attackTimer, f.dashTimer, f.hitTimer, f.buffTimer,
  ];
}

function broadcastSnap(): void {
  if (!net) return;
  net.sendGame('snap', {
    a: snapFighter(player),
    b: snapFighter(enemy),
    pr: projectiles.map((p): SnapP => [p.id, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, p.color, p.scale]),
  });
}

function applySnapFighter(f: Fighter, s: SnapF, dt: number): void {
  const k = 1 - Math.exp(-dt * 22);
  f.pos.x += (s[0] - f.pos.x) * k;
  f.pos.y += (s[1] - f.pos.y) * k;
  f.pos.z += (s[2] - f.pos.z) * k;
  f.vel.set(s[3], 0, s[4]);
  f.facing = turnToward(f.facing, s[5], dt * 22);
  f.hp = s[6];
  f.chakra = s[7];
  f.attackTimer = s[8];
  f.dashTimer = s[9];
  f.hitTimer = s[10];
  f.buffTimer = s[11];
  f.grounded = s[1] <= arena.ringTopY + 0.02;
  f.animate(dt, perfTime, Math.hypot(f.vel.x, f.vel.z));
}

function applySnapProjectiles(list: SnapP[]): void {
  const seen = new Set<number>();
  for (const [id, x, y, z, c, s] of list) {
    seen.add(id);
    let m = mirrorProjs.get(id);
    if (!m) {
      m = new THREE.Mesh(mirrorGeo, new THREE.MeshBasicMaterial({ color: c }));
      m.scale.setScalar(s ?? 1);
      scene.add(m);
      mirrorProjs.set(id, m);
    }
    m.position.set(x, y, z);
  }
  for (const [id, m] of [...mirrorProjs]) {
    if (!seen.has(id)) {
      scene.remove(m);
      (m.material as THREE.Material).dispose();
      mirrorProjs.delete(id);
    }
  }
}

/** Host: jalankan petarung tamu dari input jaringan terakhir. */
function driveRemote(dt: number): void {
  const acts: DriveActs = {
    dash: remote.acts.has('dash'),
    jump: remote.acts.has('jump'),
    attack: remote.acts.has('attack'),
    skill: remote.acts.has('skill'),
  };
  remote.acts.clear();
  driveFighter(enemy, player, new THREE.Vector3(remote.wx, 0, remote.wz), remote.mag, acts, dt);
}

/** Tamu: kirim input lokal (arah sudah dalam ruang dunia) ke host. */
function sendGuestInput(): void {
  if (!net) return;
  const axis = input.moveAxis();
  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);
  camFwd.y = 0;
  camFwd.normalize();
  const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0)).negate();
  const wish = new THREE.Vector3()
    .addScaledVector(camFwd, -axis.z)
    .addScaledVector(camRight, -axis.x);
  const mag = Math.min(1, Math.hypot(axis.x, axis.z));
  if (wish.lengthSq() > 0.001) wish.normalize();
  const acts: string[] = [];
  if (input.consume('dash')) acts.push('dash');
  if (input.consume('jump')) acts.push('jump');
  if (input.consume('attack')) acts.push('attack');
  if (input.consume('skill')) acts.push('skill');
  net.sendGame('input', { wx: wish.x, wz: wish.z, mag, acts });
}

function startOnlineMatch(hc: CharacterDef, gc: CharacterDef, info?: { bo: number; hn: string; gn: string }): void {
  curHostChar = hc;
  curGuestChar = gc;
  if (netRole === 'host') {
    matchBo = bestOf;
    hostUser = myName || 'HOST';
    guestUser = peerName || 'TAMU';
  } else if (info) {
    matchBo = info.bo;
    hostUser = info.hn || 'HOST';
    guestUser = info.gn || myName || 'TAMU';
  }
  matchTarget = Math.floor(matchBo / 2) + 1;
  roundsHost = 0;
  roundsGuest = 0;
  matchDecided = false;
  roundOver = false;
  updateScoreLabel();
  applyCharacter(player, hc);
  applyCharacter(enemy, gc);
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const [, m] of mirrorProjs) scene.remove(m);
  mirrorProjs.clear();
  latestSnap = null;
  remote.acts.clear();
  player.reset(SPAWN_1, Math.PI / 2);
  enemy.reset(SPAWN_2, -Math.PI / 2);
  matchStarted = true;
  $('winner-screen').classList.remove('open');
  $('char-select').classList.remove('open');
  $('name1').textContent = `${hostUser} - ${hc.name}`;
  $('name2').textContent = `${guestUser} - ${gc.name}`;
  const mine = netRole === 'guest' ? gc : hc;
  const tbLabel = document.querySelector('#tb-skill .tb-label');
  if (tbLabel) tbLabel.textContent = mine.skill.name.toUpperCase();
  $('net-hud').classList.add('on');
  // Selama match online belum ada pemenang, tombol ganti karakter disembunyikan
  $('btn-chars').style.display = 'none';
  showBanner('FIGHT!', 1.1);
}

/** Host: siarkan & mulai match dengan pilihan + username + best of saat ini. */
function hostBeginMatch(): void {
  if (!net || !hostPick || !guestPick) return;
  hostUser = myName || 'HOST';
  guestUser = peerName || 'TAMU';
  matchBo = bestOf;
  net.sendGame('start', { host: hostPick.id, guest: guestPick.id, bo: matchBo, hn: hostUser, gn: guestUser });
  startOnlineMatch(hostPick, guestPick);
}

function maybeStartHost(): void {
  if (netRole !== 'host' || !net || !guestJoined || !hostPick || !guestPick) return;
  hostBeginMatch();
}

function pickOnline(c: CharacterDef): void {
  if (!net) return;
  if (myName.length === 0) {
    setNetStatus('Isi USERNAME dulu untuk membuka pilihan karakter.');
    return;
  }
  if (netRole === 'host') {
    hostPick = c;
    if (guestJoined && guestPick) setNetStatus(`Kamu memilih ${c.name} — memulai pertarungan...`);
    else if (guestJoined) setNetStatus(`Kamu memilih ${c.name}. Menunggu lawan memilih karakter...`);
    else setNetStatus(`Kamu memilih ${c.name}.<span class="room-code">${net.code}</span>Bagikan kode ini ke lawanmu — pertarungan mulai saat dia masuk & memilih.`);
    maybeStartHost();
  } else {
    guestPick = c;
    net.sendGame('pick', { char: c.id, name: myName });
    setNetStatus(`Kamu memilih ${c.name}. Menunggu host memulai pertarungan...`);
  }
}

function handleGameMsg(m: GameMsg): void {
  switch (m.kind) {
    case 'pick': {
      if (netRole !== 'host') break;
      if (typeof m.name === 'string' && m.name) peerName = m.name.slice(0, 12);
      guestPick = CHARACTERS.find((c) => c.id === m.char) ?? null;
      if (guestPick) {
        setNetStatus(hostPick ? `Lawan memilih ${guestPick.name} — memulai...` : `Lawan memilih ${guestPick.name}. Giliranmu memilih karakter!`);
        maybeStartHost();
      }
      break;
    }
    case 'hello': {
      if (typeof m.name === 'string') peerName = m.name.slice(0, 12);
      break;
    }
    case 'roominfo': {
      if (netRole !== 'guest') break;
      matchBo = Number(m.bo) || 3;
      if (!matchStarted) setNetStatus(`Terhubung! Room ini BEST OF ${matchBo} — menangkan ${Math.floor(matchBo / 2) + 1} ronde untuk jadi pemenang. Pilih karaktermu.`);
      break;
    }
    case 'score': {
      if (netRole !== 'guest') break;
      roundsHost = Number(m.h) || 0;
      roundsGuest = Number(m.g) || 0;
      updateScoreLabel();
      break;
    }
    case 'matchwin': {
      if (netRole !== 'guest') break;
      roundsHost = Number(m.h) || 0;
      roundsGuest = Number(m.g) || 0;
      updateScoreLabel();
      matchDecided = true;
      decideWinner(m.winner === 'guest' ? 'guest' : 'host');
      break;
    }
    case 'rematch': {
      if (netRole !== 'host' || !matchDecided || !curHostChar || !curGuestChar) break;
      hostPick = curHostChar;
      guestPick = curGuestChar;
      hostBeginMatch();
      break;
    }
    case 'start': {
      if (netRole !== 'guest') break;
      const hc = CHARACTERS.find((c) => c.id === m.host);
      const gc = CHARACTERS.find((c) => c.id === m.guest);
      if (hc && gc) {
        startOnlineMatch(hc, gc, {
          bo: Number(m.bo) || 3,
          hn: String(m.hn ?? ''),
          gn: String(m.gn ?? ''),
        });
      }
      break;
    }
    case 'input': {
      if (netRole !== 'host') break;
      remote.wx = Number(m.wx) || 0;
      remote.wz = Number(m.wz) || 0;
      remote.mag = Number(m.mag) || 0;
      for (const a of (m.acts as string[] | undefined) ?? []) remote.acts.add(a);
      break;
    }
    case 'snap':
      if (netRole === 'guest') latestSnap = m as unknown as SnapMsg;
      break;
    case 'hit':
      if (netRole === 'guest') {
        effects.burst(new THREE.Vector3(Number(m.x), Number(m.y), Number(m.z)), 0xffa347, 24, 5.5, 0.45, 0.15);
      }
      break;
    case 'cast':
      if (netRole === 'guest') {
        effects.burst(new THREE.Vector3(Number(m.x), Number(m.y), Number(m.z)), Number(m.c) || 0xffffff, 18, 3.5, 0.4, 0.13);
      }
      break;
    case 'ko':
      if (netRole === 'guest') {
        showBanner('K.O.!', 1.6);
        shake = Math.min(shake + 0.35, 0.45);
      }
      break;
    case 'fight':
      if (netRole === 'guest') showBanner('FIGHT!', 0.9);
      break;
  }
}

function setNetStatus(html: string): void {
  $('net-status').innerHTML = html;
}

function cleanupNet(): void {
  if (net) net.close();
  net = null;
  netRole = '';
  guestJoined = false;
  hostPick = null;
  guestPick = null;
  peerName = '';
  roundsHost = 0;
  roundsGuest = 0;
  matchDecided = false;
  roundOver = false;
  curHostChar = null;
  curGuestChar = null;
  latestSnap = null;
  for (const [, m] of mirrorProjs) scene.remove(m);
  mirrorProjs.clear();
  $('net-hud').classList.remove('on');
  $('net-score').textContent = '';
  $('winner-screen').classList.remove('open');
  $('btn-chars').style.display = '';
  $('char-select').classList.remove('online');
  $('btn-cancel-net').style.display = 'none';
  $('share-row').style.display = 'none';
  invitePick = null;
  setNetStatus('');
  refreshCardLocks();
}

function leaveOnlineToSelect(msg: string): void {
  matchStarted = false;
  cleanupNet();
  clearBrawl();
  $('char-select').classList.add('open');
  setNetStatus(msg);
}

function beginNet(role: 'host' | 'guest', code = ''): void {
  const n = new NetClient();
  net = n;
  netRole = role;
  $('char-select').classList.add('online');
  $('btn-cancel-net').style.display = 'block';
  refreshCardLocks();

  n.onCreated = (c) => {
    setNetStatus(`Bagikan kode ini ke lawanmu:<span class="room-code">${c}</span>Pilih karaktermu — pertarungan mulai saat lawan masuk & memilih juga.`);
    $('share-row').style.display = 'flex';
  };
  n.onJoined = () => {
    setNetStatus('Terhubung ke room! Pilih karaktermu untuk mulai.');
    n.sendGame('hello', { name: myName });
    // Datang dari link undangan: karakter sudah dipilih sebelum
    // tersambung — langsung teruskan pilihannya.
    if (invitePick) {
      const c = CHARACTERS.find((x) => x.id === invitePick);
      invitePick = null;
      if (c) pickOnline(c);
    }
  };
  n.onPeerJoined = () => {
    guestJoined = true;
    n.sendGame('hello', { name: myName });
    n.sendGame('roominfo', { bo: bestOf });
    setNetStatus(hostPick ? 'Lawan masuk! Menunggu lawan memilih karakter...' : 'Lawan masuk! Pilih karaktermu — begitu lawan memilih, pertarungan mulai.');
    maybeStartHost();
  };
  n.onGame = (m) => handleGameMsg(m);
  n.onPeerLeft = () => {
    // Sekali match pernah berjalan (termasuk layar pemenang), lawan
    // keluar = room ditutup untuk semua — tidak ada main lagi
    // melawan kursi kosong.
    const wasInMatch = matchStarted || matchDecided || curHostChar !== null;
    if (wasInMatch) {
      if (matchStarted) showBanner('LAWAN TERPUTUS', 1.4);
      leaveOnlineToSelect('Lawan keluar dari permainan — room ditutup.');
    } else if (netRole === 'host') {
      guestJoined = false;
      guestPick = null;
      setNetStatus(`Lawan keluar dari room.<span class="room-code">${n.code}</span>Kode masih berlaku — tunggu lawan lain, atau batalkan.`);
    } else {
      leaveOnlineToSelect('Host menutup room.');
    }
  };
  n.onClose = () => {
    if (!net) return;
    if (matchStarted) leaveOnlineToSelect('Koneksi ke server terputus.');
    else {
      cleanupNet();
      setNetStatus('Koneksi terputus. Coba lagi.');
    }
  };
  n.onError = (msg) => {
    if (!matchStarted) setNetStatus(msg);
  };

  n.connect(role === 'host' ? 'create' : 'join', code);
}

$('btn-create').addEventListener('click', () => {
  if (net) return;
  if (!NetClient.serverUrl()) {
    setNetStatus('Server online belum dikonfigurasi. Deploy dulu server relay-nya (folder server/), lalu buka game dengan ?server= atau set VITE_WS_URL.');
    return;
  }
  setNetStatus('Membuat room...');
  beginNet('host');
});
// ============================================================ Link undangan (?room=XXXX)
// Selain kode room, host bisa membagikan link — teman yang
// membukanya cukup isi username lalu pilih karakter untuk langsung
// bergabung ke room itu.
let inviteCode: string | null = null;
let invitePick: string | null = null;

function clearInvite(): void {
  inviteCode = null;
  $('btn-dismiss-invite').style.display = 'none';
  const u = new URL(location.href);
  u.searchParams.delete('room');
  history.replaceState(null, '', u.toString());
}

function joinViaInvite(c: CharacterDef): void {
  if (!inviteCode) return;
  if (myName.length === 0) {
    setNetStatus('Isi USERNAME dulu, lalu pilih karakter untuk bergabung.');
    return;
  }
  const code = inviteCode;
  clearInvite();
  invitePick = c.id;
  setNetStatus('Menghubungkan ke room undangan...');
  beginNet('guest', code);
}

{
  const p = new URLSearchParams(location.search).get('room');
  if (p && /^[A-Z2-9]{4}$/.test(p.toUpperCase())) {
    inviteCode = p.toUpperCase();
    ($('join-code') as HTMLInputElement).value = inviteCode;
    setNetStatus(`Kamu diundang bertanding!<span class="room-code">${inviteCode}</span>Isi USERNAME, lalu pilih karakter untuk langsung bergabung.`);
    $('btn-dismiss-invite').style.display = 'block';
  }
}

$('btn-dismiss-invite').addEventListener('click', () => {
  clearInvite();
  setNetStatus('');
});

function inviteUrl(): string {
  if (!net || !net.code) return '';
  return `${location.origin}${location.pathname}?room=${net.code}`;
}

$('btn-share').addEventListener('click', async () => {
  const url = inviteUrl();
  if (!url) return;
  const nav = navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: 'Ultimate Storm', text: 'Ayo tanding 1v1 di Ultimate Storm!', url });
    } catch (_) {
      /* pengguna membatalkan */
    }
  } else {
    window.prompt('Salin link undangan ini:', url);
  }
});

$('btn-copy-link').addEventListener('click', async () => {
  const url = inviteUrl();
  if (!url || !net || !net.code) return;
  try {
    await navigator.clipboard.writeText(url);
    setNetStatus(`Link undangan tersalin — kirim ke temanmu!<span class="room-code">${net.code}</span>Room menunggu di kode ini — pilih karaktermu juga.`);
  } catch (_) {
    window.prompt('Salin link undangan ini:', url);
  }
});

$('btn-join').addEventListener('click', () => {
  if (net) return;
  const code = ($('join-code') as HTMLInputElement).value.trim().toUpperCase();
  if (code.length !== 4) {
    setNetStatus('Masukkan kode room 4 huruf dulu.');
    return;
  }
  if (!NetClient.serverUrl()) {
    setNetStatus('Server online belum dikonfigurasi. Deploy dulu server relay-nya (folder server/), lalu buka game dengan ?server= atau set VITE_WS_URL.');
    return;
  }
  setNetStatus('Menghubungi room...');
  beginNet('guest', code);
});
$('btn-cancel-net').addEventListener('click', () => {
  cleanupNet();
  setNetStatus('Koneksi dibatalkan.');
});
$('btn-leave').addEventListener('click', () => {
  leaveOnlineToSelect('Kamu keluar dari pertarungan online.');
});

// ============================================================ Username + best of + pemenang
/** Kunci kartu (grayscale, tak bisa diketuk) selama online tanpa username. */
function refreshCardLocks(): void {
  const locked = !!net && myName.length === 0;
  document.querySelectorAll<HTMLElement>('.char-card').forEach((el) => el.classList.toggle('locked', locked));
  $('name-lock-note').style.display = locked ? 'block' : 'none';
}

const usernameInput = $('username-input') as HTMLInputElement;
usernameInput.value = ''; // username cuma untuk sesi ini — refresh = hilang
usernameInput.addEventListener('input', () => {
  myName = usernameInput.value.trim().slice(0, 12);
  refreshCardLocks();
  if (net && !matchStarted) net.sendGame('hello', { name: myName });
});

const BESTOFS = [1, 3, 5, 7];
function buildBestOfChips(): void {
  const row = $('bo-row');
  row.innerHTML = '';
  for (const b of BESTOFS) {
    const chip = document.createElement('button');
    chip.className = 'diff-chip' + (b === bestOf ? ' sel' : '');
    chip.style.setProperty('--c', '#ffd76a');
    chip.innerHTML = `<span>BO${b}</span>`;
    chip.addEventListener('click', () => {
      bestOf = b;
      localStorage.setItem('us-bestof', String(b));
      buildBestOfChips();
      if (netRole === 'host' && net && !matchStarted) net.sendGame('roominfo', { bo: bestOf });
    });
    row.appendChild(chip);
  }
}
buildBestOfChips();

$('btn-again').addEventListener('click', () => {
  $('winner-screen').classList.remove('open');
  if (!net && gameMode === 'brawl' && brawlPick) {
    startBrawl(brawlPick);
    return;
  }
  if (netRole === 'host') {
    if (!guestJoined) {
      leaveOnlineToSelect('Lawan sudah keluar — room ditutup.');
      return;
    }
    hostPick = curHostChar;
    guestPick = curGuestChar;
    hostBeginMatch();
  } else if (net) {
    net.sendGame('rematch', {});
    showBanner('MENUNGGU HOST', 1.4);
  }
});
$('btn-ws-leave').addEventListener('click', () => {
  $('winner-screen').classList.remove('open');
  leaveOnlineToSelect('Kamu keluar dari pertarungan online.');
});

// ============================================================ Loop
let perfTime = 0;
const clock = new THREE.Clock();
let frameCount = 0;

function tick(): void {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  perfTime += dt;

  // Awan langit prosedural bergeser sangat pelan (offset tekstur saja)
  arena.skyTexture.offset.x = (perfTime * 0.0022) % 1;

  if (netRole === 'guest') {
    // TAMU: tanpa simulasi lokal — kirim input, gambar dari snapshot host.
    if (matchStarted) {
      inputTimer += dt;
      if (inputTimer >= 1 / 30) {
        inputTimer = 0;
        sendGuestInput();
      }
      if (latestSnap) {
        applySnapFighter(player, latestSnap.a, dt);
        applySnapFighter(enemy, latestSnap.b, dt);
        applySnapProjectiles(latestSnap.pr);
      }
    } else {
      player.animate(dt, perfTime, 0);
      enemy.animate(dt, perfTime, 0);
    }
  } else if (matchStarted) {
    if (gameMode !== 'brawl' || player.alive) updatePlayer(dt);
    if (netRole === 'host') driveRemote(dt);
    else if (gameMode === 'brawl') {
      for (const f of fighters) if (f !== player) updateBot(f, dt);
    } else updateBot(enemy, dt);
    for (const f of fighters) integrate(f, dt);
    updateProjectiles(dt);
    if (gameMode === 'brawl' && !net) {
      updateBrawlTimer(dt);
      updatePlates();
    }
    if (netRole === 'host') {
      snapTimer += dt;
      if (snapTimer >= 0.05) {
        snapTimer = 0;
        broadcastSnap();
      }
    }
  } else {
    // Di layer pilih karakter: petarung diam beranimasi idle.
    player.animate(dt, perfTime, 0);
    enemy.animate(dt, perfTime, 0);
    for (const f of extraFighters) f.animate(dt, perfTime, 0);
  }
  effects.update(dt);
  updateCamera(dt);

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }

  hp1El.style.width = `${player.hp}%`;
  ck1El.style.width = `${(player.chakra / player.chakraMax) * 100}%`;
  hp2El.style.width = `${enemy.hp}%`;
  ck2El.style.width = `${(enemy.chakra / enemy.chakraMax) * 100}%`;

  input.endFrame();
  // Kontrol sentuh (analog + tombol skill) HANYA tampil saat
  // pertandingan berjalan — bukan di layer pilih karakter/pengaturan.
  if (document.body.classList.contains('in-match') !== matchStarted) {
    document.body.classList.toggle('in-match', matchStarted);
  }
  renderer.render(scene, camera);
  if (net && net.pingMs !== lastPingShown) {
    lastPingShown = net.pingMs;
    $('net-ping').textContent = net.pingMs >= 0 ? `PING ${net.pingMs} MS` : 'ONLINE';
  }
  if (frameCount === 0) {
    // Frame pertama tergambar -> singkirkan layar muat statis.
    const splash = document.getElementById('boot-splash');
    if (splash) splash.style.display = 'none';
  }
  frameCount++;
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
