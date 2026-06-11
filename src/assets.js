import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Third-party CC0 / public-domain models bundled in /public/models:
//  - soldier.glb      : animated soldier by Quaternius (three.js examples)
//  - cannon-mobile    : cannon by Kenney
//  - tree-big/small   : trees by Quaternius
//  - barrel           : barrel by Kenney
const MANIFEST = {
  soldier: 'models/soldier.glb',
  cannon: 'models/cannon-mobile.gltf',
  treeBig: 'models/tree-big.gltf',
  treeSmall: 'models/tree-small.gltf',
  barrel: 'models/barrel.gltf',
};

export async function loadAssets() {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const entries = await Promise.all(
    Object.entries(MANIFEST).map(async ([key, url]) => {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + url);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return [key, gltf];
    })
  );

  draco.dispose();
  return Object.fromEntries(entries);
}
