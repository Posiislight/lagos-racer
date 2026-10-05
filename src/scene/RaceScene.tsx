import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import {
  BackSide, CanvasTexture, PerspectiveCamera, Color, DirectionalLight, Fog, Mesh, MeshBasicMaterial, PMREMGenerator, SRGBColorSpace, Scene, SphereGeometry,
} from 'three';
import { STREET, TRACKS, trackOrDefault, type Setting } from '../config/tracks';
import { paintOf, vehicleById } from '../config/vehicles';
import { setRace, getRace } from '../game/runtime';
import { makeRace } from '../game/setup';
import { levelsFor } from '../game/upgrades';
import { useGame, type Quality } from '../game/store';
import { resetPlayerInput } from '../game/input';
import { getSession, useNet } from '../net/store';
import { Track } from './Track';
import { Vehicle } from './Vehicle';
import { ChaseCamera } from './ChaseCamera';
import { FxBridge } from './FxBridge';
import { RaceLogic } from './RaceLogic';
import { Effects } from './Effects';
import { makeSkyline } from './art/skyline';
import { makeShore } from './art/shore';
import { Critters } from './Critters';

// View distance matters most on tight streets: what's beyond it is never drawn.
const QUALITY: Record<Quality, { density: number; shadows: number; far: number }> = {
  low: { density: 0.5, shadows: 0, far: 170 },
  medium: { density: 0.8, shadows: 1024, far: 230 },
  high: { density: 1, shadows: 2048, far: 300 },
};

export function RaceScene() {
  const raceId = useGame(s => s.raceId);
  const trackId = useGame(s => s.track);
  const spec = useGame(s => s.spec);
  const vehicle = useGame(s => s.vehicle);
  const driver = useGame(s => s.driver);
  const paint = useGame(s => paintOf(vehicleById(s.vehicle), s.paint[s.vehicle]).id);
  const quality = useGame(s => s.settings.quality);
  const paused = useGame(s => s.paused);
  const online = useGame(s => s.online);
  const q = QUALITY[quality];

  // A fresh race whenever a new one is started; a room race is laid out from the server's grid.
  const { setup, session } = useMemo(() => {
    const session = online ? getSession() : null;
    // The room's track, if this build has it.
    const roomTrack = session ? useNet.getState().pendingGrid?.trackId : undefined;
    const track = roomTrack && TRACKS.some(t => t.id === roomTrack) ? roomTrack : trackId;
    const race = session ? { track, mode: { kind: 'laps' as const, laps: trackOrDefault(track).laps } } : (spec ?? { track, mode: { kind: 'laps' as const, laps: trackOrDefault(track).laps } });
    return { setup: makeRace(race, { vehicle: vehicleById(vehicle).id, paint }, driver, session ? null : spec, session?.setup, levelsFor(useGame.getState().upgrades, vehicle)), session };
  }, [raceId, trackId, spec, vehicle, paint, driver, online]);
  // Publish the race for the frame loops. A layout effect (not render) so StrictMode's
  // mount/unmount/mount cycle ends with the race set.
  useLayoutEffect(() => {
    setRace(setup.race);
    resetPlayerInput();
    if (session) { session.attach(setup.race); session.loaded(); }
    return () => { if (getRace() === setup.race) setRace(null); };
  }, [setup, session]);

  return (
    <>
      <SkyAndLight shadows={q.shadows} far={q.far} setting={setup.race.config.setting ?? STREET} />
      {/* A room race never stops for one phone's menu. */}
      <Physics timeStep={1 / 60} gravity={[0, -18, 0]} paused={paused && !online} interpolate>
        <Track cfg={setup.race.config} track={setup.race.track} density={q.density} animateWater={quality !== 'low'} />
        {setup.race.racers.map((r, i) => <Vehicle key={`${raceId}-${r.id}`} racer={r} spawn={setup.spawns[i]} quick={setup.race.humanize} />)}
      </Physics>
      <Effects />
      <Critters />
      <RaceLogic key={raceId} />
      <ChaseCamera />
      <FxBridge quality={quality} />
    </>
  );
}

