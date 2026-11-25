// Subtle Web Audio API synthesized sound effects for tactile card reveals, votes, and verdicts

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.08, delay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playCardRevealSound(isImposter: boolean): void {
  if (isImposter) {
    playTone(220, 0.24, 'triangle', 0.07, 0);
    playTone(185, 0.32, 'triangle', 0.06, 0.09);
  } else {
    playTone(440, 0.16, 'sine', 0.06, 0);
    playTone(587.33, 0.22, 'sine', 0.06, 0.07);
  }
}

export function playVoteCastSound(): void {
  playTone(523.25, 0.12, 'sine', 0.06, 0);
  playTone(659.25, 0.14, 'sine', 0.05, 0.06);
}

export function playVerdictSound(caughtImposter: boolean): void {
  if (caughtImposter) {
    playTone(523.25, 0.16, 'triangle', 0.07, 0);
    playTone(659.25, 0.16, 'triangle', 0.07, 0.1);
    playTone(783.99, 0.28, 'triangle', 0.08, 0.2);
  } else {
    playTone(311.13, 0.2, 'sawtooth', 0.04, 0);
    playTone(261.63, 0.3, 'sawtooth', 0.04, 0.14);
  }
}

export function playJoinChime(): void {
  playTone(660, 0.1, 'sine', 0.04, 0);
}
