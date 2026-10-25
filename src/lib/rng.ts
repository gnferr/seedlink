// Seeded randomness for the link-grown island. Same algorithms as the spike, so a given link always grows the same island.

// FNV-1a over the string's characters; returns an unsigned 32-bit int.
export function hashString(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: a seeded stream of values in [0, 1).
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless hash of a 3D cell (and optional salt) into [0, 1).
export function hash3(x: number, y: number, z: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 1442695041 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
