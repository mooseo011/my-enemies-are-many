import * as THREE from 'three';

const WOOD = new THREE.MeshLambertMaterial({ color: 0x5b3a21 });
const WOOD_DARK = new THREE.MeshLambertMaterial({ color: 0x46291a });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.35 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3 });

// Procedural Charleville-pattern flintlock musket. Points down -Z, origin at the lock.
export function buildMusketModel({ bayonet = true } = {}) {
  const g = new THREE.Group();

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.78), WOOD);
  stock.position.set(0, -0.035, -0.28);
  g.add(stock);

  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.3), WOOD_DARK);
  butt.position.set(0, -0.055, 0.24);
  butt.rotation.x = -0.18;
  g.add(butt);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 1.15, 10), STEEL);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.47);
  g.add(barrel);

  for (const z of [-0.18, -0.52, -0.86]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.025, 10), BRASS);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.0, z);
    g.add(band);
  }

  const ramrod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.0, 6), STEEL);
  ramrod.rotation.x = Math.PI / 2;
  ramrod.position.set(0, -0.022, -0.5);
  g.add(ramrod);

  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.12), BRASS);
  lock.position.set(0.028, 0.0, 0.0);
  g.add(lock);

  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.06, 0.02), STEEL);
  hammer.position.set(0.03, 0.045, 0.012);
  hammer.rotation.x = -0.5;
  g.add(hammer);

  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 10, Math.PI), BRASS);
  guard.position.set(0, -0.07, 0.03);
  guard.rotation.set(0, Math.PI / 2, 0);
  g.add(guard);

  if (bayonet) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.42, 4), STEEL);
    blade.rotation.x = -Math.PI / 2;
    blade.position.set(0, 0.034, -1.18);
    g.add(blade);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8), STEEL);
    socket.rotation.x = Math.PI / 2;
    socket.position.set(0, 0.012, -1.0);
    g.add(socket);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const RELOAD_STAGES = [
  { dur: 0.7, label: 'Bite the cartridge\u2026' },
  { dur: 0.9, label: 'Charge with powder\u2026' },
  { dur: 1.2, label: 'Ram down the ball\u2026' },
  { dur: 0.8, label: 'Prime and cock\u2026' },
];
const RELOAD_TOTAL = RELOAD_STAGES.reduce((s, x) => s + x.dur, 0);

const HIP_POS = new THREE.Vector3(0.26, -0.27, -0.5);
const HIP_ROT = new THREE.Euler(0, 0.06, 0.02);
const AIM_POS = new THREE.Vector3(0.0, -0.18, -0.38);
const AIM_ROT = new THREE.Euler(0, 0, 0);
const RELOAD_POS = new THREE.Vector3(0.18, -0.42, -0.42);
const RELOAD_ROT = new THREE.Euler(-1.15, 0.35, 0.25);

export class PlayerMusket {
  constructor(camera, audio, effects) {
    this.camera = camera;
    this.audio = audio;
    this.effects = effects;

    this.group = buildMusketModel({ bayonet: true });
    this.group.position.copy(HIP_POS);
    this.group.rotation.copy(HIP_ROT);
    camera.add(this.group);

    this.loaded = true;
    this.reloading = false;
    this.reloadT = 0;
    this.stageIdx = -1;
    this.stageLabel = '';
    this.reloadProgress = 1;

    this.recoilT = 1;
    this.bayonetT = 1;
    this.bobPhase = 0;
    this.onRecoil = null;

    this._muzzleLocal = new THREE.Vector3(0, 0.012, -1.05);
  }

  get canFire() {
    return this.loaded && !this.reloading && this.bayonetT >= 1;
  }

  get canBayonet() {
    return this.bayonetT >= 1 && !this.reloading;
  }

  getMuzzleWorld(out) {
    return this.group.localToWorld(out.copy(this._muzzleLocal));
  }

  fire(dirWorld) {
    if (!this.canFire) {
      if (!this.reloading) this.audio.dryFire();
      return false;
    }
    this.loaded = false;
    this.recoilT = 0;
    this.audio.musketFire();
    const muzzle = this.getMuzzleWorld(new THREE.Vector3());
    this.effects.muzzleFlash(muzzle, dirWorld);
    this.effects.muzzleSmoke(muzzle, dirWorld);
    if (this.onRecoil) this.onRecoil();
    return true;
  }

  startReload() {
    if (this.loaded || this.reloading) return;
    this.reloading = true;
    this.reloadT = 0;
    this.stageIdx = -1;
  }

  bayonet() {
    if (!this.canBayonet) return false;
    this.bayonetT = 0;
    this.audio.bayonetSwing();
    return true;
  }

  update(dt, { moveSpeed = 0, aiming = false } = {}) {
    // --- reload state machine ---
    if (this.reloading) {
      this.reloadT += dt;
      let acc = 0;
      let idx = RELOAD_STAGES.length - 1;
      for (let i = 0; i < RELOAD_STAGES.length; i++) {
        acc += RELOAD_STAGES[i].dur;
        if (this.reloadT <= acc) { idx = i; break; }
      }
      if (idx !== this.stageIdx) {
        this.stageIdx = idx;
        this.stageLabel = RELOAD_STAGES[idx].label;
        this.audio.reloadStage(idx);
      }
      this.reloadProgress = Math.min(this.reloadT / RELOAD_TOTAL, 1);
      if (this.reloadT >= RELOAD_TOTAL) {
        this.reloading = false;
        this.loaded = true;
        this.stageLabel = '';
        this.reloadProgress = 1;
      }
    } else {
      this.reloadProgress = this.loaded ? 1 : 0;
    }

    this.recoilT = Math.min(this.recoilT + dt * 3.2, 1);
    this.bayonetT = Math.min(this.bayonetT + dt * 2.4, 1);

    // --- pose blending ---
    const targetPos = new THREE.Vector3();
    const targetRot = new THREE.Euler();
    if (this.reloading) {
      targetPos.copy(RELOAD_POS);
      targetRot.copy(RELOAD_ROT);
      // little pumping motion while ramming
      if (this.stageIdx === 2) targetPos.y += Math.sin(this.reloadT * 16) * 0.025;
    } else if (aiming) {
      targetPos.copy(AIM_POS);
      targetRot.copy(AIM_ROT);
    } else {
      targetPos.copy(HIP_POS);
      targetRot.copy(HIP_ROT);
    }

    // recoil kick
    const r = 1 - this.recoilT;
    targetPos.z += r * r * 0.16;
    targetPos.y += r * r * 0.03;
    let rotX = targetRot.x + r * r * 0.28;

    // bayonet thrust
    if (this.bayonetT < 1) {
      const t = this.bayonetT;
      const thrust = Math.sin(Math.min(t * 2.2, 1) * Math.PI); // out and back
      targetPos.z -= thrust * 0.42;
      targetPos.x -= thrust * 0.12;
      rotX -= thrust * 0.1;
    }

    // walk bob + idle sway
    this.bobPhase += dt * (4 + moveSpeed * 1.6);
    const bobAmp = aiming ? 0.002 : 0.004 + moveSpeed * 0.0025;
    targetPos.y += Math.sin(this.bobPhase * 2) * bobAmp;
    targetPos.x += Math.cos(this.bobPhase) * bobAmp * 0.7;

    const k = 1 - Math.exp(-12 * dt);
    this.group.position.lerp(targetPos, k);
    this.group.rotation.x += (rotX - this.group.rotation.x) * k;
    this.group.rotation.y += (targetRot.y - this.group.rotation.y) * k;
    this.group.rotation.z += (targetRot.z - this.group.rotation.z) * k;
  }
}
