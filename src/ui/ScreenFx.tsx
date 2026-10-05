import { useEffect, useRef } from 'react';
import { fx } from '../game/fx';
import { ITEM_ICON } from '../scene/art/items';

const LINES = { low: 16, medium: 28, high: 40 } as const;
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type Line = { angle: number; r: number; len: number; width: number };
const newLine = (r = 0.6 + Math.random() * 0.75): Line => ({ angle: Math.random() * Math.PI * 2, r, len: 0.25 + Math.random() * 0.3, width: 2 + Math.random() * 3 });

/** An oily blob for the screen edges (inline SVG, so nothing to download). */
const blob = (seed: number) => {
  // A splat: one big round drop, smaller drops around it, a couple of drips, and an oily sheen.
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const drops = [`<circle cx="50" cy="50" r="30"/>`];
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = 26 + r() * 14;
    drops.push(`<circle cx="${(50 + Math.cos(a) * d).toFixed(1)}" cy="${(50 + Math.sin(a) * d).toFixed(1)}" r="${(5 + r() * 9).toFixed(1)}"/>`);
  }
  for (let i = 0; i < 2; i++) {
    const x = 38 + r() * 24;
    drops.push(`<rect x="${x.toFixed(1)}" y="55" width="${(4 + r() * 3).toFixed(1)}" height="${(28 + r() * 14).toFixed(1)}" rx="3"/>`);
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#120e0a" opacity=".78">${drops.join('')}</g><ellipse cx="42" cy="40" rx="13" ry="6" fill="#8a6ad8" opacity=".3"/><ellipse cx="56" cy="58" rx="6" ry="3" fill="#ffffff" opacity=".18"/></svg>`)}`;
};
const BLOBS = [0, 1, 2, 3].map(blob);

/**
 * Full-screen power-up effects over the race, drawn without React re-renders and switched off when
 * nothing is happening: speed lines rushing in from the edges on a fuel boost or Push Squad, a purple flash when
 * juju hits you, oily splats while you slide on crude oil, a hot, blurry vignette while you cough from pepper soup, and picked-up items flying into the
 * item button.
 */
export function ScreenFx() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const juju = useRef<HTMLDivElement>(null);
  const oil = useRef<HTMLDivElement>(null);
  const cough = useRef<HTMLDivElement>(null);
  const flyers = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0, last = performance.now(), lines: Line[] = [];
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = canvas.current;
      if (c) {
        if (fx.boost > 0.01) {
          // Half resolution is plenty for streaks and keeps the fill cost down on phones.
          const w = Math.round(c.clientWidth / 2), h = Math.round(c.clientHeight / 2);
          if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
          const n = LINES[fx.quality];
          while (lines.length < n) lines.push(newLine());
          lines.length = n;
          // Radius 1 is the screen's edge in every direction (an ellipse matching its shape), so on
          // a wide phone screen the streaks come in from the top and bottom as well as the sides.
          const x = c.getContext('2d')!, ax = w / 2, ay = h / 2;
          x.clearRect(0, 0, w, h);
          x.fillStyle = '#ffffff';
          for (const l of lines) {
            l.r -= 1.6 * dt;
            if (l.r < 0.6) Object.assign(l, newLine(1.05 + Math.random() * 0.3));
            x.globalAlpha = fx.boost * smoothstep(0.6, 0.8, l.r) * 0.9;
            // A thin wedge: a point towards the centre, widening out towards the screen edge.
            const cs = Math.cos(l.angle), sn = Math.sin(l.angle), r1 = l.r + l.len, hw = l.width / 2;
            const px = ax + cs * ax * l.r, py = ay + sn * ay * l.r, qx = ax + cs * ax * r1, qy = ay + sn * ay * r1;
            const dx = qx - px, dy = qy - py, d = Math.hypot(dx, dy) || 1, nx = -dy / d * hw, ny = dx / d * hw;
            x.beginPath();
            x.moveTo(px, py);
            x.lineTo(qx + nx, qy + ny);
            x.lineTo(qx - nx, qy - ny);
            x.closePath();
            x.fill();
          }
          c.style.display = 'block';
        } else if (c.style.display !== 'none') {
          c.style.display = 'none';
          lines = [];
        }
      }
      if (juju.current) juju.current.style.opacity = String(Math.max(0, 1 - fx.juju / 0.6));
      if (oil.current) oil.current.style.opacity = String(fx.slip);
      const co = cough.current;
      if (co) {
        // Hidden outright when idle: a backdrop blur costs even at zero opacity.
        co.style.display = fx.cough > 0.01 ? 'block' : 'none';
        co.style.opacity = String(fx.cough);
        co.classList.toggle('blur', fx.quality !== 'low');
      }

      // Picked-up items fly from where you grabbed them into the item button.
      const target = document.querySelector('.hud-item')?.getBoundingClientRect();
      while (fx.pickups.length && flyers.current) {
        const p = fx.pickups.shift()!;
        if (!target) continue;
        const img = document.createElement('img');
        img.src = ITEM_ICON[p.kind]; img.alt = ''; img.className = 'fx-fly';
        flyers.current.appendChild(img);
        const tx = target.left + target.width / 2 - p.x, ty = target.top + target.height / 2 - p.y;
        img.style.left = `${p.x}px`; img.style.top = `${p.y}px`;
        img.animate(
          [{ transform: 'translate(-50%, -50%) scale(1.4)', opacity: 1 }, { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.6)`, opacity: 0.9 }],
          { duration: 450, easing: 'cubic-bezier(.5,0,.8,.4)' },
        ).onfinish = () => img.remove();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="screen-fx" aria-hidden="true">
      <canvas ref={canvas} className="fx-lines" style={{ display: 'none' }} />
      <div ref={juju} className="fx-juju" style={{ opacity: 0 }} />
      <div ref={oil} className="fx-oil" style={{ opacity: 0 }}>
        {BLOBS.map((src, i) => <img key={i} src={src} alt="" className={`blob b${i}`} />)}
      </div>
      <div ref={cough} className="fx-cough" style={{ display: 'none' }} />
      <div ref={flyers} />
    </div>
  );
}
