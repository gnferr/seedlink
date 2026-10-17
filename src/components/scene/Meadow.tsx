"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { meadowLayout, type Deco } from "@/lib/meadow";
import type { Environment } from "@/lib/motion";
import { mixHex } from "@/lib/seasons";
import { groundPalette, type GroundPalette } from "@/lib/world";
import { createSwayMaterial, updateSwayMaterial, type SwayKind } from "./blockMaterial";

// Just under the pad (-0.01), so the pad stays the visible surface inside the rim.
const TOP = -0.02;
const RIM_W = 0.6;
const RIM_H = 0.25;
const TEXELS = 8;
const GROUND_LIFT = "#fffbd0";
const GROUND_LIFT_WEIGHT = 0.22;
const noRaycast = () => null;

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function merged(...parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

// Keeps only faces that can be seen: the orbit never goes below the slab, and each layer covers the top of
// the one beneath. A covered face still costs a full-frame fill, which halved the frame rate on a software GPU.
function seen(g: THREE.BufferGeometry, top: boolean) {
  g.groups = g.groups.filter((f) => f.materialIndex !== 3 && (top || f.materialIndex !== 2));
  return g;
}

// Slab layer in the slab frame (see MeadowLayout), turned to face the Reveal camera.
function slabLayer(l: { slabFar: number; slabNear: number; slabSize: number }, h: number, y: number) {
  const g = box(l.slabFar + l.slabNear, h, l.slabSize, (l.slabNear - l.slabFar) / 2, y, 0);
  return g.rotateY(-Math.PI / 4); // local +x (along) -> world (1, 0, 1)/√2
}

// World-aligned UVs so the turned slab's texels still line up with the module grid (edges at half-integers).
function worldUv(g: THREE.BufferGeometry) {
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.5) / TEXELS, (pos.getZ(i) + 0.5) / TEXELS);
  uv.needsUpdate = true;
  return g;
}

// A grey pixel pattern the grass colour multiplies: one texel per module, nearest-filtered.
function pixelTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = TEXELS;
  const g = c.getContext("2d")!;
  for (let y = 0; y < TEXELS; y++)
    for (let x = 0; x < TEXELS; x++) {
      const v = 238 + (((x * 7 + y * 13 + ((x * y) % 5)) * 37) % 18);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Deco[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  items.forEach((d, i) => {
    o.position.set(d.x, TOP, d.z);
    o.rotation.y = Math.floor(d.tint * 4) * (Math.PI / 2);
    o.scale.setScalar(d.scale);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, c.setScalar(0.8 + d.tint * 0.35));
  });
  mesh.frustumCulled = false; // sway moves vertices past the static bounds
  mesh.raycast = noRaycast;
  return mesh;
}

