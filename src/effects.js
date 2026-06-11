import * as THREE from 'three';

function makeRadialTexture(inner = 'rgba(255,255,255,0.85)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.flashes = [];

    this.smokeTex = makeRadialTexture('rgba(255,255,255,0.7)');
    this.fireTex = makeRadialTexture('rgba(255,230,150,1)', 'rgba(255,120,20,0)');
    this.dustTex = makeRadialTexture('rgba(160,130,90,0.8)', 'rgba(160,130,90,0)');

    this.flashLight = new THREE.PointLight(0xffc466, 0, 18, 2);
    scene.add(this.flashLight);
    this.flashTimer = 0;
  }

  _spawn(tex, opts) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: opts.color ?? 0xffffff,
      transparent: true,
      opacity: opts.opacity ?? 0.8,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(opts.pos);
    const size = opts.size ?? 1;
    s.scale.setScalar(size);
    this.scene.add(s);
    this.particles.push({
      sprite: s,
      vel: opts.vel ?? new THREE.Vector3(),
      life: 0,
      maxLife: opts.life ?? 1.5,
      grow: opts.grow ?? 1.5,
      fade: opts.opacity ?? 0.8,
      drag: opts.drag ?? 0.95,
      gravity: opts.gravity ?? 0,
    });
    return s;
  }

  muzzleSmoke(pos, dir) {
    // A thick rolling powder cloud — the signature of black-powder battle.
    for (let i = 0; i < 10; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        Math.random() * 0.9 + 0.25,
        (Math.random() - 0.5) * 1.6
      );
      const vel = dir.clone().multiplyScalar(2.2 + Math.random() * 2.5).add(spread);
      this._spawn(this.smokeTex, {
        pos: pos.clone().addScaledVector(dir, 0.3 + Math.random() * 0.9),
        vel,
        size: 0.5 + Math.random() * 0.7,
        life: 1.6 + Math.random() * 1.6,
        grow: 1.6,
        opacity: 0.5,
        color: new THREE.Color().setHSL(0.08, 0.08, 0.72 + Math.random() * 0.15),
        drag: 0.9,
        gravity: 0.25,
      });
    }
  }

  muzzleFlash(pos, dir) {
    const p = pos.clone().addScaledVector(dir, 0.25);
    this._spawn(this.fireTex, {
      pos: p, vel: dir.clone().multiplyScalar(1.5),
      size: 0.7 + Math.random() * 0.3, life: 0.09, grow: 6, opacity: 1,
    });
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 30;
    this.flashTimer = 0.07;
  }

  enemyShot(pos, dir) {
    this._spawn(this.fireTex, { pos: pos.clone(), vel: dir.clone().multiplyScalar(2), size: 0.6, life: 0.08, grow: 5, opacity: 1 });
    for (let i = 0; i < 5; i++) {
      this._spawn(this.smokeTex, {
        pos: pos.clone().addScaledVector(dir, 0.4),
        vel: dir.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5))),
        size: 0.5 + Math.random() * 0.5, life: 1.4 + Math.random(), grow: 1.3,
        opacity: 0.45, color: 0xd8d2c2, gravity: 0.2,
      });
    }
  }

  cannonBlast(pos, dir) {
    this._spawn(this.fireTex, { pos: pos.clone().addScaledVector(dir, 1), vel: dir.clone().multiplyScalar(3), size: 1.6, life: 0.12, grow: 8, opacity: 1 });
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 50;
    this.flashTimer = 0.1;
    for (let i = 0; i < 14; i++) {
      this._spawn(this.smokeTex, {
        pos: pos.clone().addScaledVector(dir, 0.8 + Math.random()),
        vel: dir.clone().multiplyScalar(3 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2)),
        size: 0.8 + Math.random(), life: 2.2 + Math.random() * 2, grow: 1.8,
        opacity: 0.5, color: 0xcfc8b8, drag: 0.9, gravity: 0.3,
      });
    }
  }

  explosion(pos) {
    this._spawn(this.fireTex, { pos: pos.clone(), vel: new THREE.Vector3(0, 2, 0), size: 2, life: 0.16, grow: 10, opacity: 1 });
    this.flashLight.position.copy(pos).y += 1;
    this.flashLight.intensity = 60;
    this.flashTimer = 0.12;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(this.dustTex, {
        pos: pos.clone(),
        vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 5), 3 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 5)),
        size: 0.7 + Math.random() * 0.9, life: 1 + Math.random(), grow: 1.2,
        opacity: 0.85, gravity: -6, drag: 0.96,
      });
    }
    for (let i = 0; i < 8; i++) {
      this._spawn(this.smokeTex, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
        size: 1.2 + Math.random(), life: 2.5 + Math.random() * 2, grow: 1.6,
        opacity: 0.45, color: 0x6b6157, gravity: 0.4,
      });
    }
  }

  bloodPuff(pos) {
    for (let i = 0; i < 6; i++) {
      this._spawn(this.dustTex, {
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5),
        size: 0.25 + Math.random() * 0.3, life: 0.5 + Math.random() * 0.4, grow: 1.8,
        opacity: 0.85, color: 0x7e1b12, gravity: -4,
      });
    }
  }

  dirtImpact(pos) {
    for (let i = 0; i < 5; i++) {
      this._spawn(this.dustTex, {
        pos: pos.clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2),
        size: 0.2 + Math.random() * 0.25, life: 0.5 + Math.random() * 0.4, grow: 1.6,
        opacity: 0.8, gravity: -5,
      });
    }
  }

  update(dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashLight.intensity = 0;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const k = p.life / p.maxLife;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.vel.y += p.gravity * dt; // positive = buoyant smoke, negative = falling debris
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.addScalar(p.grow * dt);
      p.sprite.material.opacity = p.fade * (1 - k);
    }
  }
}
