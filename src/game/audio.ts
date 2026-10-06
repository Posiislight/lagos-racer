import { SOUNDS, type SoundName } from '../config/sounds';
import { AMBIENCE_UNDER_RADIO } from '../config/radio';
import { createSampleStore } from './audioLogic';

/**
 * Sound is synthesised with Web Audio, and any sound can be replaced by a recording in `public/audio/`
 * (see `src/config/sounds.ts`): the file plays if it has loaded, otherwise the synth version does.
 * The context is created on the first user gesture, as browsers require; until then everything is a no-op.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambienceBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let engineBus: GainNode | null = null;
let enabled = true;
const store = createSampleStore();

const AMBIENCE_FULL = 0.35;
let ambienceLevel = AMBIENCE_FULL;

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
  ambienceBus = ctx.createGain(); ambienceBus.gain.value = ambienceLevel; ambienceBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  engineBus = ctx.createGain(); engineBus.connect(master);
  loadSounds();
}

/** Fetch the optional recordings, ambience first. A missing file just leaves the synth sound in place. */
function loadSounds() {
  if (!ctx) return;
  const c = ctx;
  // A host that answers a missing file with its index page (200, text/html) counts as "no file".
  const fetchBytes = (u: string) => fetch(u).then(r => (r.ok && !r.headers.get('content-type')?.includes('text/html') ? r.arrayBuffer() : Promise.reject(new Error(u))));
  const decode = (b: ArrayBuffer) => c.decodeAudioData(b);
  const names = (Object.keys(SOUNDS) as SoundName[]).sort((a, b) => Number(b === 'ambience') - Number(a === 'ambience'));
  void (async () => {
    for (const n of names) await store.load(n, SOUNDS[n].file, fetchBytes, decode);
  })();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  if (!ctx || !sfxBus) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.setValueAtTime(vol, start + Math.max(0.02, dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(sfxBus);
  o.start(start); o.stop(start + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ctx!.createBuffer(1, ctx!.sampleRate, ctx!.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(start: number, dur: number, vol: number, filterFreq: number, q = 1) {
  if (!ctx || !sfxBus) return;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuffer(); src.loop = true;
  f.type = 'lowpass'; f.frequency.setValueAtTime(filterFreq, start); f.frequency.exponentialRampToValueAtTime(80, start + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(start); src.stop(start + dur + 0.05);
}

/** Play a recording once, if it has loaded. Returns whether it did, so the caller can fall back to synth. */
function play(name: SoundName): boolean {
  const buffer = store.get(name);
  if (!ctx || !sfxBus || !buffer) return false;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer; g.gain.value = SOUNDS[name].volume;
  src.connect(g).connect(sfxBus);
  src.start();
  return true;
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

export type SfxKind = 'pickup' | 'throw' | 'oil' | 'slip' | 'boost' | 'juju' | 'odeshi' | 'lap' | 'finish' | 'bump' | 'goat' | 'chicken'
  | 'push' | 'soup' | 'cough' | 'notReady' | 'jujuHit' | 'oilDrop' | 'oilSlip' | 'fuelBoost' | 'odeshiBreak';

/** The recording, if there is one, that stands in for each synth sound. */
const FILE: Partial<Record<SfxKind, SoundName>> = {
  juju: 'jujuHit', jujuHit: 'jujuHit', oil: 'oilDrop', oilDrop: 'oilDrop', slip: 'oilSlip', oilSlip: 'oilSlip',
  boost: 'fuelBoost', fuelBoost: 'fuelBoost', odeshi: 'odeshi', odeshiBreak: 'odeshiBreak', push: 'pushSquad', soup: 'soup',
};

export function sfx(kind: SfxKind) {
  if (!ctx) return;
  const file = FILE[kind];
  if (file && play(file)) return;
  const t = ctx.currentTime;
  switch (kind) {
    case 'pickup': [660, 880, 1320].forEach((f, i) => tone(f, t + i * 0.06, 0.09, 'triangle', 0.08)); break;
    case 'throw': tone(500, t, 0.25, 'sawtooth', 0.04, 160); break;
    case 'oil': case 'oilDrop': noise(t, 0.4, 0.15, 900, 4); tone(140, t, 0.3, 'sine', 0.06, 60); tone(260, t + 0.05, 0.25, 'sine', 0.05, 90); break;
    case 'boost': case 'fuelBoost': noise(t, 0.6, 0.25, 3000, 0.7); tone(180, t, 0.5, 'sawtooth', 0.06, 520); break;
    case 'slip': case 'oilSlip': tone(700, t, 0.6, 'triangle', 0.05, 200); noise(t, 0.45, 0.12, 1200, 3); break;
    case 'juju': tone(320, t, 0.5, 'sine', 0.12, 90); tone(480, t + 0.05, 0.4, 'triangle', 0.05, 140); noise(t, 0.5, 0.15, 900, 2); break;
    case 'jujuHit': tone(320, t, 0.55, 'sine', 0.16, 70); tone(480, t + 0.05, 0.4, 'triangle', 0.06, 120); tone(60, t, 0.35, 'sine', 0.2); noise(t, 0.5, 0.2, 900, 2); break;
    case 'push': [392, 523, 659].forEach((f, i) => tone(f, t + i * 0.07, 0.12, 'square', 0.05)); noise(t, 0.3, 0.1, 2500, 0.7); [0.25, 0.37, 0.49].forEach(d => noise(t + d, 0.1, 0.22, 300, 1)); break;
    case 'soup': noise(t, 0.5, 0.18, 4000, 1.2); noise(t, 0.9, 0.08, 6000, 0.7); tone(300, t, 0.4, 'sine', 0.03, 180); break;
    case 'cough': [0, 0.16].forEach(d => { noise(t + d, 0.12, 0.25, 700, 2); tone(150, t + d, 0.1, 'sawtooth', 0.04, 90); }); break;
    case 'notReady': tone(150, t, 0.1, 'square', 0.05); break;
    case 'odeshi': [523, 784, 1175].forEach((f, i) => tone(f, t + i * 0.07, 0.2, 'sine', 0.07)); tone(2093, t + 0.22, 0.3, 'triangle', 0.03); break;
    case 'odeshiBreak': [1175, 880, 587].forEach((f, i) => tone(f, t + i * 0.08, 0.18, 'sine', 0.06, f * 0.8)); noise(t + 0.2, 0.25, 0.12, 5000, 0.8); break;
    case 'lap': [784, 988].forEach((f, i) => tone(f, t + i * 0.1, 0.14, 'square', 0.05)); break;
    case 'finish': [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, i === 3 ? 0.5 : 0.14, 'square', 0.06)); break;
    case 'bump': noise(t, 0.15, 0.2, 600); break;
    case 'goat': bleat(t); noise(t, 0.12, 0.25, 700); break;
    case 'chicken': [0, 0.09, 0.16].forEach((d, i) => tone(900 + i * 250, t + d, 0.07, 'square', 0.05, 1500 + i * 200)); noise(t, 0.1, 0.15, 3000); break;
  }
}

/** A goat's "meeeh": a nasal sawtooth with fast vibrato, falling at the end. */
function bleat(start: number) {
  if (!ctx || !sfxBus) return;
  const o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(520, start); o.frequency.linearRampToValueAtTime(470, start + 0.45); o.frequency.linearRampToValueAtTime(360, start + 0.7);
  lfo.frequency.value = 32; depth.gain.value = 28; lfo.connect(depth).connect(o.frequency);
  f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(0.2, start + 0.04); g.gain.setValueAtTime(0.2, start + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.72);
  o.connect(f).connect(g).connect(sfxBus);
  o.start(start); lfo.start(start); o.stop(start + 0.75); lfo.stop(start + 0.75);
}

/** Keep the street bed quieter while the radio is on, like hearing it from a passing danfo. */
export function setAmbienceUnderRadio(on: boolean) {
  ambienceLevel = on ? AMBIENCE_UNDER_RADIO : AMBIENCE_FULL;
  if (ctx && ambienceBus) ambienceBus.gain.setTargetAtTime(ambienceLevel, ctx.currentTime, 0.3);
}

/** Lower the street ambience for a moment so a big sound reads clearly. */
export function duck(seconds: number) {
  if (!ctx || !ambienceBus) return;
  const t = ctx.currentTime, g = ambienceBus.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(ambienceLevel * 0.55, t, 0.05);
  g.setTargetAtTime(ambienceLevel, t + seconds, 0.3);
}

/** The Lagos street bed: a recording if there is one, else murmur plus the odd distant horn ping. Idempotent. */
let ambience: { stop: () => void } | null = null;
export function startAmbience() {
  if (!ctx || !ambienceBus || ambience) return;
  const c = ctx, bus = ambienceBus, buffer = store.get('ambience');
  const src = c.createBufferSource(), g = c.createGain();
  g.connect(bus);
  src.loop = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  if (buffer) {
    src.buffer = buffer; g.gain.value = SOUNDS.ambience.volume; src.connect(g);
  } else {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    src.buffer = noiseBuffer(); g.gain.value = 0.12; src.connect(f).connect(g);
    const ping = () => {
      if (stopped) return;
      tone(Math.random() < 0.5 ? 520 : 620, c.currentTime, 0.15, 'square', 0.015);
      timer = setTimeout(ping, 3000 + Math.random() * 6000);
    };
    timer = setTimeout(ping, 1500);
  }
  src.start();
  ambience = {
    stop() {
      stopped = true; clearTimeout(timer);
      try { src.stop(); } catch { /* already stopped */ }
      g.disconnect();
    },
  };
}

export function stopAmbience() {
  ambience?.stop();
  ambience = null;
}

/** A looping sound whose loudness, pitch and stereo position are set from the game each frame (juju hum, soup bubbling). */
export class Loop {
  private nodes: AudioScheduledSourceNode[] = [];
  private detunes: AudioParam[] = [];
  private g: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  constructor(private name: 'jujuFly' | 'soupBubble') {}
  start() {
    if (!ctx || !sfxBus || this.g) return;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.pan = ctx.createStereoPanner?.() ?? null;
    if (this.pan) this.g.connect(this.pan).connect(sfxBus); else this.g.connect(sfxBus);
    const buffer = store.get(this.name);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer; src.loop = true; src.connect(this.g); src.start();
      this.nodes.push(src); this.detunes.push(src.detune);
    } else if (this.name === 'jujuFly') {
      // An eerie beating hum with a slow wobble.
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 5; depth.gain.value = 12; lfo.connect(depth);
      [[110, 'sine'], [116, 'triangle'], [220, 'sine']].forEach(([f, type]) => {
        const o = ctx!.createOscillator();
        o.type = type as OscillatorType; o.frequency.value = f as number;
        depth.connect(o.frequency); o.connect(this.g!); o.start();
        this.nodes.push(o); this.detunes.push(o.detune);
      });
      lfo.start(); this.nodes.push(lfo);
    } else {
      // Bubbling: bandpassed noise whose volume pulses.
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), pulse = ctx.createOscillator(), depth = ctx.createGain(), amp = ctx.createGain();
      src.buffer = noiseBuffer(); src.loop = true;
      f.type = 'bandpass'; f.frequency.value = 450; f.Q.value = 3;
      amp.gain.value = 0.5; pulse.type = 'square'; pulse.frequency.value = 6.5; depth.gain.value = 0.5;
      pulse.connect(depth).connect(amp.gain);
      src.connect(f).connect(amp).connect(this.g);
      src.start(); pulse.start();
      this.nodes.push(src, pulse); this.detunes.push(src.detune);
    }
  }
  /** gain 0..1 of the manifest volume, rate 1 = normal pitch, pan -1 left .. 1 right. */
  set(gain: number, rate: number, pan: number) {
    if (!ctx || !this.g) return;
    const t = ctx.currentTime, cents = 1200 * Math.log2(Math.max(0.25, rate));
    this.g.gain.setTargetAtTime(gain * SOUNDS[this.name].volume, t, 0.05);
    this.detunes.forEach(d => d.setTargetAtTime(cents, t, 0.05));
    this.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }
  stop() {
    if (!this.g) return;
    this.nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    this.g.disconnect(); this.pan?.disconnect();
    this.nodes = []; this.detunes = []; this.g = null; this.pan = null;
  }
}

/** Continuous engine note for the player: two detuned saws through a lowpass, pitched by speed. */
export class Engine {
  private o1: OscillatorNode | null = null;
  private o2: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private f: BiquadFilterNode | null = null;
  private lift = 1;
  constructor(private base: number) {}
  start() {
    if (!ctx || !engineBus || this.o1) return;
    this.o1 = ctx.createOscillator(); this.o2 = ctx.createOscillator();
    this.o1.type = 'sawtooth'; this.o2.type = 'square';
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 600;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.o1.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g).connect(engineBus);
    this.o1.start(); this.o2.start();
  }
  /** Pitch the engine up a quarter while a boost (fuel or Push Squad) is on. */
  setBoost(on: boolean) { this.lift = on ? 1.25 : 1; }
  /** rpm 0..1, load 0..1 (throttle). */
  update(rpm: number, load: number) {
    if (!ctx || !this.o1 || !this.o2 || !this.g || !this.f) return;
    const t = ctx.currentTime, f = this.base * (1 + rpm * 2.2) * this.lift;
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
