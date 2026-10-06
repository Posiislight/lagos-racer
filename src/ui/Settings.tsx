import { radioName } from '../game/radio';
import { useGame } from '../game/store';
import { enableTilt } from '../game/input';
import { useIsTouch } from './TouchControls';

export function Settings({ onClose }: { onClose: () => void }) {
  const { settings, setSetting, setQualityMode } = useGame();
  const isTouch = useIsTouch();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="card modal-card">
        <h2 id="settings-title">Settings</h2>
        <fieldset className="seg">
          <legend>Graphics quality</legend>
          {(['auto', 'low', 'medium', 'high'] as const).map(m => {
            const on = (settings.autoQuality ? 'auto' : settings.quality) === m;
            return (
              <label key={m} className={on ? 'on' : ''}>
                <input type="radio" name="quality" checked={on} onChange={() => setQualityMode(m)} />
                {m[0].toUpperCase() + m.slice(1)}
              </label>
            );
          })}
        </fieldset>
        <p className="muted small">
          {settings.autoQuality
            ? `Auto starts on high and lowers itself if your phone can't keep up. Now: ${settings.quality}.`
            : 'Low is best for budget phones: no shadows, less scenery, lower resolution.'}
        </p>
        {isTouch && (
          <>
            <fieldset className="seg">
              <legend>Steering</legend>
              <label className={settings.steering === 'buttons' ? 'on' : ''}>
                <input type="radio" name="steering" checked={settings.steering === 'buttons'} onChange={() => setSetting('steering', 'buttons')} />
                Buttons
              </label>
              <label className={settings.steering === 'tilt' ? 'on' : ''}>
                <input type="radio" name="steering" checked={settings.steering === 'tilt'}
                  onChange={async () => { if (await enableTilt()) setSetting('steering', 'tilt'); }} />
                Tilt phone
              </label>
            </fieldset>
            {settings.steering === 'tilt' && (
              <label className="toggle">
                <input type="checkbox" checked={settings.invertTilt} onChange={e => setSetting('invertTilt', e.target.checked)} />
                <span>Reverse tilt direction</span>
              </label>
            )}
          </>
        )}
        <p className="muted small">You're always on the gas: just steer. Hitting walls or other vehicles slows you down.</p>
        <label className="toggle">
          <input type="checkbox" checked={settings.sound} onChange={e => setSetting('sound', e.target.checked)} />
          <span>Sound</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.radio} onChange={e => setSetting('radio', e.target.checked)} />
          <span>Radio in races ({radioName()}, uses mobile data)</span>
        </label>
        <button className="btn primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