function buildMeadow(plane: number) {
  const layout = meadowLayout(plane);
  const D = layout.slabDepth;
  // Lambert, not standard: the slab covers most of the frame, and flat matte faces look the same for far less shading.
  const lit = () => new THREE.MeshLambertMaterial();
  const texture = pixelTexture();
  // Unlit and not tone-mapped: the top shows the palette hex as designed (lighting turned winter snow grey).
  const grassTop = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const grassSide = lit();
  const dirt = lit();
  const deepDirt = lit();
  const sway = (height: number) => createSwayMaterial("grass", { roughness: 1, metalness: 0, height });
  const tuftMat = sway(1.5);
  const flowerMat = sway(1.45);
  const bushMat = sway(1.6);

  const geos = {
    grass: worldUv(seen(slabLayer(layout, 1, TOP - 0.5), true)),
    dirt: seen(slabLayer(layout, 2, TOP - 2), false),
    deep: seen(slabLayer(layout, D - 3, TOP - 3 - (D - 3) / 2), false),
    // Decoration is sized to read at the default zoom: tufts ~1.5 high, flower heads half a module, bushes ~2-2.75 wide.
    tuft: merged(box(0.24, 1.1, 0.24, -0.24, 0.55, 0.1), box(0.24, 1.5, 0.24, 0.1, 0.75, -0.16), box(0.24, 0.9, 0.24, 0.28, 0.45, 0.2)),
    stem: box(0.14, 1, 0.14, 0, 0.5, 0),
    head: box(0.7, 0.55, 0.7, 0, 1.17, 0),
    bush: merged(box(1.25, 1.1, 1.25, 0, 0.55, 0), box(0.85, 0.5, 0.85, 0, 1.35, 0)),
  };
  const group = new THREE.Group();
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; only the top carries the pixel pattern.
  // Material arrays, because three draws a single-material mesh whole and ignores its groups.
  const slab = [
    new THREE.Mesh(geos.grass, [grassSide, grassSide, grassTop, grassSide, grassSide, grassSide]),
    new THREE.Mesh(geos.dirt, Array(6).fill(dirt)),
    new THREE.Mesh(geos.deep, Array(6).fill(deepDirt)),
  ];
  slab.forEach((m) => (m.raycast = noRaycast));
  group.add(
    ...slab,
    instanced(geos.tuft, tuftMat, layout.tufts),
    instanced(geos.stem, tuftMat, layout.flowers),
    instanced(geos.head, flowerMat, layout.flowers),
    instanced(geos.bush, bushMat, layout.bushes),
  );

  const h = layout.pad.half + RIM_W / 2;
  const rim = merged(
    box(plane + 2 * RIM_W, RIM_H, RIM_W, 0, TOP + RIM_H / 2, h),
    box(plane + 2 * RIM_W, RIM_H, RIM_W, 0, TOP + RIM_H / 2, -h),
    box(RIM_W, RIM_H, plane, h, TOP + RIM_H / 2, 0),
    box(RIM_W, RIM_H, plane, -h, TOP + RIM_H / 2, 0),
  );

  const materials = [grassTop, grassSide, dirt, deepDirt, tuftMat, flowerMat, bushMat];
  return {
    group,
    rim,
    sway: [tuftMat, flowerMat, bushMat],
    tint(p: GroundPalette) {
      // Lifted toward a pale yellow so the ground sits lighter and warmer than any green canopy; snow stays white.
      const ground = mixHex(p.grass, GROUND_LIFT, GROUND_LIFT_WEIGHT);
      grassTop.color.set(ground);
      grassSide.color.set(ground);
      dirt.color.set(p.dirt);
      deepDirt.color.set(p.dirt).multiplyScalar(0.78);
      // Tufts and bushes read as darker growth on the grass; flowers carry the season's blossom.
      tuftMat.color.set(p.grass).multiplyScalar(0.82);
      bushMat.color.set(p.grass).multiplyScalar(0.66);
      flowerMat.color.set(p.blossom);
    },
    dispose() {
      Object.values(geos).forEach((g) => g.dispose());
      rim.dispose();
      materials.forEach((m) => m.dispose());
      texture.dispose();
    },
  };
}

export default function Meadow({ plane, env, padColour }: { plane: number; env: Environment; padColour: string }) {
  const world = useMemo(() => buildMeadow(plane), [plane]);
  useEffect(() => () => world.dispose(), [world]);
  const rimMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: mixHex(padColour, "#808080", 0.55), roughness: 1, metalness: 0 }),
    [padColour],
  );
  useEffect(() => () => rimMaterial.dispose(), [rimMaterial]);

  // Reused frame argument and last applied phase: the loop allocates only when the season moves.
  const frame = useRef({ time: 0, env, summerColour: "", kind: "grass" as SwayKind });
  const applied = useRef({ world: null as typeof world | null, phase: NaN });
  useFrame((state) => {
    const f = frame.current;
    f.time = state.clock.elapsedTime;
    f.env = env;
    for (const m of world.sway) updateSwayMaterial(m, f);
    const a = applied.current;
    const phase = env.phase.value;
    if (a.world === world && a.phase === phase) return;
    a.world = world;
    a.phase = phase;
    world.tint(groundPalette(phase));
  });

  return (
    <>
      <primitive object={world.group} />
      <mesh geometry={world.rim} material={rimMaterial} raycast={noRaycast} />
    </>
  );
}
