import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { PlayerMusket } from './musket.js';
import { EnemyManager } from './enemies.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1200);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- game state ----------
let state = 'loading'; // loading | menu | playing | paused | dead
let wave = 0;
let waveCooldown = 0;
let waveActive = false;
let friendlyCannonTimer = 9;
let nextCannonIdx = 0;
let shotsFired = 0;
let startedAt = 0;

let world, player, musket, enemies, effects;

const raycaster = new THREE.Raycaster();
raycaster.far = 260;

// ---------- bootstrap ----------
const assets = await loadAssets();

effects = new Effects(scene);
world = createWorld(scene, assets);
player = new Player(camera, renderer.domElement, world, audio);
musket = new PlayerMusket(camera, audio, effects);
musket.onRecoil = () => player.recoil();
enemies = new EnemyManager(scene, assets, world, effects, audio, player);

enemies.onKill = () => {
  $('kill-num').textContent = enemies.kills;
  showHitmarker();
};
player.onDamaged = () => flashVignette();
player.onDeath = () => onPlayerDeath();

$('loading-note').style.display = 'none';
$('start-cta').style.display = '';
state = 'menu';

// debug/testing handle
window.__game = { player, enemies, musket, camera, get state() { return state; }, get wave() { return wave; } };

// ---------- input ----------
$('start-cta').addEventListener('click', () => beginBattle());
$('restart-cta').addEventListener('click', () => window.location.reload());

player.controls.addEventListener('unlock', () => {
  if (state === 'playing') {
    state = 'paused';
    $('start-cta').textContent = 'Return to the Fray';
    $('loading-note').style.display = 'none';
    $('start-screen').classList.remove('hidden');
  }
});

function beginBattle() {
  audio.init();
  audio.resume();
  player.controls.lock();
  $('start-screen').classList.add('hidden');
  $('hud').classList.add('active');
  if (state === 'menu') {
    state = 'playing';
    startedAt = performance.now();
    waveCooldown = 2.2;
    audio.drumRoll();
    banner('The British are coming', 'Hold the redoubt, soldier of France');
  } else if (state === 'paused') {
    state = 'playing';
  }
}

window.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || !player.controls.isLocked || !player.alive) return;
  if (e.button === 0) fireMusket();
  if (e.button === 2) player.aiming = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) player.aiming = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (state !== 'playing' || !player.alive) return;
  if (e.code === 'KeyR') musket.startReload();
  if (e.code === 'KeyF') bayonetStrike();
});

// ---------- combat ----------
const _dir = new THREE.Vector3();

function fireMusket() {
  camera.getWorldDirection(_dir);
  if (!musket.fire(_dir.clone())) return;
  shotsFired++;

  // smoothbore spread grows with movement, shrinks when aiming
  let spread = 0.012 + player.speed * 0.004;
  if (player.aiming) spread *= 0.45;
  const sx = (Math.random() - 0.5) * spread * 2;
  const sy = (Math.random() - 0.5) * spread * 2;
  const shotDir = _dir.clone();
  shotDir.x += sx;
  shotDir.y += sy;
  shotDir.normalize();

  raycaster.set(camera.position, shotDir);
  const result = enemies.tryHit(raycaster);
  if (!result) {
    // ball strikes the dirt downrange
    const t = raycaster.ray.origin.clone();
    for (let d = 4; d < 220; d += 3) {
      t.copy(raycaster.ray.origin).addScaledVector(shotDir, d);
      const g = world.heightAt(t.x, t.z);
      if (t.y <= g + 0.05) {
        t.y = g + 0.05;
        effects.dirtImpact(t);
        break;
      }
    }
  }
  // black powder fouls fast — reload begins on its own
  setTimeout(() => { if (!musket.loaded) musket.startReload(); }, 650);
}

function bayonetStrike() {
  if (!musket.bayonet()) return;
  setTimeout(() => {
    camera.getWorldDirection(_dir);
    enemies.tryBayonet(camera.position, _dir);
  }, 180);
}