function skyTexture(stops: Setting['sky']) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const x = c.getContext('2d')!, w = c.width, h = c.height;
  // The sphere maps the top of the image to the zenith and the middle to the horizon.
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, stops[0]); g.addColorStop(0.32, stops[1]); g.addColorStop(0.48, stops[2]); g.addColorStop(0.5, stops[3]); g.addColorStop(1, stops[4]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cloud = (cx: number, cy: number, s: number) => {
    for (const dx of [-w, 0, w]) {
      for (let i = 0; i < 9; i++) {
        const px = cx + dx + (r() - 0.5) * 120 * s, py = cy - r() * 13 * s, rad = (22 + r() * 30) * s;
        // The dome stretches the image twice as much vertically, so paint the puffs squashed.
        x.save(); x.translate(px, py); x.scale(1, 0.5);
        const grd = x.createRadialGradient(0, -rad * 0.3, rad * 0.2, 0, 0, rad);
        grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(0.7, 'rgba(244,246,250,.85)'); grd.addColorStop(1, 'rgba(225,230,240,0)');
        x.fillStyle = grd; x.beginPath(); x.arc(0, 0, rad, 0, 7); x.fill(); x.restore();
      }
    }
  };
  for (let i = 0; i < 18; i++) cloud(r() * w, h * (0.4 + r() * 0.08), 0.5 + r() * 0.6);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Painted sky dome, image-based reflections from it, hazy fog, and a sun whose shadow follows the player. */
function SkyAndLight({ shadows, far, setting }: { shadows: number; far: number; setting: Setting }) {
  const { gl, scene, camera } = useThree();
  const sun = useRef<DirectionalLight>(null);

  // Painted sky: blue overhead fading to a warm hazy horizon, with fat cumulus clouds.
  const sky = useMemo(() => {
    const m = new Mesh(new SphereGeometry(1, 32, 16), new MeshBasicMaterial({ map: skyTexture(setting.sky), side: BackSide, fog: false, depthWrite: false }));
    m.frustumCulled = false; m.renderOrder = -2;
    return m;
  }, [setting]);
  // The painted skyline rides along with the camera, like a backdrop at the horizon.
  const skyline = useMemo(() => { const s = (setting.backdrop === 'shore' ? makeShore : makeSkyline)(0, 0, far * 0.8, far * 0.24); s.frustumCulled = false; return s; }, [far, setting]);
  useEffect(() => {
    (camera as PerspectiveCamera).far = far; (camera as PerspectiveCamera).updateProjectionMatrix();
  }, [camera, far]);

  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = new Scene();
    const envSky = sky.clone(); envSky.scale.setScalar(500); env.add(envSky);
    const panel = new Mesh(new SphereGeometry(120, 12, 8), new MeshBasicMaterial({ color: new Color(4, 3.8, 3.4), side: BackSide }));
    panel.scale.set(0.3, 0.15, 0.3); panel.position.set(300, 500, 200); env.add(panel);
    const rt = pm.fromScene(env, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.7;
    scene.fog = new Fog(setting.fog, far * 0.3, far * 0.97);
    return () => { rt.dispose(); pm.dispose(); scene.environment = null; scene.fog = null; };
  }, [gl, scene, sky, far, setting]);

  useFrame(() => {
    sky.position.copy(camera.position); sky.scale.setScalar(far * 0.9);
    skyline.position.set(camera.position.x, skyline.position.y, camera.position.z);
    const race = getRace();
    const p = race?.racers.find(r => r.isPlayer)?.visual;
    if (!sun.current || !p) return;
    const x = p.matrixWorld.elements[12], z = p.matrixWorld.elements[14];
    sun.current.position.set(x + 30, 60, z + 20);
    sun.current.target.position.set(x, 0, z);
    sun.current.target.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={sky} />
      <primitive object={skyline} />
      <hemisphereLight args={[setting.light.sky, setting.light.ground, 1.1]} />
      <directionalLight
        ref={sun}
        intensity={3.2}
        color={setting.light.sun}
        castShadow={shadows > 0}
        shadow-mapSize={[shadows || 512, shadows || 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
    </>
  );
}
