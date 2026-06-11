import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildMusketModel } from './musket.js';

const WALK_SPEED = 2.2;
const RUN_SPEED = 4.3;
const CHARGE_RANGE = 11;
const MELEE_RANGE = 2.0;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function makeShako() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.095, 0.17, 12),
    new THREE.MeshLambertMaterial({ color: 0x191512 })
  );
  body.castShadow = true;
  g.add(body);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.4 })
  );
  plate.position.set(0, 0.01, 0.085);
  g.add(plate);
  const plume = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0xeeeeee })
  );
  plume.scale.set(0.7, 1.6, 0.7);
  plume.position.set(0, 0.12, 0.06);
  g.add(plume);
  return g;
}

class EnemySoldier {
  constructor(manager, gltf, materials, spawnPos, targetJitter) {
    this.manager = manager;
    this.group = skeletonClone(gltf.scene);
    this.group.position.copy(spawnPos);
    this.targetJitter = targetJitter;

    let headBone = null;
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o.material && o.material.name === 'VanguardBodyMat') o.material = materials.body;
        else if (o.material) o.material = materials.visor;
      }
      if (o.isBone && o.name === 'mixamorigHead') headBone = o;
    });

    // Napoleonic shako, compensating for the skeleton's bone-space scale.
    if (headBone) {
      this.group.updateMatrixWorld(true);
      const ws = headBone.getWorldScale(new THREE.Vector3()).x || 1;
      const hat = makeShako();
      hat.scale.setScalar(1 / ws);
      hat.position.set(0, 0.16 / ws, 0.02 / ws);
      headBone.add(hat);
    }

    this.musket = buildMusketModel({ bayonet: true });
    this.musket.position.set(0.26, 1.08, 0.18);
    this.musket.rotation.set(Math.PI / 2, 0, 0.08); // shoulder arms while marching
    this.group.add(this.musket);

    // Invisible hitbox for player raycasts
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.85, 0.75),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = 0.92;
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);

    // Animation
    this.mixer = new THREE.AnimationMixer(this.group);
    this.actions = {};
    for (const clip of gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.play('Walk');

    this.state = 'ADVANCE';
    this.timer = 1 + Math.random() * 2;
    this.stopRange = 24 + Math.random() * 14;
    this.meleeCooldown = 0;
    this.dead = false;
    this.deathT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
  }

  play(name, fade = 0.25) {
    const next = this.actions[name];
    if (!next || this.current === next) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  faceToward(target, dt, snap = false) {
    _v1.subVectors(target, this.group.position);
    const yaw = Math.atan2(_v1.x, _v1.z); // model faces +Z
    if (snap) {
      this.group.rotation.y = yaw;
    } else {
      let d = yaw - this.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.group.rotation.y += d * Math.min(1, dt * 6);
    }
  }

  shoulderArms() {
    this.musket.rotation.set(Math.PI / 2, 0, 0.08);
    this.musket.position.set(0.26, 1.08, 0.18);
  }

  presentArms() {
    // Levelled at the player (model forward is +Z, musket forward is -Z)
    this.musket.rotation.set(0, Math.PI, 0);
    this.musket.position.set(0.2, 1.38, 0.3);
  }

  muzzleWorld(out) {
    return this.musket.localToWorld(out.set(0, 0.012, -1.05));
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.state = 'DEAD';
    this.deathT = 0;
    // Freeze the current animation pose (don't reset to T-pose)
    this.mixer.timeScale = 0;
    this.hitbox.userData.enemy = null;
    this.musket.rotation.set(Math.PI / 2 - 0.3, 0, 0.6);
    this.musket.position.set(0.5, 0.2, 0.4);
  }

  update(dt, player, world) {
    const playerPos = player.position;

    if (this.dead) {
      this.deathT += dt;
      const t = Math.min(this.deathT / 0.75, 1);
      const e = 1 - (1 - t) * (1 - t);
      this.group.rotation.x = -e * (Math.PI / 2) * 0.96;
      this.group.rotation.z = e * 0.22 * this.fallDir;
      if (this.deathT > 5) {
        this.group.position.y -= dt * 0.35; // sink into the soil
      }
      return this.deathT > 7.5;
    }

    this.mixer.update(dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);

    _v1.copy(playerPos).add(this.targetJitter);
    _v2.subVectors(_v1, this.group.position);
    _v2.y = 0;
    const dist = _v2.length();
    _v2.normalize();

    switch (this.state) {
      case 'ADVANCE': {
        this.faceToward(_v1, dt);
        this.group.position.addScaledVector(_v2, WALK_SPEED * dt);
        this.shoulderArms();
        if (dist < CHARGE_RANGE) {
          this.state = 'CHARGE';
          this.play('Run', 0.2);
        } else if (dist < this.stopRange) {
          this.state = 'AIM';
          this.timer = 0.9 + Math.random() * 1.1;
          this.play('Idle', 0.2);
        }
        break;
      }
      case 'AIM': {
        this.faceToward(playerPos, dt);
        this.presentArms();
        this.timer -= dt;
        if (dist < CHARGE_RANGE) {
          this.state = 'CHARGE';
          this.play('Run', 0.2);
        } else if (this.timer <= 0) {
          this.fireAtPlayer(player, dist);
          this.state = 'RELOAD';
          this.timer = 4.2 + Math.random() * 2.5;
        }
        break;
      }
      case 'RELOAD': {
        this.faceToward(playerPos, dt);
        this.shoulderArms();
        this.timer -= dt;
        if (dist < CHARGE_RANGE) {
          this.state = 'CHARGE';
          this.play('Run', 0.2);
        } else if (this.timer <= 0) {
          if (dist > this.stopRange + 8) {
            this.state = 'ADVANCE';
            this.play('Walk', 0.25);
          } else {
            this.state = 'AIM';
            this.timer = 0.8 + Math.random();
          }
        }
        break;
      }
      case 'CHARGE': {
        this.faceToward(playerPos, dt, false);
        this.presentArms();
        if (dist > MELEE_RANGE * 0.8) {
          this.group.position.addScaledVector(_v2, RUN_SPEED * dt);
        }
        if (dist < MELEE_RANGE && this.meleeCooldown <= 0) {
          this.meleeCooldown = 1.4;
          this.manager.onMeleePlayer(this);
        }
        if (dist > CHARGE_RANGE * 2.2) {
          this.state = 'ADVANCE';
          this.play('Walk', 0.25);
        }
        break;
      }
    }

    this.group.position.y = world.heightAt(this.group.position.x, this.group.position.z);
    return false;
  }

  fireAtPlayer(player, dist) {
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    const dir = _v1.copy(player.position).sub(muzzle).normalize();
    this.manager.effects.enemyShot(muzzle, dir);
    this.manager.audio.enemyVolley(dist);

    const movePenalty = player.speed * 0.035;
    const p = THREE.MathUtils.clamp(0.34 - dist * 0.007 - movePenalty, 0.05, 0.38);
    if (Math.random() < p) {
      player.damage(9 + Math.random() * 10);
    } else {
      // near miss: whizzing ball, dirt kick near the player
      if (Math.random() < 0.6) this.manager.audio.musketBallWhiz();
      const miss = player.position.clone().add(
        new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)
      );
      miss.y = this.manager.world.heightAt(miss.x, miss.z) + 0.05;
      this.manager.effects.dirtImpact(miss);
    }
  }
}

