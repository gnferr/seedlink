import * as THREE from "three";
import { hash3 } from "@/lib/rng";

const N = 24;
let texture: THREE.CanvasTexture | null = null;

/**
 * One 24×24 cut-out pixel grass tuft: curved blades, dark at the root and warm and light at the tips, so the
 * instance colour tints it and each tuft reads soft and sunlit. The alpha only feeds alphaTest.
 */
export function grassTexture(): THREE.CanvasTexture {
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  for (let b = 0; b < 11; b++) {
    const root = 2 + hash3(b, 1, 0) * (N - 4), tall = 0.45 + hash3(b, 2, 0) * 0.55, bend = (hash3(b, 3, 0) - 0.5) * 9;
    const top = Math.round(N * (1 - tall));
    for (let y = N - 1; y >= top; y--) {
      const u = (N - 1 - y) / (N - 1 - top); // 0 at the root, 1 at the tip
      const x = Math.round(root + bend * u * u);
      const light = 0.5 + 0.5 * u;
      ctx.fillStyle = `rgb(${Math.round(255 * light)},${Math.round(255 * light)},${Math.round(225 * light + 30 * u)})`;
      ctx.fillRect(x, y, u < 0.55 ? 2 : 1, 1);
    }
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
