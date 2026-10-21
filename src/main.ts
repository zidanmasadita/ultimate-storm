import * as THREE from 'three';
import { buildArena } from './game/arena';
import { Fighter, chibiModel, loadFighterModel, turnToward } from './game/character';
import { CHARACTERS, type CharacterDef } from './game/characters';
import { Effects } from './game/effects';
import { ACTION_LABELS, ActionId, DEFAULT_BINDS, Input, keyLabel, saveBinds } from './game/input';

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

const modelCache = new Map<string, THREE.Object3D>();
for (const c of CHARACTERS) {
  loadFighterModel(c.modelUrl, c.palette).then((m) => {
    modelCache.set(c.id, m);
    if (player.charId === c.id) player.setModel(m);
    if (enemy.charId === c.id) enemy.setModel(m);
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
  target: Fighter;
  damage: number;
  color: number;
}
const projectiles: Projectile[] = [];
const projGeo = new THREE.SphereGeometry(0.22, 16, 12);

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

function castSkill(caster: Fighter, target: Fighter): void {
  const sk = caster.skill;
  if (caster.skillCooldown > 0 || caster.chakra < sk.chakraCost) return;
  caster.chakra -= sk.chakraCost;
  caster.skillCooldown = sk.cooldown;

  const mat = new THREE.MeshBasicMaterial({ color: sk.projectileColor });
  const mesh = new THREE.Mesh(projGeo, mat);
  const start = caster.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
  mesh.position.copy(start);
  scene.add(mesh);

  const dir = target.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(start).normalize();
  projectiles.push({ mesh, vel: dir.multiplyScalar(sk.projectileSpeed), life: 2.2, owner: caster, target, damage: sk.damage, color: sk.projectileColor });
  effects.burst(start, sk.projectileColor, 14, 3, 0.35, 0.12);
}

function updateProjectiles(dt: number): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    effects.burst(p.mesh.position, p.color, 2, 0.6, 0.3, 0.1);

    const targetPos = p.target.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
    const hit = p.mesh.position.distanceTo(targetPos) < 1.05;
    if (hit || p.life <= 0) {
      effects.burst(p.mesh.position, p.color, 30, 6, 0.55, 0.16);
      if (hit) applyHit(p.target, p.owner, p.damage, 7);
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      projectiles.splice(i, 1);
    }
  }
}

// ============================================================ Pertarungan dasar (placeholder — sistem penuh di fase combat)
let shake = 0;

function applyHit(victim: Fighter, attacker: Fighter, damage: number, knock: number): void {
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

  if (victim.hp <= 0) {
    showBanner('K.O.!', 1.6);
    setTimeout(() => {
      player.reset(SPAWN_1, Math.PI / 2);
      enemy.reset(SPAWN_2, -Math.PI / 2);
      showBanner('FIGHT!', 0.9);
    }, 1600);
  }
}

function tryAttack(attacker: Fighter, victim: Fighter): void {
  if (attacker.attackCooldown > 0) return;
  attacker.attackTimer = 0.35;
  attacker.attackCooldown = 0.45;
  // Putaran serangan mengenai musuh di dekatnya
  setTimeout(() => {
    const d = attacker.pos.distanceTo(victim.pos);
    if (d < 2.5) applyHit(victim, attacker, 6, 5);
  }, 130);
}

// ============================================================ AI musuh sederhana (fase environment: mondar-mandir + jaga jarak)
let enemyThink = 0;
let enemyTarget = SPAWN_2.clone();

function updateEnemy(dt: number): void {
  enemyThink -= dt;
  if (enemyThink <= 0) {
    enemyThink = 1.6 + Math.random() * 1.6;
    // Pilih titik jaga jarak dari pemain, tetap di dalam ring
    const angle = Math.random() * Math.PI * 2;
    const dist = 3.5 + Math.random() * 3;
    enemyTarget = player.pos.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
    enemyTarget.y = arena.ringTopY;
    const r = Math.hypot(enemyTarget.x, enemyTarget.z);
    if (r > arena.playRadius) enemyTarget.multiplyScalar(arena.playRadius / r).setY(arena.ringTopY);
  }

  const toTarget = enemyTarget.clone().sub(enemy.pos);
  toTarget.y = 0;
  const desired = new THREE.Vector3();
  if (toTarget.length() > 0.6) {
    desired.copy(toTarget.normalize()).multiplyScalar(3.1);
  }
  steer(enemy, desired, dt);

  // Selalu menghadap pemain
  const toPlayer = Math.atan2(player.pos.x - enemy.pos.x, player.pos.z - enemy.pos.z);
  enemy.facing = turnToward(enemy.facing, toPlayer, dt * 7);

  // Kadang menyerang balik kalau dekat (biar keybind musuh terasa hidup)
  if (enemy.pos.distanceTo(player.pos) < 2.4 && Math.random() < dt * 0.55) {
    tryAttack(enemy, player);
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
  f.hitTimer = Math.max(0, f.hitTimer - dt);
  f.chakra = Math.min(100, f.chakra + 7 * dt);

  const speed2D = Math.hypot(f.vel.x, f.vel.z);
  f.animate(dt, perfTime, speed2D);
}

// ============================================================ Kontrol pemain
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
  const moving = wish.lengthSq() > 0.001;
  if (moving) wish.normalize();
  // Magnitud analog: dorongan kecil pada joystick = jalan pelan (keyboard selalu 1)
  const axisMag = Math.min(1, Math.hypot(axis.x, axis.z));

  // Dash
  if (input.consume('dash') && player.dashCooldown <= 0) {
    player.dashTimer = 0.18;
    player.dashCooldown = 0.85;
    const dir = moving ? wish.clone() : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    player.vel.copy(dir.multiplyScalar(17));
    effects.burst(player.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 0x9fc1ff, 16, 2.5, 0.35, 0.12);
  }

  const speed = player.dashTimer > 0 ? 17 : WALK_SPEED * axisMag;
  const desired = moving ? wish.clone().multiplyScalar(speed) : new THREE.Vector3();
  if (player.dashTimer <= 0) steer(player, desired, dt);

  // Hadap: arah gerak saat bergerak, selain itu hadap musuh (lock-on lembut)
  if (moving && player.dashTimer <= 0) {
    player.facing = turnToward(player.facing, Math.atan2(wish.x, wish.z), dt * 11);
  } else {
    const toEnemy = Math.atan2(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z);
    player.facing = turnToward(player.facing, toEnemy, dt * 8);
  }

  // Lompat
  if (input.consume('jump') && player.grounded) {
    player.vy = 9.2;
    player.grounded = false;
  }

  // Serangan & jurus
  if (input.consume('attack')) tryAttack(player, enemy);
  if (input.consume('skill')) castSkill(player, enemy);
}

