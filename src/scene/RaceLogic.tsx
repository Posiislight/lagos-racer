import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { aiState, getRace, type Racer } from '../game/runtime';
import { isIn } from '../game/modes';
import { updateProgress, standings, currentLap } from '../game/race';
import { clearQueuedPresses, readPlayer } from '../game/input';
import { catchUpGap, driveAI } from '../game/ai';
import { updateItems, ITEM_LABEL } from '../game/items';
import { updateSpecials } from '../game/specials';
import { driverById } from '../config/drivers';
import { updateCritters } from '../game/critters';
import { useGame } from '../game/store';
import { buildResults } from '../game/results';
import { beep, Engine, sfx } from '../game/audio';
import { itemHint } from '../game/hints';

const COUNT = ['3', '2', '1'];
// ?autopilot=1 lets the AI drive the player's car (for play-testing and demos).
const IS_TOUCH = typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
const AUTOPILOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('autopilot') === '1';

/** Drives the race each frame: countdown, inputs, AI, items, laps, HUD and the finish. */
export function RaceLogic() {
  const hudTimer = useRef(0);
  const lastCount = useRef('');
  const wrongWay = useRef(0);
  const heldItem = useRef<string | null>(null);
  const reported = useRef(false);
  const engine = useRef<Engine | null>(null);
  const stuck = useRef({ t: 0, reverse: 0, tries: 0 });
  /** Always on the gas means you can end up nose-first in a wall: back out by yourself. */
  const unstick = (r: Racer, dt: number, racing: boolean) => {
    const s = stuck.current;
    if (!racing) { s.t = s.reverse = s.tries = 0; return; }
    if (s.reverse > 0) {
      s.reverse -= dt;
      r.controls.throttle = 0; r.controls.brake = 1; r.controls.steer = -r.controls.steer;
      return;
    }
    s.t = Math.abs(r.speed) < 1.5 ? s.t + dt : 0;
    if (Math.abs(r.speed) > 8) s.tries = 0;
    if (s.t > 0.9) { s.t = 0; s.reverse = 0.8; s.tries++; }
    if (s.tries >= 3) { r.respawn = true; s.tries = 0; }
  };

  useEffect(() => {
    const race = getRace();
    const player = race?.racers.find(r => r.isPlayer);
    engine.current = new Engine(player?.vehicle.id === 'okada' ? 70 : player?.vehicle.id === 'keke' ? 60 : 42);
    engine.current.start();
    return () => engine.current?.stop();
  }, []);

  useFrame((_, dtRaw) => {
    const race = getRace();
    const store = useGame.getState();
    if (store.paused) clearQueuedPresses();
    if (!race || store.paused) return;
    const dt = Math.min(dtRaw, 0.05);
    const player = race.racers.find(r => r.isPlayer)!;
    const laps = race.config.laps;

    // Countdown: 3, 2, 1, OYA GO!
    if (race.phase === 'countdown') {
      race.countdown -= dt;
      const label = race.countdown > 0 ? COUNT[Math.min(2, Math.floor(3 - race.countdown))] ?? '3' : 'OYA GO!';
      if (label !== lastCount.current) {
        lastCount.current = label; beep(label === 'OYA GO!'); store.setHud({ countdown: label, phase: 'countdown' });
        if (label === 'OYA GO!' && race.spec?.taunts) store.flash(race.spec.taunts.before);
      }
      if (race.countdown <= 0) { race.phase = 'racing'; store.setHud({ phase: 'racing' }); setTimeout(() => useGame.getState().setHud({ countdown: '' }), 900); }
    } else {
      race.clock += dt;
    }
    // Elimination: LASTMA clamps whoever is last. A knocked-out player ends the race.
    for (const e of race.mode.tick(race, dt)) {
      const out = race.racers.find(r => r.id === e.racerId);
      if (!out) continue;
      store.flash(out.isPlayer ? 'LASTMA CLAMPED YOU!' : `${out.name} clamped by LASTMA!`);
      if (out.isPlayer) { sfx('bump'); race.phase = 'finished'; }
    }

    // Controls: the player drives until they finish, then the AI brings them home.
    for (const r of race.racers) {
      // A racer who is out brakes to a stop and presses nothing.
      if (!isIn(r)) { Object.assign(r.controls, { throttle: 0, brake: 1, steer: 0, handbrake: false, useItem: false, special: false, horn: false }); continue; }
      if (r.isPlayer && r.progress.finishTime === null && !AUTOPILOT) {
        readPlayer(r.controls, dt, { tilt: store.settings.steering === 'tilt', invertTilt: store.settings.invertTilt });
        unstick(r, dt, race.phase === 'racing');
      }
      else {
        if (!r.ai) r.ai = aiState(r.progress.lateral, 0.95, 3, 0);
        driveAI(r, race, dt, catchUpGap(race, r, player));
      }
    }

    // Progress and laps.
    for (const r of race.racers) {
      if (!r.body || !isIn(r)) continue;
      const t = r.body.translation();
      const e = updateProgress(race.track, r.progress, t.x, t.z, race.clock, laps);
      if (e && r.isPlayer) {
        if (e.finished) { sfx('finish'); store.flash(standings(race.racers).indexOf(r) === 0 ? 'YOU WIN! OGA!' : 'FINISH!'); race.phase = 'finished'; }
        else { sfx('lap'); store.flash(e.lap === laps - 1 ? 'FINAL LAP!' : `LAP ${e.lap + 1}`); }
      }
    }

    if (race.phase !== 'countdown') updateItems(race, dt, m => store.flash(m));
    updateSpecials(race, dt, m => store.flash(m));

    // Just picked something up: say what it is and, the first few times, how to use it.
    if (player.item && !heldItem.current) {
      store.flash(itemHint(player.item, IS_TOUCH ? 'touch' : 'keys', store.itemHints));
      store.countItemHint();
    }
    heldItem.current = player.item;
    updateCritters(race, dt);

    // Wrong way warning.
    if (player.body && race.phase === 'racing') {
      const lv = player.body.linvel();
      const tp = race.track.points[player.progress.index].tangent;
      const along = lv.x * tp.x + lv.z * tp.z;
      wrongWay.current = along < -3 ? wrongWay.current + dt : 0;
    }

    // Engine note.
    const top = player.vehicle.tuning.topSpeed;
    engine.current?.update(Math.min(1, Math.abs(player.speed) / top), player.controls.throttle);

    // HUD, a few times a second.
    hudTimer.current -= dt;
    if (hudTimer.current <= 0) {
      hudTimer.current = 0.1;
      // Position among those still in; racers who are out no longer count.
      const inRace = race.racers.filter(isIn);
      const order = standings(inRace);
      const best = player.progress.lapTimes.length ? Math.min(...player.progress.lapTimes) : null;
      store.setHud({
        lap: currentLap(player.progress, laps), laps, position: order.indexOf(player) + 1 || inRace.length, racers: inRace.length, elimination: race.mode.hud(race),
        time: race.clock, lapTime: race.clock - player.progress.lapStart, bestLap: best,
        speed: Math.abs(player.speed) * 3.6, item: player.item ? { kind: player.item, label: ITEM_LABEL[player.item] } : null, wrongWay: wrongWay.current > 1.2,
        special: { name: driverById(player.driver).special.name, charge: player.charge, ready: player.charge >= 1 },
      });
    }

    // Results: when the mode says the race is over (for laps, once the player is home and the others
    // are in or a few seconds have passed).
    if (!reported.current && race.mode.over(race)) {
      reported.current = true;
      const byId = new Map(race.racers.map(r => [r.id, r]));
      const order = race.mode.ranking(race).map(id => byId.get(id)!);
      const results = buildResults(order, race.clock, laps, race.track.length);
      const place = order.indexOf(player) + 1;
      store.finishRace(results, place, results[place - 1].best);
      store.setHud({ phase: 'finished' });
    }
  });

  return null;
}
