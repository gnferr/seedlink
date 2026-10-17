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

// A grey pixel pattern the grass colour multiplies: one texel per module, nearest-filtered.
function pixelTexture(repeat: number) {
  const c = document.createElement("canvas");
  c.width = c.height = TEXELS;
  const g = c.getContext("2d")!;
  for (let y = 0; y < TEXELS; y++)
    for (let x = 0; x < TEXELS; x++) {
      const v = 226 + (((x * 7 + y * 13 + ((x * y) % 5)) * 37) % 30);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
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
  const S = layout.slabSize;
  const D = layout.slabDepth;
  // Lambert, not standard: the slab covers most of the frame, and flat matte faces look the same for far less shading.
  const lit = () => new THREE.MeshLambertMaterial();
  const texture = pixelTexture(S / TEXELS);
  const grassTop = lit();
  grassTop.map = texture;
  const grassSide = lit();
  const dirt = lit();
  const deepDirt = lit();
  const sway = (height: number) => createSwayMaterial("grass", { roughness: 1, metalness: 0, height });
  const tuftMat = sway(0.75);
  const flowerMat = sway(0.66);
  const bushMat = sway(1.25);

  const geos = {
    grass: seen(box(S, 1, S, 0, TOP - 0.5, 0), true),
    dirt: seen(box(S, 2, S, 0, TOP - 2, 0), false),
    deep: seen(box(S, D - 3, S, 0, TOP - 3 - (D - 3) / 2, 0), false),
    tuft: merged(box(0.12, 0.55, 0.12, -0.12, 0.275, 0.05), box(0.12, 0.75, 0.12, 0.05, 0.375, -0.08), box(0.12, 0.45, 0.12, 0.14, 0.225, 0.1)),
    stem: box(0.08, 0.5, 0.08, 0, 0.25, 0),
    head: box(0.26, 0.22, 0.26, 0, 0.55, 0),
    bush: merged(box(1, 0.9, 1, 0, 0.45, 0), box(0.7, 0.4, 0.7, 0, 1.05, 0)),
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
      grassTop.color.set(p.grass);
      grassSide.color.set(p.grass);
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
