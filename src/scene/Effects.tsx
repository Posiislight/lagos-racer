import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, CircleGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry,
  Sprite, SpriteMaterial,
} from 'three';
import { ITEM_COLOR, ITEM_KINDS, itemAtlas } from './art/items';
import { getRace } from '../game/runtime';
import { SPECIALS } from '../config/drivers';
import { canvasTex } from './trackGeometry';

const MAX = 32, TRAIL = 10, MAX_SOUP = 240;
const _o = new Object3D(), _c = new Color();
const PUFF: Record<'juju' | 'fuel' | 'odeshi' | 'steam', Color> = { juju: new Color('#b04dff'), fuel: new Color('#ffb347'), odeshi: new Color('#37b6ff'), steam: new Color('#fff1dc') };

/**
 * Glowing item orbs on the road, flying juju with its trail, crude-oil slicks, pepper-soup patches, and
 * puffs where things land. Everything is instanced: a handful of draw calls however busy the race gets.
 */
export function Effects() {
  const orbs = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const jujus = useRef<InstancedMesh>(null);
  const trails = useRef<InstancedMesh>(null);
  const oils = useRef<InstancedMesh>(null);
  const soups = useRef<InstancedMesh>(null);
  const puffs = useRef<InstancedMesh>(null);
  const history = useRef(new Map<number, { x: number; y: number; z: number }[]>());
  const icons = useRef<Group>(null);
  const sprites = useRef<Sprite[]>([]);

  const assets = useMemo(() => {
    const oilTex = canvasTex(128, 128, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(10,8,6,1)'); g.addColorStop(0.75, 'rgba(18,14,10,.95)'); g.addColorStop(1, 'rgba(18,14,10,0)');
      x.fillStyle = g; x.beginPath();
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, r = w * (0.4 + 0.08 * Math.sin(i * 2.7)); x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
      x.fill();
      x.fillStyle = 'rgba(120,90,200,.25)'; x.beginPath(); x.ellipse(w * 0.4, h * 0.4, 18, 8, 0.6, 0, 7); x.fill();
    });
    // Pepper soup: a red-brown puddle with orange oil floating on top.
    const soupTex = canvasTex(128, 128, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(150,40,14,.95)'); g.addColorStop(0.7, 'rgba(172,58,20,.85)'); g.addColorStop(1, 'rgba(172,58,20,0)');
      x.fillStyle = g; x.beginPath();
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, r = w * (0.42 + 0.06 * Math.sin(i * 3.3)); x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
      x.fill();
      x.fillStyle = 'rgba(255,170,60,.55)';
      for (const [px, py, r] of [[0.38, 0.4, 7], [0.58, 0.55, 5], [0.5, 0.32, 4], [0.42, 0.62, 6]]) { x.beginPath(); x.arc(w * px, h * py, r, 0, 7); x.fill(); }
    });
    const glow = (opacity: number) => new MeshBasicMaterial({ transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    return {
      orbGeo: new SphereGeometry(0.5, 18, 12),
      icons: ITEM_KINDS.map((_, i) => { const t = itemAtlas().clone(); t.repeat.set(0.25, 1); t.offset.set(i * 0.25, 0); t.needsUpdate = true; return new SpriteMaterial({ map: t, toneMapped: false }); }),
      haloGeo: new SphereGeometry(1, 16, 10),
      haloMat: glow(0.28),
      jujuMat: new MeshBasicMaterial({ color: '#d79bff', toneMapped: false }),
      trailMat: glow(0.6),
      oilGeo: new CircleGeometry(2.8, 20).rotateX(-Math.PI / 2),
      oilMat: new MeshStandardMaterial({ map: oilTex, transparent: true, roughness: 0.08, metalness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      soupGeo: new CircleGeometry(SPECIALS.soup.radius, 20).rotateX(-Math.PI / 2),
      soupMat: new MeshStandardMaterial({ map: soupTex, transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      puffMat: glow(0.7),
    };
  }, []);

  useFrame(({ clock }) => {
    const race = getRace();
    if (!race || !orbs.current || !halos.current || !jujus.current || !trails.current || !oils.current || !soups.current || !puffs.current) return;
    const t = clock.elapsedTime;

    // Pickups: the item's icon bobbing over the road, with a glow in its colour.
    if (sprites.current.length !== race.pickups.length && icons.current) {
      icons.current.clear();
      sprites.current = race.pickups.map(p => { const s = new Sprite(assets.icons[ITEM_KINDS.indexOf(p.kind)]); s.scale.set(2.3, 2.3, 1); icons.current!.add(s); return s; });
    }
    let n = 0;
    race.pickups.forEach((p, i) => {
      const s = sprites.current[i];
      if (!s) return;
      s.visible = p.respawn <= 0;
      if (!s.visible) return;
      const bob = Math.sin(t * 2.6 + p.id) * 0.2, pulse = 1 + Math.sin(t * 5 + p.id) * 0.08;
      s.position.set(p.x, p.y + 1.6 + bob, p.z); s.scale.set(2.3 * pulse, 2.3 * pulse, 1);
      _o.position.set(p.x, p.y + 1.6 + bob, p.z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1.45 * pulse); _o.updateMatrix();
      halos.current!.setMatrixAt(n, _o.matrix); halos.current!.setColorAt(n, _c.set(ITEM_COLOR[p.kind])); n++;
    });
    orbs.current.count = 0;
    halos.current.count = n;
    for (const m of [orbs.current, halos.current]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // Juju in flight, with a fading trail of purple sparks.
    let nj = 0, nt = 0, no = 0, ns = 0;
    const live = new Set<number>();
    for (const h of race.hazards) {
      if (h.kind === 'juju' && nj < MAX) {
        live.add(h.id);
        const hist = history.current.get(h.id) ?? [];
        hist.unshift({ x: h.x, y: h.y, z: h.z }); if (hist.length > TRAIL) hist.pop();
        history.current.set(h.id, hist);
        _o.position.set(h.x, h.y, h.z); _o.rotation.set(t * 6, t * 4, 0); _o.scale.setScalar(0.9 + Math.sin(t * 20) * 0.1); _o.updateMatrix();
        jujus.current.setMatrixAt(nj++, _o.matrix);
        hist.forEach((q, i) => {
          if (nt >= MAX * TRAIL) return;
          _o.position.set(q.x, q.y, q.z); _o.scale.setScalar(0.9 * (1 - i / TRAIL) + 0.15); _o.updateMatrix();
          trails.current!.setMatrixAt(nt, _o.matrix);
          trails.current!.setColorAt(nt, _c.copy(PUFF.juju).multiplyScalar(1 - i / TRAIL));
          nt++;
        });
      } else if (h.kind === 'oil' && no < MAX) {
        const grow = Math.min(1, (22 - h.life) * 3 + 0.2);
        _o.position.set(h.x, h.y + 0.05, h.z); _o.rotation.set(0, h.id, 0); _o.scale.setScalar(grow); _o.updateMatrix();
        oils.current.setMatrixAt(no++, _o.matrix);
      } else if (h.kind === 'soup' && ns < MAX_SOUP) {
        // Spreads out when it lands and shrinks away over its last second and a half.
        const grow = Math.min(1, (SPECIALS.soup.patchLife - h.life) * 4 + 0.2, h.life / 1.5);
        _o.position.set(h.x, h.y + 0.05, h.z); _o.rotation.set(0, h.id, 0); _o.scale.setScalar(Math.max(0.01, grow)); _o.updateMatrix();
        soups.current.setMatrixAt(ns++, _o.matrix);
      }
    }
    for (const id of history.current.keys()) if (!live.has(id)) history.current.delete(id);
    jujus.current.count = nj; trails.current.count = nt; oils.current.count = no; soups.current.count = ns;

    // Puffs: expand and fade (additive, so fading is just a darker colour).
    let np = 0;
    for (const p of race.puffs) {
      if (np >= MAX) break;
      const k = p.age / 1.2;
      // Steam off the soup is a small, faint wisp that rises; the others are big bursts.
      const steam = p.color === 'steam';
      _o.position.set(p.x, p.y + 0.5 + k * (steam ? 1.6 : 2.5), p.z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(steam ? 0.4 + k * 1.1 : 1 + k * 4); _o.updateMatrix();
      puffs.current.setMatrixAt(np, _o.matrix);
      puffs.current.setColorAt(np, _c.copy(PUFF[p.color]).multiplyScalar((1 - k) * (steam ? 0.3 : 1)));
      np++;
    }
    puffs.current.count = np;
    for (const m of [jujus.current, trails.current, oils.current, soups.current, puffs.current]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  });

  return (
    <group>
      <group ref={icons} />
      <instancedMesh ref={orbs} args={[assets.orbGeo, assets.jujuMat, 64]} frustumCulled={false} />
      <instancedMesh ref={halos} args={[assets.haloGeo, assets.haloMat, 64]} frustumCulled={false} />
      <instancedMesh ref={jujus} args={[assets.orbGeo, assets.jujuMat, MAX]} frustumCulled={false} />
      <instancedMesh ref={trails} args={[assets.orbGeo, assets.trailMat, MAX * TRAIL]} frustumCulled={false} />
      <instancedMesh ref={oils} args={[assets.oilGeo, assets.oilMat, MAX]} frustumCulled={false} receiveShadow />
      <instancedMesh ref={soups} args={[assets.soupGeo, assets.soupMat, MAX_SOUP]} frustumCulled={false} receiveShadow />
      <instancedMesh ref={puffs} args={[assets.haloGeo, assets.puffMat, MAX]} frustumCulled={false} />
    </group>
  );
}
