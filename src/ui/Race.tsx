import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { useGame } from '../game/store';
import { getRace } from '../game/runtime';
import { RaceScene } from '../scene/RaceScene';
import { DEBUG_OVERLAY, PROFILES } from '../game/adaptiveQuality';
import { DebugOverlay } from './DebugOverlay';
import { Hud } from './Hud';
import { ScreenFx } from './ScreenFx';
import { TouchControls, useIsTouch } from './TouchControls';
import { Results } from './Results';
import { PauseMenu } from './PauseMenu';
import { ConnectionCut } from './Online';
import { useNet } from '../net/store';
import { Loading } from '../App';
import { VoiceControls } from './VoiceControls';

export default function Race() {
  const quality = useGame(s => s.settings.quality);
  const paused = useGame(s => s.paused);
  const results = useGame(s => s.results);
  const setPaused = useGame(s => s.setPaused);
  const online = useGame(s => s.online);
  const reconnecting = useNet(s => s.status === 'reconnecting');
  // The room is gone: no point racing on against nobody.
  const cut = useNet(s => s.cut) && online;
  const touch = useIsTouch();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { const s = useGame.getState(); if (!s.results) s.setPaused(!s.paused); }
    };
    // A room race can't wait for one phone, so only a solo race pauses when the tab is hidden.
    const onHide = () => { const s = useGame.getState(); if (document.hidden && !s.results && !s.online) s.setPaused(true); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide); };
  }, []);

  return (
    <div className="race">
      <Canvas
        className="race-canvas"
        // Size from the element's own layout size: its on-screen box has width and height swapped when the app is turned.
        resize={{ offsetSize: true }}
        shadows={quality !== 'low'}
        dpr={PROFILES[quality].dpr}
        // Antialiasing is fixed when the canvas is created: a level change mid-race can't toggle it, the next race picks it up.
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        camera={{ fov: 62, near: 0.2, far: 2000, position: [0, 5, 10] }}
        onCreated={state => {
          setReady(true);
          // Dev-only handle for play-testing scripts and the console.
          if (import.meta.env.DEV) (window as unknown as { __lr: unknown }).__lr = { state, getRace, useGame };
        }}
      >
        <Suspense fallback={null}>
          <RaceScene />
        </Suspense>
      </Canvas>
      {!ready && <Loading />}
      <ScreenFx />
      {DEBUG_OVERLAY && <DebugOverlay />}
      <Hud onPause={() => setPaused(true)} />
      {online && !results && !cut && <div className="voice-float"><VoiceControls compact /></div>}
      {online && reconnecting && <div className="net-badge" role="status">Reconnecting…</div>}
      {touch && !results && !cut && <TouchControls />}
      {paused && !results && !cut && <PauseMenu />}
      {results && !cut && <Results />}
      {cut && <ConnectionCut />}
    </div>
  );
}
