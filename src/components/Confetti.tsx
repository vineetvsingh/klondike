import { useEffect, useRef } from 'react';
import { REDUCED_MOTION } from './cardMotion';

const COLORS = ['#f2c15d', '#fff0a2', '#ff6b6b', '#ffffff', '#8ff0c0', '#7cc3ff', '#f7a8ff'];

/** Two side cannons of confetti; fires each time `burst` changes to a non-zero value. */
export function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!burst || !cv || REDUCED_MOTION) return;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.style.display = 'block';

    const parts = Array.from({ length: 260 }, (_, i) => {
      const left = i % 2 === 0;
      return {
        x: left ? -10 : w + 10,
        y: h * (0.5 + Math.random() * 0.35),
        vx: (left ? 1 : -1) * (3 + Math.random() * 10),
        vy: -(8 + Math.random() * 11),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.3,
      };
    });

    let raf = 0;
    const start = performance.now();
    let last = start;
    const frame = (now: number) => {
      const t = now - start;
      const k = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = t > 3800 ? Math.max(0, 1 - (t - 3800) / 1200) : 1;
      for (const p of parts) {
        p.vy += 0.26 * k;
        p.vx *= Math.pow(0.988, k);
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.vr * k;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.rot * 1.7)) + 1);
        }
        ctx.restore();
      }
      if (t < 5000) raf = requestAnimationFrame(frame);
      else cv.style.display = 'none';
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.style.display = 'none';
    };
  }, [burst]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
