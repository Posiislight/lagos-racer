/**
 * All sound is synthesised with Web Audio (no audio files to download on mobile data).
 * The context is created on the first user gesture, as browsers require.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.7 : 0;
}

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.7 : 0;
  master.connect(ctx.destination);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.setValueAtTime(vol, start + Math.max(0.02, dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start); o.stop(start + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(start: number, dur: number, vol: number, filterFreq: number, q = 1) {
  if (!ctx || !master) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = 'lowpass'; f.frequency.setValueAtTime(filterFreq, start); f.frequency.exponentialRampToValueAtTime(80, start + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master);
  src.start(start); src.stop(start + dur + 0.05);
}

/** Horn: a chord of square waves played in a rhythm, e.g. the danfo's long double honk. */
export function playHorn(h: { freqs: number[]; pattern: number[] }, loud = true) {
  if (!ctx) return;
  let t = ctx.currentTime;
  h.pattern.forEach((dur, i) => {
    if (i % 2 === 0) h.freqs.forEach(f => tone(f, t, dur, 'square', (loud ? 0.06 : 0.025) / h.freqs.length * 2));
    t += dur;
  });
}

export function beep(high = false) {
  if (!ctx) return;
  tone(high ? 1046 : 523, ctx.currentTime, high ? 0.5 : 0.18, 'square', 0.08);
}

export function sfx(kind: 'pickup' | 'throw' | 'oil' | 'slip' | 'boost' | 'juju' | 'odeshi' | 'lap' | 'finish' | 'bump' | 'goat' | 'chicken' | 'push' | 'soup' | 'cough' | 'notReady') {
  if (!ctx) return;
  const t = ctx.currentTime;
  switch (kind) {
    case 'pickup': [660, 880, 1320].forEach((f, i) => tone(f, t + i * 0.06, 0.09, 'triangle', 0.08)); break;
    case 'throw': tone(500, t, 0.25, 'sawtooth', 0.04, 160); break;
    case 'oil': noise(t, 0.4, 0.15, 900, 4); tone(140, t, 0.3, 'sine', 0.06, 60); break;
    case 'boost': noise(t, 0.6, 0.25, 3000, 0.7); tone(180, t, 0.5, 'sawtooth', 0.06, 520); break;
    case 'slip': tone(700, t, 0.45, 'triangle', 0.05, 240); noise(t, 0.3, 0.1, 1200, 3); break;
    case 'juju': tone(320, t, 0.5, 'sine', 0.12, 90); tone(480, t + 0.05, 0.4, 'triangle', 0.05, 140); noise(t, 0.5, 0.15, 900, 2); break;
    case 'push': [392, 523, 659].forEach((f, i) => tone(f, t + i * 0.07, 0.12, 'square', 0.05)); noise(t, 0.3, 0.1, 2500, 0.7); break;
    case 'soup': noise(t, 0.5, 0.18, 4000, 1.2); tone(300, t, 0.4, 'sine', 0.03, 180); break;
    case 'cough': [0, 0.16].forEach(d => { noise(t + d, 0.12, 0.25, 700, 2); tone(150, t + d, 0.1, 'sawtooth', 0.04, 90); }); break;
    case 'notReady': tone(150, t, 0.1, 'square', 0.05); break;
    case 'odeshi': [523, 784, 1175].forEach((f, i) => tone(f, t + i * 0.07, 0.2, 'sine', 0.07)); tone(2093, t + 0.22, 0.3, 'triangle', 0.03); break;
    case 'lap': [784, 988].forEach((f, i) => tone(f, t + i * 0.1, 0.14, 'square', 0.05)); break;
    case 'finish': [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, i === 3 ? 0.5 : 0.14, 'square', 0.06)); break;
    case 'bump': noise(t, 0.15, 0.2, 600); break;
    case 'goat': bleat(t); noise(t, 0.12, 0.25, 700); break;
    case 'chicken': [0, 0.09, 0.16].forEach((d, i) => tone(900 + i * 250, t + d, 0.07, 'square', 0.05, 1500 + i * 200)); noise(t, 0.1, 0.15, 3000); break;
  }
}

/** A goat's "meeeh": a nasal sawtooth with fast vibrato, falling at the end. */
function bleat(start: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(520, start); o.frequency.linearRampToValueAtTime(470, start + 0.45); o.frequency.linearRampToValueAtTime(360, start + 0.7);
  lfo.frequency.value = 32; depth.gain.value = 28; lfo.connect(depth).connect(o.frequency);
  f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(0.2, start + 0.04); g.gain.setValueAtTime(0.2, start + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);
  o.connect(f).connect(g).connect(master);
  o.start(start); lfo.start(start); o.stop(start + 0.75); lfo.stop(start + 0.75);
}

/** Continuous engine note for the player: two detuned saws through a lowpass, pitched by speed. */
export class Engine {
  private o1: OscillatorNode | null = null;
  private o2: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private f: BiquadFilterNode | null = null;
  constructor(private base: number) {}
  start() {
    if (!ctx || !master || this.o1) return;
    this.o1 = ctx.createOscillator(); this.o2 = ctx.createOscillator();
    this.o1.type = 'sawtooth'; this.o2.type = 'square';
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 600;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.o1.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g).connect(master);
    this.o1.start(); this.o2.start();
  }
  /** rpm 0..1, load 0..1 (throttle). */
  update(rpm: number, load: number) {
    if (!ctx || !this.o1 || !this.o2 || !this.g || !this.f) return;
    const t = ctx.currentTime, f = this.base * (1 + rpm * 2.2);
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
    this.f.frequency.setTargetAtTime(400 + rpm * 1400 + load * 600, t, 0.08);
    this.g.gain.setTargetAtTime(0.035 + load * 0.04, t, 0.1);
  }
  stop() {
    try { this.o1?.stop(); this.o2?.stop(); } catch { /* already stopped */ }
    this.g?.disconnect();
    this.o1 = this.o2 = null; this.g = null; this.f = null;
  }
}
