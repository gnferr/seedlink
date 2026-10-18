"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DECO, meadowLayout, type Deco } from "@/lib/meadow";
import type { Environment } from "@/lib/motion";
import { mixHex } from "@/lib/seasons";
import { SNOW_CAP, renderGround, seasonBlend, type RenderedGround } from "@/lib/world";
import { createSwayMaterial, updateSwayMaterial, type SwayKind } from "./blockMaterial";

// Just under the pad (-0.01), so the pad stays the visible surface inside the rim.
const TOP = -0.02;
const RIM_W = 0.6;
const RIM_H = 0.25;
const TEXELS = 8;
const noRaycast = () => null;
// Scratch objects for instance writes; only touched when the season phase moves.
const o = new THREE.Object3D();
const c = new THREE.Color();

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

// Quarter turns only, so footprints stay the axis-aligned squares meadowLayout plans for. `k` scales the
// whole instance about its base: 0 hides it exactly (Winter flowers, out-of-season leaves and snow caps).
function place(mesh: THREE.InstancedMesh, items: Deco[], k = 1) {
  items.forEach((d, i) => {
    o.position.set(d.x, TOP, d.z);
    o.rotation.set(0, Math.floor(d.tint * 4) * (Math.PI / 2), 0);
    o.scale.setScalar(d.scale * k);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// One of four season tints per instance (flowers, leaves), with a little brightness variation.
function paint(mesh: THREE.InstancedMesh, items: Deco[], tints: THREE.Color[]) {
  items.forEach((d, i) => {
    const q = d.tint * 4;
    mesh.setColorAt(i, c.copy(tints[Math.floor(q)]).multiplyScalar(0.85 + (q % 1) * 0.25));
  });
  mesh.instanceColor!.needsUpdate = true;
}

// Tufts and stems carry their whole colour per instance; in Autumn every third tuft turns leaf-coloured.
function growth(mesh: THREE.InstancedMesh, items: Deco[], base: THREE.Color, leaves: THREE.Color[] | null, autumn: number) {
  items.forEach((d, i) => {
    c.copy(base).multiplyScalar(0.8 + d.tint * 0.35);
    if (leaves && i % 3 === 0) c.lerp(leaves[Math.floor(d.tint * 4)], autumn);
    mesh.setColorAt(i, c);
  });
  mesh.instanceColor!.needsUpdate = true;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Deco[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  place(mesh, items);
  items.forEach((d, i) => mesh.setColorAt(i, c.setScalar(0.8 + d.tint * 0.35)));
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
  // Same sway height as the bush, so a full-size cap moves exactly with the bush under it.
  const capMat = sway(1.6);
  capMat.color.set(SNOW_CAP);
  // Tufts, stems, flowers and leaves take their whole colour per instance.
  flowerMat.color.set("#ffffff");
  const tuftColour = new THREE.Color();
  // Fallen leaves lie flat and never move, so a plain material keeps them still in every view.
  const leafMat = lit();
  const tints = [0, 1, 2, 3].map(() => new THREE.Color());
  const { half: B } = DECO.bush;
  const { half: F } = DECO.flower;
  const { half: L } = DECO.leaf;

  const geos = {
    grass: worldUv(seen(slabLayer(layout, 1, TOP - 0.5), true)),
    dirt: seen(slabLayer(layout, 2, TOP - 2), false),
    deep: seen(slabLayer(layout, D - 3, TOP - 3 - (D - 3) / 2), false),
    // Decoration is sized to read at the default zoom: tufts ~1.5 high, flower heads half a module, bushes ~2-2.75 wide.
    // Half-widths match DECO in meadowLayout (tuft blades reach 0.4), which plans the footprints.
    tuft: merged(box(0.24, 1.1, 0.24, -0.24, 0.55, 0.1), box(0.24, 1.5, 0.24, 0.1, 0.75, -0.16), box(0.24, 0.9, 0.24, 0.28, 0.45, 0.2)),
    stem: box(0.14, 1, 0.14, 0, 0.5, 0),
    head: box(2 * F, 0.55, 2 * F, 0, 1.17, 0),
    bush: merged(box(2 * B, 1.1, 2 * B, 0, 0.55, 0), box(0.85, 0.5, 0.85, 0, 1.35, 0)),
    // A thin overhang on the snow cap, inside the planner's footprint margin.
    cap: merged(box(2 * B + 0.06, 0.14, 2 * B + 0.06, 0, 1.17, 0), box(0.93, 0.14, 0.93, 0, 1.67, 0)),
    leaf: box(2 * L, 0.06, 1.6 * L, 0, 0.03, 0),
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
  const deco = {
    tufts: instanced(geos.tuft, tuftMat, layout.tufts),
    stems: instanced(geos.stem, tuftMat, layout.flowers),
    heads: instanced(geos.head, flowerMat, layout.flowers),
    bushes: instanced(geos.bush, bushMat, layout.bushes),
    caps: instanced(geos.cap, capMat, layout.bushes),
    leaves: instanced(geos.leaf, leafMat, layout.leaves),
  };
  group.add(...slab, ...Object.values(deco));
  const blends = { winter: NaN, autumn: NaN };

  const h = layout.pad.half + RIM_W / 2;
  const rim = merged(
    box(plane + 2 * RIM_W, RIM_H, RIM_W, 0, TOP + RIM_H / 2, h),
    box(plane + 2 * RIM_W, RIM_H, RIM_W, 0, TOP + RIM_H / 2, -h),
    box(RIM_W, RIM_H, plane, h, TOP + RIM_H / 2, 0),
    box(RIM_W, RIM_H, plane, -h, TOP + RIM_H / 2, 0),
  );

  const materials = [grassTop, grassSide, dirt, deepDirt, tuftMat, flowerMat, bushMat, capMat, leafMat];
  return {
    group,
    rim,
    sway: [tuftMat, flowerMat, bushMat, capMat],
    /** Applies a season phase: colours always, instance scales only when the winter/autumn blend moved. */
    tint(r: RenderedGround, winter: number, autumn: number) {
      grassTop.color.set(r.ground);
      grassSide.color.set(r.ground);
      dirt.color.set(r.dirt);
      deepDirt.color.set(r.deepDirt);
      bushMat.color.set(r.bush);
      r.flowers.forEach((h, i) => tints[i].set(h));
      tuftColour.set(r.tuft);
      growth(deco.tufts, layout.tufts, tuftColour, tints, autumn);
      growth(deco.stems, layout.flowers, tuftColour, null, 0);
      paint(deco.heads, layout.flowers, tints);
      paint(deco.leaves, layout.leaves, tints); // the autumn flower set doubles as leaf colours
      if (winter !== blends.winter) {
        // Winter: no flowers, snow on the bushes.
        place(deco.stems, layout.flowers, 1 - winter);
        place(deco.heads, layout.flowers, 1 - winter);
        place(deco.caps, layout.bushes, winter);
        blends.winter = winter;
      }
      if (autumn !== blends.autumn) {
        place(deco.leaves, layout.leaves, autumn);
        blends.autumn = autumn;
      }
    },
    dispose() {
      // InstancedMesh.dispose frees instanceMatrix/instanceColor, which geometry.dispose does not.
      Object.values(deco).forEach((m) => m.dispose());
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
    world.tint(renderGround(phase), seasonBlend("WINTER", phase), seasonBlend("AUTUMN", phase));
  });

  return (
    <>
      <primitive object={world.group} />
      <mesh geometry={world.rim} material={rimMaterial} raycast={noRaycast} />
    </>
  );
}
