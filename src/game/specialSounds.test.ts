import { beforeEach, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ start: vi.fn(), set: vi.fn(), stop: vi.fn() }));
vi.mock('./audio', () => ({ Loop: class { start = loop.start; set = loop.set; stop = loop.stop; }, sfx: vi.fn(), duck: vi.fn() }));

import { sfx, duck } from './audio';
import { racerAt, raceWith } from './testkit';
import { resetSpecialsAudio, updateSpecials } from './specials';
import { SPECIALS } from '../config/drivers';

beforeEach(() => {
  resetSpecialsAudio();
  vi.mocked(sfx).mockClear(); vi.mocked(duck).mockClear();
  loop.start.mockClear(); loop.set.mockClear(); loop.stop.mockClear();
});

const fire = (driver: 'moshood' | 'mamaput') => {
  const me = racerAt(1, 40, true), race = raceWith([me]);
  me.driver = driver; me.charge = 1; me.controls.special = true;
  updateSpecials(race, 0.016, vi.fn());
  return { me, race };
};

describe('driver special sounds', () => {
  it('Push Squad plays its shout and ducks the street', () => {
    fire('moshood');
    expect(vi.mocked(sfx)).toHaveBeenCalledWith('push');
    expect(vi.mocked(duck)).toHaveBeenCalled();
  });

  it('Pepper Soup Trail sizzles and starts the bubbling loop', () => {
    fire('mamaput');
    expect(vi.mocked(sfx)).toHaveBeenCalledWith('soup');
    expect(loop.start).toHaveBeenCalledTimes(1);
  });

  it('the bubbling stops when the trail runs out', () => {
    const { race } = fire('mamaput');
    updateSpecials(race, SPECIALS.soup.duration + 1, vi.fn());
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });

  it('the bubbling stops when the player finishes mid-trail', () => {
    const { me, race } = fire('mamaput');
    me.progress.finishTime = 30;
    updateSpecials(race, 0.016, vi.fn());
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });

  it('an opponent firing it makes no loop', () => {
    const me = racerAt(1, 40), race = raceWith([me]);
    me.driver = 'mamaput'; me.charge = 1; me.controls.special = true;
    updateSpecials(race, 0.016, vi.fn());
    expect(loop.start).not.toHaveBeenCalled();
  });
});
