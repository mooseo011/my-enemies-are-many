# Muskets & Glory — A Napoleonic Skirmish

A Napoleonic-era first-person shooter built with [three.js](https://threejs.org/). Hold a French
redoubt against waves of advancing British line infantry, armed with a single-shot Charleville
flintlock musket and bayonet, supported by your own artillery battery.

![Era](https://img.shields.io/badge/Anno-1809-c9a227) ![Engine](https://img.shields.io/badge/Engine-three.js-049EF4)

## Play

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`) and click **Take the Field**.

Production build:

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | March |
| `Shift` | Double-quick (sprint) |
| Mouse | Look |
| Left click | Fire musket |
| Right click (hold) | Take aim |
| `R` | Reload (4-stage flintlock drill) |
| `F` | Bayonet strike |
| `Space` | Jump |

## Gameplay

- **One shot, one kill** — your musket is deadly but takes a full ramrod drill (~3.5 s) to reload,
  with period-accurate stages: bite the cartridge, charge with powder, ram down the ball, prime and cock.
- **Smoothbore spread** — accuracy suffers while moving; hold right-click to steady your aim.
- **Line infantry AI** — redcoats advance in ranks, halt to present arms, volley, reload, and
  charge with bayonets when close.
- **Artillery** — from wave 3 enemy cannon lob ballistic roundshot at you (you can destroy them with
  two musket balls); your own French battery periodically shells the enemy line.
- **Waves** — each wave is larger than the last. Survive as long as you can. *Vive l'Empereur!*

## Tech

- three.js with Vite, no game engine.
- All sound is procedurally synthesized with WebAudio (musket cracks, cannon booms, ramrod taps,
  drum rolls) — no audio files.
- Particle effects (black-powder smoke, muzzle flash, explosions) via canvas-generated sprite textures.
- Procedural terrain, gradient sky shader, animated cloth flags.

## Third-party 3D models (bundled in `public/models/`)

| Model | Author | License |
| --- | --- | --- |
| Animated soldier (`soldier.glb`) | [Quaternius](https://quaternius.com/) (via three.js examples) | CC0 |
| Cannon (`cannon-mobile.gltf`) | [Kenney](https://kenney.nl/) | CC0 |
| Barrel (`barrel.gltf`) | [Kenney](https://kenney.nl/) | CC0 |
| Trees (`tree-big.gltf`, `tree-small.gltf`) | [Quaternius](https://quaternius.com/) | CC0 |

The first-person flintlock musket, shakos, flags, and scenery are built procedurally from three.js
primitives.
