import * as THREE from "three";
import { hash3 } from "@/lib/rng";

const N = 12;
let texture: THREE.CanvasTexture | null = null;

/**
 * One 12×12 cut-out tile of ground cover for the meadow floor: short grass strokes, clover leaves and specks in
 * grey shades, so the instance colour tints them light or dark over the plain moss. The alpha only feeds alphaTest.
 */
export function groundTexture(): THREE.CanvasTexture {
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  const grey = (v: number) => `rgb(${v},${v},${v})`;
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(hash3(i, 1, 0) * N), y = Math.floor(hash3(i, 2, 0) * N), kind = hash3(i, 3, 0);
    if (kind < 0.55) { // a grass stroke, light or dark
      ctx.fillStyle = grey(hash3(i, 4, 0) > 0.5 ? 255 : 105);
      ctx.fillRect(x, y, 1, 2 + Math.floor(hash3(i, 5, 0) * 2));
    } else if (kind < 0.75) { // a clover leaf
      ctx.fillStyle = grey(100);
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x + 1, y - 1, 1, 3);
    } else if (kind < 0.92) { // a light speck
      ctx.fillStyle = grey(235);
      ctx.fillRect(x, y, 1, 1);
    } else { // a soft dark patch
      ctx.fillStyle = grey(150);
      ctx.fillRect(x, y, 3, 2);
    }
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
