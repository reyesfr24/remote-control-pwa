import { useEffect, useRef } from 'react';

// Iconos de trazo (24x24) dibujados a mano para no depender de librerías.
const PATHS = {
  play: 'M7 5v14l11-7z',
  playpause: 'M5 5v14l8-7zM15 5v14M19 5v14',
  back10: 'M11 7 6 12l5 5M18 7l-5 5 5 5',
  fwd10: 'M13 7l5 5-5 5M6 7l5 5-5 5',
  prev: 'M18 6 9 12l9 6zM6 6v12',
  next: 'M6 6l9 6-9 6zM18 6v12',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  volume: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  power: 'M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitorOff: 'M3 5h18v11H3zM8 20h8M12 16v4M3 3l18 18',
  restart: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  close: 'M6 6l12 12M18 6 6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  navBack: 'M15 6l-6 6 6 6',
  navFwd: 'M9 6l6 6-6 6',
  closeTab: 'M3 7h8l2-3h8v16H3zM10 11l4 4M14 11l-4 4',
  timer: 'M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  enter: 'M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4',
  tv: 'M3 6h18v12H3zM8 21h8',
  dim: 'M12 3v2M12 19v2M5 12H3M21 12h-2M7 7 5.6 5.6M18.4 18.4 17 17M7 17l-1.4 1.4M18.4 5.6 17 7M12 16a4 4 0 1 0 0-8z',
  dblclick: 'M8 3v3M3 8h3M5 5l2 2M10 10l10 4-4 2-2 4z',
  mouseLeft: 'M7 4h10a2 2 0 0 1 2 2v12a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V6a2 2 0 0 1 2-2zM12 4v7M5 11h14',
  desktop: 'M3 4h18v12H3zM8 20h8M12 16v4',
  minimize: 'M3 4h18v16H3zM8 15h8',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6',
  reload: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  subtitles: 'M3 5h18v14H3zM7 15h4M13 15h4M7 11h10',
};

export function Icon({ name, size = 22 }) {
  const filled = name === 'play';
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

// Botón táctil: dispara al tocar (sin esperar al "click") y, con `repeat`, repite mientras se mantiene.
export function Btn({ onPress, repeat = false, className = '', icon, label, title, children, disabled, style }) {
  const timers = useRef({});
  const press = useRef(onPress);
  press.current = onPress;

  useEffect(() => () => stop(), []);

  function stop() {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.interval);
  }

  function down(e) {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current?.();
    if (repeat) {
      stop();
      timers.current.delay = setTimeout(() => {
        timers.current.interval = setInterval(() => press.current?.(), 110);
      }, 420);
    }
  }

  return (
    <button
      type="button"
      className={`btn ${className}`}
      onPointerDown={down}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      style={style}
    >
      {icon && <Icon name={icon} />}
      {label && <span className="btn-label">{label}</span>}
      {children}
    </button>
  );
}

export function Card({ title, children, className = '', action }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <Btn icon="close" className="ghost round" title="Cerrar" onPress={onClose} />
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
