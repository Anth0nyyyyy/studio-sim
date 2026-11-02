/** Sons synthétisés à la volée (WebAudio), sans fichier audio. */
type Note = [freq: number, dur: number, delay?: number];

let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('studio-sim-muted') === '1'; } catch { /* stockage indisponible */ }

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function play(notes: Note[], type: OscillatorType = 'square', volume = 0.05) {
  const a = audio();
  if (!a) return;
  for (const [freq, dur, delay = 0] of notes) {
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
}

export const SFX = {
  click: () => play([[660, 0.04]], 'square', 0.02),
  error: () => play([[220, 0.12], [165, 0.18, 0.1]], 'sawtooth', 0.04),
  coin: () => play([[988, 0.06], [1319, 0.14, 0.06]], 'square', 0.04),
  release: () => play([[523, 0.12], [659, 0.12, 0.12], [784, 0.12, 0.24], [1047, 0.3, 0.36]], 'triangle', 0.08),
  achievement: () => play([[784, 0.1], [988, 0.1, 0.1], [1175, 0.1, 0.2], [1568, 0.35, 0.3]], 'square', 0.04),
  event: () => play([[440, 0.1], [554, 0.16, 0.1]], 'triangle', 0.06),
  fail: () => play([[392, 0.25], [330, 0.25, 0.25], [262, 0.6, 0.5]], 'triangle', 0.08),
};

export const isMuted = () => muted;
export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('studio-sim-muted', muted ? '1' : '0'); } catch { /* stockage indisponible */ }
  if (!muted) SFX.click();
  return muted;
}