class EnemyCannon {
  constructor(manager, assets, pos) {
    this.manager = manager;
    this.group = assets.cannon.scene.clone();
    this.group.scale.setScalar(2.2);
    this.group.position.copy(pos);
    this.hp = 2;
    this.dead = false;
    this.timer = 4 + Math.random() * 4;

    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 2.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = 0.8;
    this.hitbox.userData.cannon = this;
    this.group.add(this.hitbox);
  }

  update(dt, player) {
    if (this.dead) return;
    this.group.lookAt(_v1.set(player.position.x, this.group.position.y, player.position.z));
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 9 + Math.random() * 5;
      this.fire(player);
    }
  }

  fire(player) {
    const muzzle = _v1.copy(this.group.position);
    muzzle.y += 1.1;
    const target = player.position.clone().add(
      new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)
    );
    const dir = _v2.copy(target).sub(muzzle);
    const dist = dir.length();
    dir.normalize();
    muzzle.addScaledVector(dir, 2.4);
    this.manager.effects.cannonBlast(muzzle.clone(), dir.clone());
    this.manager.audio.cannonFire(this.group.position.distanceTo(player.position));
    // Ballistic shot: flat-ish trajectory with enough lift to land near the target.
    const speed = 42;
    const flightT = dist / speed;
    const vel = dir.multiplyScalar(speed);
    vel.y += 0.5 * 9.8 * flightT;
    this.manager.spawnCannonball(muzzle.clone(), vel);
  }

  hit() {
    this.hp--;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.hitbox.userData.cannon = null;
      this.manager.effects.explosion(this.group.position.clone());
      this.manager.audio.explosion(20);
      this.group.rotation.z = 0.6;
      this.group.position.y -= 0.2;
      return true;
    }
    return false;
  }
}

