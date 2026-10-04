import { useState } from 'react';
import { useGame } from '../game/store';
import { campaignStatus } from '../game/campaign';
import { trackOrDefault } from '../config/tracks';
import type { ModeSpec, RaceSpec } from '../config/campaign';
import { launchRace } from './Menu';

const MODE_NAME: Record<ModeSpec['kind'], string> = { laps: 'Laps', elimination: 'Elimination', duel: 'Duel' };
const STATE_NAME = { locked: 'Locked', open: 'Open', cleared: 'Cleared' } as const;

/** Chapter 1: four races in order, each opening when the one before it is cleared. */
export function Campaign() {
  const { setScreen, coins, campaign } = useGame();
  const [picked, setPicked] = useState<RaceSpec | null>(null);
  return (
    <div className="campaign">
      <header className="garage-head">
        <button className="btn" onClick={() => setScreen('menu')}>← Back</button>
        <h1>Chapter 1</h1>
        <div className="coins" aria-label={`${coins} coins`}>₦ {coins}</div>
      </header>
      <ol className="stops-list">
        {campaignStatus(campaign.cleared).map(({ spec, state }, i) => (
          <li key={spec.id}>
            <button
              className={`stop ${state}`} aria-disabled={state === 'locked'}
              onClick={() => { if (state !== 'locked') setPicked(spec); }}
            >
              <span className="num">{i + 1}</span>
              <span className="what">
                <b>{spec.title}</b>
                <small>{trackOrDefault(spec.track).name} · {MODE_NAME[spec.mode.kind]}</small>
              </span>
              <span className="state">{state === 'locked' ? '🔒 ' : state === 'cleared' ? '✓ ' : ''}{STATE_NAME[state]}</span>
            </button>
          </li>
        ))}
      </ol>
      {picked && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="intro-title">
          <div className="card modal-card">
            <p className="eyebrow">{trackOrDefault(picked.track).name} · {MODE_NAME[picked.mode.kind]}</p>
            <h2 id="intro-title">{picked.title}</h2>
            <p className="story">{picked.story}</p>
            <p className="rule"><b>{picked.rule}</b></p>
            {picked.taunts && <p className="taunt">“{picked.taunts.before}”</p>}
            <div className="row">
              <button className="btn primary" onClick={() => launchRace(picked)}>Race</button>
              <button className="btn" onClick={() => setPicked(null)}>Not yet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