// ============================================================ Kamera lock-on ala Storm
const camPos = new THREE.Vector3(0, 5.5, 13);
function updateCamera(dt: number): void {
  const toEnemy = enemy.pos.clone().sub(player.pos);
  toEnemy.y = 0;
  const dist = Math.max(toEnemy.length(), 0.001);
  toEnemy.normalize();

  const behind = player.pos.clone().addScaledVector(toEnemy, -7.6).add(new THREE.Vector3(0, 3.4, 0));
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
  const mid = player.pos.clone().add(enemy.pos).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.35, 0));
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
  f.skill = c.skill;
  const m = modelCache.get(c.id);
  if (m) f.setModel(m);
  else f.setModel(chibiModel(c.palette));
}

function startMatch(pick: CharacterDef): void {
  const others = CHARACTERS.filter((c) => c.id !== pick.id);
  const foe = others[Math.floor(Math.random() * others.length)] ?? pick;
  applyCharacter(player, pick);
  applyCharacter(enemy, foe);
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  player.reset(SPAWN_1, Math.PI / 2);
  enemy.reset(SPAWN_2, -Math.PI / 2);
  matchStarted = true;
  $('char-select').classList.remove('open');
  renderBindRows();
  const tbLabel = document.querySelector('#tb-skill .tb-label');
  if (tbLabel) tbLabel.textContent = pick.skill.name.toUpperCase();
  showBanner('FIGHT!', 1.1);
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
    card.addEventListener('click', () => startMatch(c));
    wrap.appendChild(card);
  }
}
buildCharCards();
$('char-select').classList.add('open');
$('btn-chars').addEventListener('click', () => {
  matchStarted = false;
  $('char-select').classList.add('open');
});

// ============================================================ Loop
let perfTime = 0;
const clock = new THREE.Clock();

// ============================================================ Panel diagnostik
// Menampilkan keadaan renderer yang sebenarnya di perangkat pengguna.
const debugEl = document.createElement('div');
debugEl.style.cssText =
  'position:fixed;left:8px;bottom:8px;z-index:40;background:rgba(0,0,0,.72);color:#9fe870;' +
  'font:11px/1.5 ui-monospace,monospace;padding:6px 9px;border-radius:6px;white-space:pre;pointer-events:none';
document.body.appendChild(debugEl);
let frameCount = 0;
let lastCalls = -1;
let lastTris = 0;

function tick(): void {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  perfTime += dt;

  if (matchStarted) {
    updatePlayer(dt);
    updateEnemy(dt);
    integrate(player, dt);
    integrate(enemy, dt);
    updateProjectiles(dt);
  } else {
    // Di layer pilih karakter: petarung diam beranimasi idle.
    player.animate(dt, perfTime, 0);
    enemy.animate(dt, perfTime, 0);
  }
  effects.update(dt);
  updateCamera(dt);

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerEl.classList.remove('show');
  }

  hp1El.style.width = `${player.hp}%`;
  ck1El.style.width = `${player.chakra}%`;
  hp2El.style.width = `${enemy.hp}%`;
  ck2El.style.width = `${enemy.chakra}%`;

  input.endFrame();
  renderer.render(scene, camera);
  (window as unknown as { __gameBooted?: boolean }).__gameBooted = true;
  if (frameCount === 0) {
    // Frame pertama tergambar -> singkirkan layar muat statis.
    const splash = document.getElementById('boot-splash');
    if (splash) splash.style.display = 'none';
  }

  frameCount++;
  lastCalls = renderer.info.render.calls;
  lastTris = renderer.info.render.triangles;
  if (frameCount % 30 === 0) {
    const gl = renderer.getContext();
    debugEl.textContent =
      `draw ${lastCalls} · tri ${(lastTris / 1000).toFixed(0)}k · frame ${frameCount}\n` +
      `model dimuat: ${modelCache.size}/${CHARACTERS.length} · P1 ${player.charId || '-'} · P2 ${enemy.charId || '-'}\n` +
      `ctx lost: ${gl.isContextLost()} · canvas ${renderer.domElement.width}x${renderer.domElement.height}\n` +
      `mode: ${LIGHT_MODE ? 'RINGAN' : 'normal'}`;
  }
}
tick();

// Penyelamat otomatis: loop jalan tapi renderer menggambar NOL objek →
// muat ulang sekali dalam mode ringan; bila tetap nol, bersuara.
setTimeout(() => {
  if (frameCount > 30 && lastCalls === 0) {
    if (!LIGHT_MODE) {
      sessionStorage.setItem('us-ringan', '1');
      location.reload();
    } else {
      showFatal('Renderer berjalan tapi tidak menggambar satu objek pun di perangkat ini, bahkan dalam mode ringan.');
    }
  }
}, 5000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
