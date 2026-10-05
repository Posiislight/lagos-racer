import type { SoundName } from '../config/sounds';

const NEAR = 6, FAR = 80;

/** How an incoming juju should sound: louder and higher as it closes in, panned to the side it comes from. */
export function jujuWarning(dist: number, relAngle: number): { gain: number; rate: number; pan: number } {
  const closeness = Math.min(1, Math.max(0, (FAR - dist) / (FAR - NEAR)));
  return { gain: closeness, rate: 0.8 + closeness * 0.8, pan: -Math.sin(relAngle) };
}

/** Decoded sample files by name. A file that fails to load is simply absent, so callers fall back to synth. */
export function createSampleStore() {
  const buffers = new Map<SoundName, AudioBuffer>();
  return {
    get: (name: SoundName) => buffers.get(name),
    async load(name: SoundName, url: string, fetchFn: (u: string) => Promise<ArrayBuffer>, decode: (b: ArrayBuffer) => Promise<AudioBuffer>) {
      try { buffers.set(name, await decode(await fetchFn(url))); } catch { /* no file: the synth sound plays */ }
    },
  };
}