export class EnemyManager {
  constructor(scene, assets, world, effects, audio, player) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.player = player;

    this.enemies = [];
    this.cannons = [];
    this.cannonballs = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.kills = 0;
    this.onKill = null;
    this.onMelee = null;

    // Redcoat tint shared across every soldier
    const src = {};
    assets.soldier.scene.traverse((o) => {
      if (o.isMesh && o.material) src[o.material.name] = o.material;
    });
    const body = src['VanguardBodyMat'].clone();
    body.color = new THREE.Color(0xff8a66);
    body.emissive = new THREE.Color(0x36100a);
    const visor = src['Vanguard_VisorMat'].clone();
    visor.color = new THREE.Color(0x222222);
    this.materials = { body, visor };
  }

  get aliveCount() {
    return this.enemies.filter((e) => !e.dead).length + this.spawnQueue.length;
  }

  spawnWave(waveNum) {
    const count = Math.min(4 + waveNum * 2, 26);
    const px = this.player.position.x;
    const centerX = THREE.MathUtils.clamp(px + (Math.random() - 0.5) * 40, -60, 60);
    const baseZ = -78 - Math.random() * 15;
    const perRank = Math.min(count, 9);
    for (let i = 0; i < count; i++) {
      const rank = Math.floor(i / perRank);
      const file = i % perRank;
      const x = centerX + (file - (perRank - 1) / 2) * 2.3 + (Math.random() - 0.5) * 0.6;
      const z = baseZ - rank * 3.2 + (Math.random() - 0.5) * 0.7;
      this.spawnQueue.push({
        pos: new THREE.Vector3(x, 0, z),
        jitter: new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 6),
      });
    }
    if (waveNum >= 3) {
      const n = waveNum >= 6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const cx = THREE.MathUtils.clamp(centerX + (i === 0 ? -28 : 28), -80, 80);
        const cz = baseZ + 12;
        const pos = new THREE.Vector3(cx, this.world.heightAt(cx, cz), cz);
        const cannon = new EnemyCannon(this, this.assets, pos);
        this.scene.add(cannon.group);
        this.cannons.push(cannon);
      }
    }
  }

  spawnCannonball(pos, vel) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.cannonballs.push({ mesh, vel, life: 0 });
  }

  onMeleePlayer(enemy) {
    this.audio.bayonetHit();
    this.player.damage(16 + Math.random() * 8);
    if (this.onMelee) this.onMelee(enemy);
  }

  // Player shot: raycast against hitboxes. Returns 'kill' | 'cannon' | null.
  tryHit(raycaster) {
    const boxes = [];
    for (const e of this.enemies) if (!e.dead) boxes.push(e.hitbox);
    for (const c of this.cannons) if (!c.dead) boxes.push(c.hitbox);
    const hits = raycaster.intersectObjects(boxes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const enemy = hit.object.userData.enemy;
    const cannon = hit.object.userData.cannon;
    if (enemy) {
      this.effects.bloodPuff(hit.point);
      this.killEnemy(enemy);
      return 'kill';
    }
    if (cannon) {
      this.effects.dirtImpact(hit.point);
      if (cannon.hit()) {
        this.kills++;
        if (this.onKill) this.onKill();
        return 'kill';
      }
      return 'cannon';
    }
    return null;
  }

  // Bayonet: kill the nearest live enemy within reach of the camera direction.
  tryBayonet(position, direction) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      _v1.copy(e.group.position);
      _v1.y += 1.2;
      _v2.subVectors(_v1, position);
      const dist = _v2.length();
      if (dist < 2.6 && _v2.normalize().dot(direction) > 0.55) {
        this.effects.bloodPuff(_v1);
        this.audio.bayonetHit();
        this.killEnemy(e);
        return true;
      }
    }
    return false;
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.die();
    this.kills++;
    if (this.onKill) this.onKill();
  }

  // Friendly artillery support: lob a shell into the densest part of the line.
  fireFriendlyCannon(muzzle) {
    const targets = this.enemies.filter(
      (e) => !e.dead && e.group.position.distanceTo(this.player.position) > 35
    );
    if (!targets.length) return false;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const dir = _v1.copy(target.group.position).sub(muzzle).setY(0).normalize();
    this.effects.cannonBlast(muzzle.clone(), dir.clone());
    this.audio.cannonFire(muzzle.distanceTo(this.player.position));
    const impact = target.group.position.clone();
    const flight = muzzle.distanceTo(impact) / 45;
    setTimeout(() => {
      impact.y = this.world.heightAt(impact.x, impact.z);
      this.effects.explosion(impact);
      this.audio.explosion(impact.distanceTo(this.player.position));
      let slain = 0;
      for (const e of this.enemies) {
        if (!e.dead && slain < 3 && e.group.position.distanceTo(impact) < 5) {
          this.killEnemy(e);
          slain++;
        }
      }
    }, flight * 1000);
    return true;
  }

  update(dt) {
    // Trickle spawn so big waves don't pop in at once
    this.spawnTimer -= dt;
    if (this.spawnQueue.length && this.spawnTimer <= 0) {
      this.spawnTimer = 0.12;
      const { pos, jitter } = this.spawnQueue.shift();
      pos.y = this.world.heightAt(pos.x, pos.z);
      const e = new EnemySoldier(this, this.assets.soldier, this.materials, pos, jitter);
      this.scene.add(e.group);
      this.enemies.push(e);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const done = this.enemies[i].update(dt, this.player, this.world);
      if (done) {
        this.scene.remove(this.enemies[i].group);
        this.enemies.splice(i, 1);
      }
    }

    for (const c of this.cannons) c.update(dt, this.player);

    for (let i = this.cannonballs.length - 1; i >= 0; i--) {
      const b = this.cannonballs[i];
      b.life += dt;
      b.vel.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const ground = this.world.heightAt(b.mesh.position.x, b.mesh.position.z);
      if (b.mesh.position.y <= ground || b.life > 8) {
        b.mesh.position.y = ground;
        this.effects.explosion(b.mesh.position.clone());
        const d = b.mesh.position.distanceTo(this.player.position);
        this.audio.explosion(d);
        if (d < 7) {
          this.player.damage(Math.max(0, 38 * (1 - d / 7)));
          this.player.shake(0.5 * (1 - d / 10));
        } else if (d < 18) {
          this.player.shake(0.18);
        }
        // Shells also maim nearby redcoats
        for (const e of this.enemies) {
          if (!e.dead && e.group.position.distanceTo(b.mesh.position) < 4) this.killEnemy(e);
        }
        this.scene.remove(b.mesh);
        this.cannonballs.splice(i, 1);
      }
    }
  }

  resetField() {
    for (const e of this.enemies) this.scene.remove(e.group);
    for (const c of this.cannons) this.scene.remove(c.group);
    for (const b of this.cannonballs) this.scene.remove(b.mesh);
    this.enemies = [];
    this.cannons = [];
    this.cannonballs = [];
    this.spawnQueue = [];
  }
}
