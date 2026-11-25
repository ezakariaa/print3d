import { useEffect, useRef } from 'react';

/** Animation FDM en vue de face : vase imprimé couche par couche. */
export function PrintAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const LAYER_COUNT = 28;
    const CYCLE_MS = 14000;
    const HOLD_MS = 1800;

    const vaseRadius = (t: number) => {
      const y = t;
      return (
        0.42 +
        0.22 * Math.sin(y * Math.PI * 1.15) +
        0.08 * Math.sin(y * Math.PI * 3) -
        0.12 * y
      );
    };

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.52;
      const bedY = h * 0.82;
      const maxHeight = h * 0.48;
      const baseScale = Math.min(w, h) * 0.22;

      const elapsed = reduceMotion ? CYCLE_MS * 0.85 : (now - start) % (CYCLE_MS + HOLD_MS);
      const printing = Math.min(1, elapsed / CYCLE_MS);
      const layersDone = Math.floor(printing * LAYER_COUNT);
      const layerProgress = printing * LAYER_COUNT - layersDone;
      const complete = elapsed >= CYCLE_MS;

      const glow = ctx.createRadialGradient(
        cx,
        bedY - maxHeight * 0.45,
        10,
        cx,
        bedY - maxHeight * 0.4,
        w * 0.45,
      );
      glow.addColorStop(0, 'rgba(18, 184, 160, 0.18)');
      glow.addColorStop(1, 'rgba(18, 184, 160, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Plateforme vue de face
      ctx.save();
      ctx.fillStyle = 'rgba(232, 242, 239, 0.08)';
      ctx.strokeStyle = 'rgba(18, 184, 160, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, bedY, baseScale * 1.55, baseScale * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, bedY + 8, baseScale * 1.45, baseScale * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(7, 16, 24, 0.45)';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(18, 184, 160, 0.12)';
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        const ox = i * (baseScale * 0.28);
        ctx.beginPath();
        ctx.moveTo(cx + ox - baseScale * 0.9, bedY - 2);
        ctx.lineTo(cx + ox + baseScale * 0.15, bedY + 10);
        ctx.stroke();
      }
      ctx.restore();

      const layerH = maxHeight / LAYER_COUNT;

      for (let i = 0; i < layersDone; i++) {
        const t0 = i / LAYER_COUNT;
        const t1 = (i + 1) / LAYER_COUNT;
        const yTop = bedY - (i + 1) * layerH;
        const rBottom = vaseRadius(t0) * baseScale;
        const rTop = vaseRadius(t1) * baseScale;
        const shade = 0.35 + (i / LAYER_COUNT) * 0.45;

        ctx.beginPath();
        ctx.moveTo(cx - rBottom * 0.85, bedY - i * layerH);
        ctx.lineTo(cx - rTop * 0.85, yTop);
        ctx.lineTo(cx, yTop + layerH * 0.15);
        ctx.lineTo(cx, bedY - i * layerH + layerH * 0.15);
        ctx.closePath();
        ctx.fillStyle = `rgba(8, 90, 82, ${shade})`;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx + rBottom * 0.85, bedY - i * layerH);
        ctx.lineTo(cx + rTop * 0.85, yTop);
        ctx.lineTo(cx, yTop + layerH * 0.15);
        ctx.lineTo(cx, bedY - i * layerH + layerH * 0.15);
        ctx.closePath();
        ctx.fillStyle = `rgba(18, 184, 160, ${shade})`;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(cx, yTop, rTop * 0.85, rTop * 0.18, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(232, 242, 239, ${0.08 + (i / LAYER_COUNT) * 0.12})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (!complete && layersDone < LAYER_COUNT) {
        const i = layersDone;
        const t0 = i / LAYER_COUNT;
        const t1 = (i + layerProgress) / LAYER_COUNT;
        const yBase = bedY - i * layerH;
        const yTop = bedY - (i + layerProgress) * layerH;
        const rBottom = vaseRadius(t0) * baseScale;
        const rTop = vaseRadius(t1) * baseScale;
        const angle = layerProgress * Math.PI * 2;
        const nozzleX = cx + Math.cos(angle) * rTop * 0.75;
        const nozzleY = yTop;

        ctx.beginPath();
        ctx.moveTo(cx - rBottom * 0.85, yBase);
        ctx.lineTo(cx - rTop * 0.85, yTop);
        ctx.lineTo(cx + rTop * 0.85, yTop);
        ctx.lineTo(cx + rBottom * 0.85, yBase);
        ctx.closePath();
        ctx.fillStyle = 'rgba(45, 212, 191, 0.55)';
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(cx, yTop, rTop * 0.85, rTop * 0.18, 0, -Math.PI * 0.15, angle - Math.PI * 0.15);
        ctx.strokeStyle = 'rgba(232, 242, 239, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        const gantryY = nozzleY - 28;
        ctx.strokeStyle = 'rgba(197, 212, 206, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - baseScale * 1.7, gantryY);
        ctx.lineTo(cx + baseScale * 1.7, gantryY);
        ctx.stroke();

        ctx.fillStyle = '#e8f2ef';
        ctx.beginPath();
        ctx.moveTo(nozzleX - 7, gantryY);
        ctx.lineTo(nozzleX + 7, gantryY);
        ctx.lineTo(nozzleX + 3, gantryY + 16);
        ctx.lineTo(nozzleX - 3, gantryY + 16);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#12b8a0';
        ctx.beginPath();
        ctx.moveTo(nozzleX - 3, gantryY + 16);
        ctx.lineTo(nozzleX + 3, gantryY + 16);
        ctx.lineTo(nozzleX, gantryY + 24);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(45, 212, 191, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nozzleX, gantryY + 24);
        ctx.lineTo(nozzleX, nozzleY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(nozzleX, nozzleY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(now / 400);
        ctx.strokeStyle = `rgba(18, 184, 160, ${0.25 + pulse * 0.25})`;
        ctx.lineWidth = 1.5;
        const topR = vaseRadius(1) * baseScale;
        ctx.beginPath();
        ctx.ellipse(cx, bedY - maxHeight, topR * 0.85, topR * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(232, 242, 239, 0.45)';
      ctx.font = '500 12px Manrope, sans-serif';
      ctx.textAlign = 'center';
      const label = complete
        ? 'Impression terminée'
        : `Couche ${Math.min(layersDone + 1, LAYER_COUNT)} / ${LAYER_COUNT}`;
      ctx.fillText(label, cx, bedY + 36);

      if (!reduceMotion) {
        raf = requestAnimationFrame(draw);
      }
    };

    if (reduceMotion) {
      draw(start + CYCLE_MS * 0.85);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="print-stage" aria-hidden="true">
      <canvas ref={canvasRef} className="print-canvas" />
      <div className="print-caption">Simulation FDM · vue de face · couche par couche</div>
    </div>
  );
}
