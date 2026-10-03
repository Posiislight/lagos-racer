import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import {
  BackSide, CanvasTexture, PerspectiveCamera, Color, DirectionalLight, Fog, Mesh, MeshBasicMaterial, PMREMGenerator, SRGBColorSpace, Scene, SphereGeometry,
} from 'three';
import { trackById } from '../config/tracks';
import { VEHICLES, vehicleById, type VehicleId } from '../config/vehicles';
import { buildTrack, sampleAt } from '../game/track';
import { createProgress } from '../game/race';
import { makeRacer, setRace, getRace, type RaceRuntime } from '../game/runtime';
import { makePickups } from '../game/items';
import { makeCritters } from '../game/critters';
import { AI_NAMES } from '../game/ai';
import { useGame, type Quality } from '../game/store';
import { resetPlayerInput } from '../game/input';
import { Track } from './Track';
import { Vehicle } from './Vehicle';
import { ChaseCamera } from './ChaseCamera';
import { RaceLogic } from './RaceLogic';
import { Effects } from './Effects';
import { makeSkyline } from './art/skyline';
import { Critters } from './Critters';

// View distance matters most on tight streets: what's beyond it is never drawn.
const QUALITY: Record<Quality, { density: number; shadows: number; far: number }> = {
  low: { density: 0.5, shadows: 0, far: 170 },
  medium: { density: 0.8, shadows: 1024, far: 230 },
  high: { density: 1, shadows: 2048, far: 300 },
};

/** Everyone else on the grid: one of each vehicle except the one you picked, in a random order. */
function rivals(player: VehicleId): VehicleId[] {
  return VEHICLES.map(v => v.id).filter(v => v !== player).sort(() => Math.random() - 0.5);
}

export function makeRace(trackId: string, playerVehicle: VehicleId): { race: RaceRuntime; spawns: { x: number; y: number; z: number; yaw: number }[] } {
  const config = trackById(trackId);
  const track = buildTrack(config.control, 2, config.hills, config.hillsAxis);
  const lineup = [...rivals(playerVehicle), playerVehicle];
  const names = [...AI_NAMES].sort(() => Math.random() - 0.5);
  const spawns: { x: number; y: number; z: number; yaw: number }[] = [];
  const racers = lineup.map((vid, k) => {
    // Two lanes, three rows, staggered; the player is last, at the back of the right lane.
    const row = Math.floor(k / 2), right = k % 2 === 1;
    const s = -8 - row * 12 - (right ? 5 : 0);
    const lane = (right ? 1 : -1) * config.halfWidth * 0.42;
    const at = sampleAt(track, s);
    const x = at.pos.x + at.right.x * lane, z = at.pos.z + at.right.z * lane;
    spawns.push({ x, y: at.pos.y, z, yaw: Math.atan2(-at.tangent.z, at.tangent.x) });
    const isPlayer = k === lineup.length - 1;
    const r = makeRacer(k, isPlayer ? 'You' : names[k], vehicleById(vid), isPlayer, createProgress(track, x, z));
    if (!isPlayer) r.ai = { lane, laneTarget: lane, skill: 0.9 + k * 0.035 + Math.random() * 0.03, itemDelay: 2, stuck: 0, reverseTime: 0 };
    return r;
  });
  let id = 1;
  const race: RaceRuntime = {
    config, track, racers, hazards: [], pickups: makePickups({ config, track }, () => id++), clock: 0, countdown: 3,
    phase: 'countdown', playerFinishedAt: null, nextId: 1000, puffs: [], critters: makeCritters({ config, track }),
  };
  return { race, spawns };
}

export function RaceScene() {
  const raceId = useGame(s => s.raceId);
  const trackId = useGame(s => s.track);
  const vehicle = useGame(s => s.vehicle);
  const quality = useGame(s => s.settings.quality);
  const paused = useGame(s => s.paused);
  const q = QUALITY[quality];

  // A fresh race whenever a new one is started.
  const setup = useMemo(() => makeRace(trackId, VEHICLES.some(v => v.id === vehicle) ? vehicle : 'okada'), [raceId, trackId, vehicle]);
  // Publish the race for the frame loops. A layout effect (not render) so StrictMode's
  // mount/unmount/mount cycle ends with the race set.
  useLayoutEffect(() => {
    setRace(setup.race);
    resetPlayerInput();
    return () => { if (getRace() === setup.race) setRace(null); };
  }, [setup]);

  return (
    <>
      <SkyAndLight shadows={q.shadows} far={q.far} />
      <Physics timeStep={1 / 60} gravity={[0, -18, 0]} paused={paused} interpolate>
        <Track cfg={setup.race.config} track={setup.race.track} density={q.density} />
        {setup.race.racers.map((r, i) => <Vehicle key={`${raceId}-${r.id}`} racer={r} spawn={setup.spawns[i]} />)}
      </Physics>
      <Effects />
      <Critters />
      <RaceLogic key={raceId} />
      <ChaseCamera />
    </>
  );
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const x = c.getContext('2d')!, w = c.width, h = c.height;
  // The sphere maps the top of the image to the zenith and the middle to the horizon.
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2f7fd0'); g.addColorStop(0.32, '#6fb0e6'); g.addColorStop(0.48, '#e9e0cc'); g.addColorStop(0.5, '#f1e4c9'); g.addColorStop(1, '#e8d6b6');
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
function SkyAndLight({ shadows, far }: { shadows: number; far: number }) {
  const { gl, scene, camera } = useThree();
  const sun = useRef<DirectionalLight>(null);

  // Painted sky: blue overhead fading to a warm hazy horizon, with fat cumulus clouds.
  const sky = useMemo(() => {
    const m = new Mesh(new SphereGeometry(1, 32, 16), new MeshBasicMaterial({ map: skyTexture(), side: BackSide, fog: false, depthWrite: false }));
    m.frustumCulled = false; m.renderOrder = -2;
    return m;
  }, []);
  // The painted skyline rides along with the camera, like a backdrop at the horizon.
  const skyline = useMemo(() => { const s = makeSkyline(0, 0, far * 0.8, far * 0.24); s.frustumCulled = false; return s; }, [far]);
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
    scene.fog = new Fog('#efdcbc', far * 0.3, far * 0.97);
    return () => { rt.dispose(); pm.dispose(); scene.environment = null; scene.fog = null; };
  }, [gl, scene, sky, far]);

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
      <hemisphereLight args={['#dbeeff', '#9a6b48', 1.1]} />
      <directionalLight
        ref={sun}
        intensity={3.2}
        color="#fff1dc"
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
