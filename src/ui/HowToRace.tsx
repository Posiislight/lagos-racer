import { useState } from 'react';
import { howToSteps } from '../game/onboarding';
import { useIsTouch } from './TouchControls';

/** A short card-by-card guide for first-time racers. onDone fires on the last card or on Skip. */
export function HowToRace({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const steps = howToSteps(useIsTouch() ? 'touch' : 'keys');
  const step = steps[i], last = i === steps.length - 1;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div className="card modal-card howto">
        <small className="muted">How to race · {i + 1}/{steps.length}</small>
        <h2 id="howto-title">{step.title}</h2>
        <p className="story">{step.body}</p>
        <button className="btn primary" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? 'Start racing' : 'Next'}</button>
        {!last && <button className="btn small" onClick={onDone}>Skip</button>}
      </div>
    </div>
  );
}
