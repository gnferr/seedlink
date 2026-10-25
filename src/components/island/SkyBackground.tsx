"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { renderSky, SKY_HEIGHT, SKY_WIDTH } from "@/lib/sky";
import type { Season } from "@/lib/seasons";

/** The season's dithered pixel sky as scene.background, cover-fitted to the viewport. */
export default function SkyBackground({ season }: { season: Season }) {
  const { width, height } = useThree((s) => s.size);

  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SKY_WIDTH;
    canvas.height = SKY_HEIGHT;
    const image = canvas.getContext("2d")!.createImageData(SKY_WIDTH, SKY_HEIGHT);
    image.data.set(renderSky(season));
    canvas.getContext("2d")!.putImageData(image, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [season]);

  // Primitives are not auto-disposed.
  useEffect(() => () => texture.dispose(), [texture]);

  // Cover fit: crop the sky image to the viewport aspect, centred.
  useLayoutEffect(() => {
    const aspect = width / Math.max(1, height);
    const img = SKY_WIDTH / SKY_HEIGHT;
    if (aspect > img) {
      texture.repeat.set(1, img / aspect);
      texture.offset.set(0, (1 - img / aspect) / 2);
    } else {
      texture.repeat.set(aspect / img, 1);
      texture.offset.set((1 - aspect / img) / 2, 0);
    }
  }, [texture, width, height]);

  return <primitive object={texture} attach="background" />;
}
