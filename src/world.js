import * as THREE from 'three';

export const TERRAIN_SIZE = 560;

// Deterministic rolling-hills height field. Kept gentle so musket lines read well.
export function heightAt(x, z) {
  let h =
    2.4 * Math.sin(x * 0.018 + 1.3) * Math.cos(z * 0.016 - 0.7) +
    1.2 * Math.sin(x * 0.041 + 0.4) * Math.sin(z * 0.037 + 2.1) +
    0.5 * Math.sin(x * 0.09 - 1.1) * Math.cos(z * 0.085 + 0.3);
  // Flatten the central battle lane so volleys have clear sightlines.
  const lane = Math.exp(-((x * x) / 3800));
  h *= 1 - 0.55 * lane;
  return h;
}

function buildTerrain() {
  const seg = 140;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x5d7a3a);
  const dry = new THREE.Color(0x8a8a4e);
  const dirt = new THREE.Color(0x6e5a3c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.11) * Math.cos(x * 0.07 - z * 0.05);
    c.copy(grass).lerp(dry, n * 0.7);
    if (h > 2.2) c.lerp(dirt, Math.min((h - 2.2) / 2, 0.6));
    // Trampled mud along the battle lane
    const lane = Math.exp(-((x * x) / 2200));
    c.lerp(dirt, lane * 0.35 * (0.6 + 0.4 * Math.sin(z * 0.3)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildSky() {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x6f93b8) },
      mid: { value: new THREE.Color(0xb9c6c9) },
      bottom: { value: new THREE.Color(0xd9d2b8) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y;
        vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bottom, pow(-h, 0.7));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

function makeFlag(colors, scene) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0x4a3826 })
  );
  pole.position.y = 3;
  pole.castShadow = true;
  group.add(pole);

  const geo = new THREE.PlaneGeometry(2.4, 1.5, 16, 8);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const x = geo.attributes.position.getX(i); // -1.2 .. 1.2
    const t = (x + 1.2) / 2.4;
    tmp.set(colors[Math.min(colors.length - 1, Math.floor(t * colors.length))]);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  flag.position.set(1.25, 5.1, 0);
  flag.castShadow = true;
  group.add(flag);
  group.userData.flag = flag;
  group.userData.basePositions = geo.attributes.position.array.slice();
  scene.add(group);
  return group;
}

export function createWorld(scene, assets) {
  scene.background = new THREE.Color(0xb9c6c9);
  scene.fog = new THREE.Fog(0xb9c6c9, 60, 420);

  scene.add(buildSky());
  scene.add(buildTerrain());

  const hemi = new THREE.HemisphereLight(0xcfd8df, 0x55603e, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // --- Scatter trees away from the battle lane ---
  const treeSources = [assets.treeBig.scene, assets.treeSmall.scene];
  const rng = mulberry32(1809);
  for (let i = 0; i < 90; i++) {
    const x = (rng() - 0.5) * TERRAIN_SIZE * 0.92;
    const z = (rng() - 0.5) * TERRAIN_SIZE * 0.92;
    if (Math.abs(x) < 42 && z < 30 && z > -190) continue; // keep the field clear
    const tree = treeSources[i % 2].clone();
    const s = 2.2 + rng() * 2.6;
    tree.scale.setScalar(s);
    tree.position.set(x, heightAt(x, z), z);
    tree.rotation.y = rng() * Math.PI * 2;
    scene.add(tree);
  }

  // --- The player's redoubt: earthwork, gabions, barrels, cannons, flags ---
  const dirtMat = new THREE.MeshLambertMaterial({ color: 0x6e5a3c });
  const gabionMat = new THREE.MeshLambertMaterial({ color: 0x8a734f });
  for (let i = -4; i <= 4; i++) {
    if (Math.abs(i) < 2) continue; // gap to walk/shoot through
    const x = i * 2.1;
    const z = -6;
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 1.5, 10), gabionMat);
    g.position.set(x, heightAt(x, z) + 0.75, z);
    g.castShadow = g.receiveShadow = true;
    scene.add(g);
    const mound = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.6), dirtMat);
    mound.position.set(x, heightAt(x, z) + 0.3, z + 1.2);
    mound.rotation.x = -0.15;
    mound.receiveShadow = true;
    scene.add(mound);
  }

  for (let i = 0; i < 5; i++) {
    const b = assets.barrel.scene.clone();
    const x = -9 + i * 1.4 + (i % 2) * 0.5;
    const z = 4 + (i % 3);
    b.scale.setScalar(1.4);
    b.position.set(x, heightAt(x, z), z);
    b.rotation.y = i * 1.3;
    scene.add(b);
  }

  // Friendly artillery flanking the redoubt
  const cannons = [];
  for (const x of [-13, 13]) {
    const c = assets.cannon.scene.clone();
    c.scale.setScalar(2.2);
    const z = -4;
    c.position.set(x, heightAt(x, z), z);
    c.rotation.y = Math.PI; // face the enemy (-Z)
    scene.add(c);
    cannons.push({
      group: c,
      muzzle: new THREE.Vector3(x, heightAt(x, z) + 1.2, z - 2.2),
    });
  }

  const flagFr = makeFlag(['#1c3f94', '#1c3f94', '#f4f1e8', '#f4f1e8', '#b01c2e', '#b01c2e'], scene);
  flagFr.position.set(3.5, heightAt(3.5, 2), 2);
  const flagRegiment = makeFlag(['#b01c2e', '#d9c98e', '#b01c2e'], scene);
  flagRegiment.position.set(-3.5, heightAt(-3.5, 2), 2);
  const flags = [flagFr, flagRegiment];

  // Distant ruined farmhouse for flavour
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x9a917e });
  const house = new THREE.Group();
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 0.7), stoneMat);
  w1.position.y = 2.25;
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 7), stoneMat);
  w2.position.set(-4.6, 1.7, 3.5);
  const w3 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 5), stoneMat);
  w3.position.set(4.6, 1.1, 2.5);
  for (const w of [w1, w2, w3]) { w.castShadow = w.receiveShadow = true; house.add(w); }
  house.position.set(-52, heightAt(-52, -85), -85);
  house.rotation.y = 0.5;
  scene.add(house);

  let time = 0;
  function update(dt) {
    time += dt;
    for (const f of flags) {
      const flag = f.userData.flag;
      const base = f.userData.basePositions;
      const p = flag.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        const k = (x + 1.2) / 2.4;
        p.setZ(i, Math.sin(time * 3.2 + x * 2.6) * 0.16 * k + Math.sin(time * 5.1 + x * 4.2) * 0.06 * k);
      }
      p.needsUpdate = true;
      flag.geometry.computeVertexNormals();
    }
  }

  return { heightAt, update, cannons };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
