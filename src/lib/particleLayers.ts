import type { Season } from "./seasons.ts";

export type Layer = { id: number; season: Season; leaving: boolean };
export type LayerEvent =
  | { type: "season"; season: Season; id: number }
  | { type: "drained"; id: number }
  | { type: "stop" };

const leave = (layers: Layer[]) => layers.map((l) => (l.leaving ? l : { ...l, leaving: true }));

export function nextLayers(layers: Layer[], e: LayerEvent): Layer[] {
  switch (e.type) {
    case "season":
      if (layers.some((l) => !l.leaving && l.season === e.season)) return layers;
      return [...leave(layers), { id: e.id, season: e.season, leaving: false }];
    case "drained":
      return layers.some((l) => l.id === e.id) ? layers.filter((l) => l.id !== e.id) : layers;
    case "stop":
      return layers.every((l) => l.leaving) ? layers : leave(layers);
  }
}
