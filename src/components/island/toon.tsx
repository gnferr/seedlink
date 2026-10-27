"use client";

import * as THREE from "three";

// Three flat light bands: the painted, cozy look instead of smooth Lambert shading.
const ramp = new THREE.DataTexture(new Uint8Array([60, 60, 60, 255, 150, 150, 150, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

/** The scene's lit material: toon-shaded with the shared three-band ramp. */
export function Toon(props: { map?: THREE.Texture; alphaTest?: number; side?: THREE.Side }) {
  return <meshToonMaterial gradientMap={ramp} {...props} />;
}
