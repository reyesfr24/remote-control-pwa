import { useEffect, useRef } from 'react';

// Gestos:
//  1 dedo: mover · toque: clic · doble toque y mantener: arrastrar
//  2 dedos: scroll (con inercia) · toque con 2 dedos: clic derecho
//  3 dedos deslizando en horizontal: retroceder / avanzar el vídeo
const TAP_MS = 220;
const TAP_SLOP = 8;
const DRAG_WINDOW_MS = 260;
const SEEK_STEP_PX = 70;

function centroid(touches) {
  let x = 0;
  let y = 0;
  for (const t of touches) {
    x += t.clientX;
    y += t.clientY;
  }
  return { x: x / touches.length, y: y / touches.length };
}

export default function Touchpad({ send, sensitivity, scrollSensitivity, onSeek }) {
  const ref = useRef(null);
  const opts = useRef({ send, sensitivity, scrollSensitivity, onSeek });
  opts.current = { send, sensitivity, scrollSensitivity, onSeek };

  useEffect(() => {
    const el = ref.current;
    const g = {
      fingers: 0, // máximo de dedos en este gesto
      start: 0,
      last: null,
      lastTime: 0,
      travel: 0,
      dragging: false,
      lastTapEnd: 0,
      lastTapPos: null,
      seekAcc: 0,
      scrollVel: { x: 0, y: 0 },
      inertia: 0,
      moveAcc: { x: 0, y: 0 },
      scrollAcc: { x: 0, y: 0 },
      frame: 0,
    };

    // Envío agrupado por fotograma para no saturar el WebSocket.
    const flush = () => {
      g.frame = 0;
      const { send } = opts.current;
      const mx = g.moveAcc.x;
      const my = g.moveAcc.y;
      if (mx || my) {
        send({ type: 'move', dx: Math.round(mx * 100) / 100, dy: Math.round(my * 100) / 100 });
        g.moveAcc = { x: 0, y: 0 };
      }
      const sx = Math.trunc(g.scrollAcc.x);
      const sy = Math.trunc(g.scrollAcc.y);
      if (sx || sy) {
        send({ type: 'scroll', dx: sx, dy: sy });
        g.scrollAcc.x -= sx;
        g.scrollAcc.y -= sy;
      }
    };
    const schedule = () => {
      if (!g.frame) g.frame = requestAnimationFrame(flush);
    };

    const stopInertia = () => {
      cancelAnimationFrame(g.inertia);
      g.inertia = 0;
    };

    const ripple = (x, y) => {
      const rect = el.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.left = `${x - rect.left}px`;
      dot.style.top = `${y - rect.top}px`;
      el.appendChild(dot);
      setTimeout(() => dot.remove(), 450);
    };

    const onStart = (e) => {
      e.preventDefault();
      stopInertia();
      const touches = e.touches;
      if (g.fingers === 0) {
        g.start = performance.now();
        g.travel = 0;
        g.seekAcc = 0;
        g.scrollVel = { x: 0, y: 0 };
        // Doble toque y mantener = arrastrar (seleccionar, mover ventanas, barras de progreso…)
        const t = touches[0];
        const near = g.lastTapPos && Math.hypot(t.clientX - g.lastTapPos.x, t.clientY - g.lastTapPos.y) < 40;
        if (touches.length === 1 && near && g.start - g.lastTapEnd < DRAG_WINDOW_MS) {
          g.dragging = true;
          g.lastTapEnd = 0;
          opts.current.send({ type: 'down', button: 'left' });
          el.classList.add('dragging');
        }
      }
      g.fingers = Math.max(g.fingers, touches.length);
      g.last = centroid(touches);
      g.lastTime = performance.now();
      el.classList.add('active');
    };

    const onMove = (e) => {
      e.preventDefault();
      const touches = e.touches;
      const now = performance.now();
      const c = centroid(touches);
      const dx = c.x - g.last.x;
      const dy = c.y - g.last.y;
      const dt = Math.max(1, now - g.lastTime);
      g.last = c;
      g.lastTime = now;
      g.travel += Math.hypot(dx, dy);
      const { sensitivity, scrollSensitivity } = opts.current;

      if (touches.length === 1 && g.fingers === 1) {
        // Aceleración: movimientos lentos precisos, rápidos cruzan la pantalla.
        const speed = Math.hypot(dx, dy) / dt;
        const gain = sensitivity * (1 + 1.6 * Math.min(speed, 2.5));
        g.moveAcc.x += dx * gain;
        g.moveAcc.y += dy * gain;
        schedule();
      } else if (touches.length === 2 && g.fingers === 2) {
        // Scroll "natural" como en el iPad: el contenido sigue al dedo.
        const k = 2.2 * scrollSensitivity;
        g.scrollAcc.x += -dx * k;
        g.scrollAcc.y += -dy * k;
        g.scrollVel = { x: (-dx * k) / dt, y: (-dy * k) / dt };
        schedule();
      } else if (touches.length >= 3) {
        g.seekAcc += dx;
        while (Math.abs(g.seekAcc) >= SEEK_STEP_PX) {
          const dir = Math.sign(g.seekAcc);
          g.seekAcc -= dir * SEEK_STEP_PX;
          opts.current.onSeek(dir);
        }
      }
    };

    const onEnd = (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        g.last = centroid(e.touches);
        return;
      }
      const now = performance.now();
      const quick = now - g.start < TAP_MS && g.travel < TAP_SLOP;
      const { send } = opts.current;
      const pos = e.changedTouches[0];

      if (g.dragging) {
        // Si no se ha movido, el clic anterior + este pulsar/soltar = doble clic para Windows.
        g.dragging = false;
        send({ type: 'up', button: 'left' });
        el.classList.remove('dragging');
      } else if (quick && g.fingers === 1) {
        send({ type: 'click', button: 'left' });
        g.lastTapEnd = now;
        g.lastTapPos = { x: pos.clientX, y: pos.clientY };
        ripple(pos.clientX, pos.clientY);
      } else if (quick && g.fingers === 2) {
        send({ type: 'click', button: 'right' });
        ripple(pos.clientX, pos.clientY);
      } else if (g.fingers === 2) {
        // Inercia al soltar el scroll.
        let { x: vx, y: vy } = g.scrollVel;
        let prev = performance.now();
        const step = () => {
          const t = performance.now();
          const dt = t - prev;
          prev = t;
          vx *= Math.pow(0.95, dt / 16);
          vy *= Math.pow(0.95, dt / 16);
          if (Math.hypot(vx, vy) < 0.05) return stopInertia();
          g.scrollAcc.x += vx * dt;
          g.scrollAcc.y += vy * dt;
          schedule();
          g.inertia = requestAnimationFrame(step);
        };
        if (Math.hypot(vx, vy) > 0.3) g.inertia = requestAnimationFrame(step);
      }
      g.fingers = 0;
      el.classList.remove('active');
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });

    // Ratón (para probar desde el ordenador): arrastrar mueve, clic hace clic.
    let mouseDown = null;
    const onMouseDown = (e) => {
      mouseDown = { x: e.clientX, y: e.clientY, moved: 0 };
    };
    const onMouseMove = (e) => {
      if (!mouseDown) return;
      g.moveAcc.x += e.movementX * opts.current.sensitivity;
      g.moveAcc.y += e.movementY * opts.current.sensitivity;
      mouseDown.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      schedule();
    };
    const onMouseUp = (e) => {
      if (mouseDown && mouseDown.moved < 4) opts.current.send({ type: 'click', button: e.button === 2 ? 'right' : 'left' });
      mouseDown = null;
    };
    const onWheel = (e) => {
      e.preventDefault();
      g.scrollAcc.x += e.deltaX;
      g.scrollAcc.y += e.deltaY;
      schedule();
    };
    const noMenu = (e) => e.preventDefault();
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', noMenu);

    return () => {
      stopInertia();
      cancelAnimationFrame(g.frame);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', noMenu);
    };
  }, []);

  return (
    <div className="touchpad" ref={ref}>
      <div className="touchpad-hint">
        <span>1 dedo · mover / tocar = clic</span>
        <span>2 dedos · scroll / tocar = clic derecho</span>
        <span>doble toque y mantener · arrastrar</span>
        <span>3 dedos ↔ · retroceder / avanzar</span>
      </div>
    </div>
  );
}
