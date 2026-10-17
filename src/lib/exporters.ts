import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { blockBox } from "./blockGeometry";
import { QUIET_ZONE } from "./qr";
import type { Block } from "./solver";
import type { Theme } from "./themes";

function download(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

/** Reads the preserved drawing buffer; callers gate on a settled frame whose code verified. */
export function exportPng(canvas: HTMLCanvasElement, filename: string): void {
  download(canvas.toDataURL("image/png"), filename);
}

export async function exportGlb(blocks: Block[], size: number, theme: Theme, filename: string): Promise<void> {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(size + QUIET_ZONE * 2, size + QUIET_ZONE * 2);
  const material = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: theme.roughness, metalness: theme.metalness });
  const { trunk, canopy, body } = theme.regionColors;
  const materials = { trunk: material(trunk), canopy: material(canopy), body: material(body) };
  const base = new THREE.MeshStandardMaterial({ color: theme.colorLight, roughness: 1, metalness: 0 });

  try {
    const scene = new THREE.Scene();
    const ground = new THREE.Mesh(plane, base);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const offset = (size - 1) / 2;
    for (const b of blocks) {
      const mesh = new THREE.Mesh(box, materials[b.region ?? "body"]);
      const { x, y, z, h } = blockBox(b, offset);
      mesh.position.set(x, y, z);
      mesh.scale.set(1, h, 1);
      scene.add(mesh);
    }

    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    const url = URL.createObjectURL(new Blob([glb as ArrayBuffer], { type: "model/gltf-binary" }));
    download(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } finally {
    box.dispose();
    plane.dispose();
    base.dispose();
    Object.values(materials).forEach((m) => m.dispose());
  }
}