// ---------- waves ----------
function startWave() {
  wave++;
  waveActive = true;
  $('wave-num').textContent = wave;
  const names = [
    'Skirmishers ahead', 'The line advances', 'Steady, lads', 'Grapeshot and fury',
    'The Old Guard watches', 'For the Emperor', 'No quarter given', 'The field runs red',
  ];
  banner(`Wave ${wave}`, names[(wave - 1) % names.length]);
  audio.drumRoll();
  enemies.spawnWave(wave);
}

function onWaveCleared() {
  waveActive = false;
  waveCooldown = 6;
  player.heal(35);
  banner('The line is broken!', 'They re-form for another assault — catch your breath');
}

function onPlayerDeath() {
  state = 'dead';
  $('hud').classList.remove('active');
  const mins = ((performance.now() - startedAt) / 60000).toFixed(1);
  const acc = shotsFired ? Math.round((enemies.kills / shotsFired) * 100) : 0;
  $('death-stats').innerHTML =
    `Waves survived <b>${Math.max(0, wave - 1)}</b><br>` +
    `Fallen foes <b>${enemies.kills}</b><br>` +
    `Shots fired <b>${shotsFired}</b> &middot; Marksmanship <b>${Math.min(acc, 100)}%</b><br>` +
    `Time on the field <b>${mins} min</b>`;
  $('death-screen').classList.remove('hidden');
  player.controls.unlock();
}

// ---------- HUD ----------
let bannerTimeout = null;
function banner(main, sub) {
  $('banner-main').textContent = main;
  $('banner-sub').textContent = sub || '';
  $('banner').classList.add('show');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => $('banner').classList.remove('show'), 3800);
}

function showHitmarker() {
  const el = $('hitmarker');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

let vignetteTimeout = null;
function flashVignette() {
  const el = $('vignette');
  el.style.opacity = '1';
  clearTimeout(vignetteTimeout);
  vignetteTimeout = setTimeout(() => { el.style.opacity = '0'; }, 350);
}

function updateHud() {
  $('health-bar').style.width = `${(player.health / player.maxHealth) * 100}%`;
  $('lowhealth').style.opacity = player.health < 35 ? String(1 - player.health / 35) : '0';

  const stateEl = $('musket-state');
  if (musket.reloading) {
    stateEl.textContent = 'Reloading';
    stateEl.className = 'empty';
  } else if (musket.loaded) {
    stateEl.textContent = 'Loaded';
    stateEl.className = 'loaded';
  } else {
    stateEl.textContent = 'Empty — press R';
    stateEl.className = 'empty';
  }
  $('reload-bar').style.width = `${musket.reloadProgress * 100}%`;
  $('reload-stage').textContent = musket.stageLabel;

  const spreadPx = 26 + player.speed * 9 + (player.aiming ? -12 : 0) + (musket.reloading ? 18 : 0);
  const ring = $('spread-ring');
  ring.style.width = `${Math.max(12, spreadPx)}px`;
  ring.style.height = `${Math.max(12, spreadPx)}px`;
}

// ---------- main loop ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    player.update(dt);
    musket.update(dt, { moveSpeed: player.speed, aiming: player.aiming });
    enemies.update(dt);
    world.update(dt);
    effects.update(dt);

    // wave sequencing
    if (!waveActive) {
      waveCooldown -= dt;
      if (waveCooldown <= 0) startWave();
    } else if (enemies.aliveCount === 0) {
      onWaveCleared();
    }

    // French battery offers periodic support
    friendlyCannonTimer -= dt;
    if (friendlyCannonTimer <= 0) {
      const cannon = world.cannons[nextCannonIdx % world.cannons.length];
      if (enemies.fireFriendlyCannon(cannon.muzzle)) {
        nextCannonIdx++;
        friendlyCannonTimer = 12 + Math.random() * 6;
      } else {
        friendlyCannonTimer = 3;
      }
    }

    updateHud();
  } else if (state === 'dead') {
    // slow funereal drift over the battlefield
    enemies.update(dt * 0.25);
    world.update(dt);
    effects.update(dt);
  }

  renderer.render(scene, camera);
}

tick();
