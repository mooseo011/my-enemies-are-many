import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { TERRAIN_SIZE } from './world.js';

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 4.4;
const SPRINT_SPEED = 7.4;
const AIM_SPEED = 2.4;
const GRAVITY = 16;
const JUMP_VEL = 5.4;
const BOUND = TERRAIN_SIZE / 2 - 12;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

export class Player {
  constructor(camera, domElement, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.controls = new PointerLockControls(camera, domElement);

    this.position = camera.position;
    this.position.set(0, world.heightAt(0, 8) + EYE_HEIGHT, 8);
    camera.rotation.set(0, Math.PI, 0); // face the enemy approach (-Z)

    this.velocity = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.keys = {};
    this.aiming = false;
    this.sprinting = false;
    this.speed = 0;

    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.alive = true;
    this.lastDamage = -999;
    this.time = 0;
    this.shakeAmp = 0;
    this.onDamaged = null;
    this.onDeath = null;

    this.baseFov = camera.fov;

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  damage(amount, opts = {}) {
    if (!this.alive || amount <= 0) return;
    this.health -= amount;
    this.lastDamage = this.time;
    this.audio.playerHit();
    this.shake(0.22);
    if (this.onDamaged) this.onDamaged(amount, opts);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  shake(amp) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  recoil() {
    // flintlock kick: pitch the view up sharply
    this.camera.rotation.x += 0.035;
    this.shake(0.12);
  }

  update(dt) {
    this.time += dt;
    if (!this.alive) return;

    // slow field-dressing regen after 6 quiet seconds
    if (this.time - this.lastDamage > 6 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 3.5 * dt);
    }

    const k = this.keys;
    this.sprinting = !!(k['ShiftLeft'] || k['ShiftRight']) && !this.aiming;
    const maxSpeed = this.aiming ? AIM_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    _fwd.normalize();
    _right.crossVectors(_fwd, new THREE.Vector3(0, 1, 0));

    _wish.set(0, 0, 0);
    if (k['KeyW']) _wish.add(_fwd);
    if (k['KeyS']) _wish.sub(_fwd);
    if (k['KeyD']) _wish.add(_right);
    if (k['KeyA']) _wish.sub(_right);
    if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(maxSpeed);

    const accel = this.grounded ? 10 : 2.5;
    this.velocity.x += (_wish.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (_wish.z - this.velocity.z) * Math.min(1, accel * dt);

    if (k['Space'] && this.grounded) {
      this.vy = JUMP_VEL;
      this.grounded = false;
    }
    this.vy -= GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.vy * dt;

    this.position.x = THREE.MathUtils.clamp(this.position.x, -BOUND, BOUND);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -BOUND, BOUND);

    const floor = this.world.heightAt(this.position.x, this.position.z) + EYE_HEIGHT;
    if (this.position.y <= floor) {
      this.position.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    // head bob
    if (this.grounded && this.speed > 0.5) {
      this.position.y += Math.abs(Math.sin(this.time * (this.sprinting ? 11 : 8))) * 0.045 * (this.speed / maxSpeed);
    }

    // screen shake
    if (this.shakeAmp > 0.001) {
      this.camera.rotation.x += (Math.random() - 0.5) * this.shakeAmp * 0.06;
      this.camera.rotation.y += (Math.random() - 0.5) * this.shakeAmp * 0.06;
      this.shakeAmp *= Math.exp(-7 * dt);
    }

    // aim zoom
    const targetFov = this.aiming ? 48 : this.baseFov;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 12 * dt);
    this.camera.updateProjectionMatrix();
  }
}
