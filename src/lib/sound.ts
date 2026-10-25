// No ambience: sound only means the fold/grow chime and the poke chirp. Off by default.
let ctx: AudioContext | null = null;
let on = false;

/** The AudioContext is created on the first switch-on (a user gesture), never before. */
export function setSoundOn(next: boolean): void {
  on = next;
  if (!on) return;
  try {
    ctx ??= new AudioContext();
  } catch {
    return; // no Web Audio here: stay silent
  }
  ctx.resume().catch(() => {});
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType = "triangle", vol = 0.12) {
  if (!on || !ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + t0;
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Falling notes as the tree folds into the code, rising as it grows back. */
export function playChime(direction: "fold" | "grow"): void {
  const notes = direction === "fold" ? [784, 659, 523, 392] : [392, 523, 659, 784];
  notes.forEach((f, i) => tone(f, i * 0.12, 0.6));
}

export function playChirp(): void {
  tone(1800, 0, 0.08, "square", 0.04);
  tone(2200, 0.1, 0.08, "square", 0.04);
}
