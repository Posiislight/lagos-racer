import { useEffect, useState } from 'react';
import { debugStats } from '../game/adaptiveQuality';
import { useGame } from '../game/store';

/** ?debug=1: frame rate, quality level and renderer load, refreshed four times a second. */
export function DebugOverlay() {
  const quality = useGame(s => s.settings.quality);
  const auto = useGame(s => s.settings.autoQuality);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(id); }, []);
  const d = debugStats;
  return (
    <pre className="debug-overlay" aria-hidden="true">
      {`FPS      ${d.fps.toFixed(0)}\nLevel    ${quality}${auto ? ' (auto)' : ' (manual)'}\nSlow     ${d.streak}/3${d.waiting ? ' · waiting' : ''}\nCalls    ${d.calls}\nTris     ${d.triangles.toLocaleString()}\nGeoms    ${d.geometries}  Tex ${d.textures}\nDPR      ${d.dpr}`}
    </pre>
  );
}
