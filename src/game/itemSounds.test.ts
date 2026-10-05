import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./audio', () => ({ sfx: vi.fn(), duck: vi.fn() }));

import { sfx } from './audio';
import { racerAt, raceWith } from './testkit';
import { updateItems } from './items';
import type { Hazard } from './runtime';

const sounds = () => vi.mocked(sfx).mock.calls.map(c => c[0]);
const hazard = (kind: Hazard['kind'], x: number, z: number, owner: number, target: number | null = null): Hazard =>
  ({ id: 90, kind, x, y: 0, z, vx: 0, vy: 0, vz: 0, owner, target, life: 9, armed: 0, ground: 0 });

beforeEach(() => vi.mocked(sfx).mockClear());

describe('item sounds', () => {
  it('fuel plays the boost sound', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.item = 'fuel'; me.controls.useItem = true;
    updateItems(race, 0.016, vi.fn());
    expect(sounds()).toEqual(['fuelBoost']);
  });

  it('dropping crude oil plays the drop sound', () => {
    const me = racerAt(1, 40, true), race = raceWith([me]);
    me.item = 'oil'; me.controls.useItem = true;
    updateItems(race, 0.016, vi.fn());
    expect(sounds()).toEqual(['oilDrop']);
  });

  it('slipping on oil plays the skid sound for the player', () => {
    const me = racerAt(1, 40, true), race = raceWith([me, racerAt(2, 10)]);
    const at = me.body!.translation();
    race.hazards.push(hazard('oil', at.x, at.z, 2));
    updateItems(race, 0.016, vi.fn());
    expect(sounds()).toContain('oilSlip');
  });

  it('a juju landing on the player plays the hit sound', () => {
    const me = racerAt(1, 40, true), race = raceWith([me, racerAt(2, 10)]);
    const at = me.body!.translation();
    race.hazards.push(hazard('juju', at.x, at.z, 2, 1));
    updateItems(race, 0.016, vi.fn());
    expect(sounds()).toContain('jujuHit');
  });

  it('odeshi running out plays the break sound once, for the player only', () => {
    const me = racerAt(1, 40, true), ai = racerAt(2, 10), race = raceWith([me, ai]);
    me.shield = 0.01; ai.shield = 0.01;
    updateItems(race, 0.1, vi.fn());
    updateItems(race, 0.1, vi.fn());
    expect(sounds().filter(s => s === 'odeshiBreak')).toHaveLength(1);
  });
});
