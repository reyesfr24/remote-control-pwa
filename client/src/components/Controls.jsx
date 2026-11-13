import { useEffect, useRef, useState } from 'react';
import { Btn, Card } from './ui.jsx';

// Lo más usado: botones grandes que llenan la columna derecha, al alcance del pulgar.
export function MediaCard({ send, seekSeconds }) {
  return (
    <Card title="Reproducción" className="media">
      <div className="media-main">
        <Btn icon="back10" className="hero" title={`Retroceder ${seekSeconds} s`} repeat onPress={() => send({ type: 'seek', dir: -1 })}>
          <span className="btn-badge">{seekSeconds} s</span>
        </Btn>
        <Btn icon="playpause" className="hero accent" title="Reproducir / pausa" onPress={() => send({ type: 'media', action: 'playpause' })} />
        <Btn icon="fwd10" className="hero" title={`Avanzar ${seekSeconds} s`} repeat onPress={() => send({ type: 'seek', dir: 1 })}>
          <span className="btn-badge">{seekSeconds} s</span>
        </Btn>
      </div>
      <div className="media-row">
        <Btn icon="fullscreen" label="Vídeo" title="Pantalla completa del reproductor (tecla F)" onPress={() => send({ type: 'fullscreenPlayer', method: 'key' })} />
        <Btn label="F11" title="Pantalla completa del navegador" onPress={() => send({ type: 'key', name: 'f11' })} />
        <Btn label="Espacio" title="Pausa en la mayoría de reproductores" onPress={() => send({ type: 'key', name: 'space' })} />
      </div>
      <div className="media-row small">
        <Btn icon="prev" title="Anterior" onPress={() => send({ type: 'media', action: 'prev' })} />
        <Btn icon="next" title="Siguiente" onPress={() => send({ type: 'media', action: 'next' })} />
        <Btn icon="subtitles" title="Subtítulos (tecla C)" onPress={() => send({ type: 'key', name: 'c' })} />
        <Btn icon="mute" title="Silenciar el vídeo (tecla M)" onPress={() => send({ type: 'key', name: 'm' })} />
        <Btn icon="dblclick" title="Doble clic en el centro de la ventana (pantalla completa en muchos reproductores)" onPress={() => send({ type: 'fullscreenPlayer', method: 'dblclick' })} />
      </div>
    </Card>
  );
}

// `compact`: una sola fila (silencio, −, slider con el %, +) para el móvil en vertical.
export function VolumeCard({ send, level, muted, compact = false }) {
  const [local, setLocal] = useState(level ?? 0);
  const dragging = useRef(false);
  const last = useRef(0);

  useEffect(() => {
    if (!dragging.current && level != null) setLocal(level);
  }, [level]);

  const onChange = (e) => {
    const v = Number(e.target.value);
    setLocal(v);
    const now = performance.now();
    if (now - last.current > 60) {
      last.current = now;
      send({ type: 'volume', op: 'set', level: v });
    }
  };
  const onEnd = () => {
    dragging.current = false;
    send({ type: 'volume', op: 'set', level: local });
  };

  const slider = (
    <input
      className="slider"
      type="range"
      min="0"
      max="100"
      value={local}
      style={{ '--fill': `${local}%` }}
      onPointerDown={() => (dragging.current = true)}
      onChange={onChange}
      onPointerUp={onEnd}
      onTouchEnd={onEnd}
      aria-label="Volumen"
    />
  );
  const number = <span className={`vol-num ${muted ? 'muted' : ''}`}>{muted ? 'Silencio' : `${local}%`}</span>;
  const muteBtn = (
    <Btn icon={muted ? 'mute' : 'volume'} className={muted ? 'danger-soft' : ''} title="Silenciar" onPress={() => send({ type: 'volume', op: 'mute' })} />
  );
  const minusBtn = <Btn icon="minus" title="Bajar volumen" repeat onPress={() => send({ type: 'volume', op: 'step', delta: -2 })} />;
  const plusBtn = <Btn icon="plus" title="Subir volumen" repeat onPress={() => send({ type: 'volume', op: 'step', delta: 2 })} />;

  if (compact) {
    return (
      <Card className="volume compact">
        <div className="vol-compact">
          {muteBtn}
          {minusBtn}
          <div className="vol-slider">
            {slider}
            {number}
          </div>
          {plusBtn}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Volumen del PC" className="volume" action={number}>
      {slider}
      <div className="vol-buttons">
        {muteBtn}
        {minusBtn}
        {plusBtn}
      </div>
    </Card>
  );
}

export function KeysCard({ send, onKeyboard, keyboardActive }) {
  const key = (name) => () => send({ type: 'key', name });
  return (
    <Card title="Teclas" className="keys">
      <div className="keys-layout">
        <div className="dpad">
          <Btn icon="up" className="up" repeat onPress={key('up')} title="Arriba" />
          <Btn icon="left" className="left" repeat onPress={key('left')} title="Izquierda" />
          <Btn icon="enter" className="center accent" onPress={key('enter')} title="Enter" />
          <Btn icon="right" className="right" repeat onPress={key('right')} title="Derecha" />
          <Btn icon="down" className="down" repeat onPress={key('down')} title="Abajo" />
        </div>
        <div className="keys-side">
          <Btn
            icon="keyboard"
            label={keyboardActive ? 'Ocultar' : 'Teclado'}
            className={keyboardActive ? 'accent' : ''}
            onPress={onKeyboard}
          />
          <Btn label="Esc" onPress={key('escape')} />
          <Btn label="Tab" onPress={key('tab')} />
          <Btn label="⌫" title="Retroceso" repeat onPress={key('backspace')} />
        </div>
      </div>
    </Card>
  );
}

// Poco usado: una fila compacta; el resto se despliega con «más».
export function BrowserCard({ send }) {
  const [more, setMore] = useState(false);
  const key = (name) => () => send({ type: 'key', name });
  return (
    <Card className="browser">
      <div className="browser-row">
        <Btn icon="navBack" title="Atrás" onPress={key('alt+left')} />
        <Btn icon="navFwd" title="Adelante" onPress={key('alt+right')} />
        <Btn icon="reload" title="Recargar (F5)" onPress={key('f5')} />
        <Btn icon="closeTab" title="Cerrar pestaña (Ctrl+W)" onPress={key('ctrl+w')} />
        <Btn icon="minimize" title="Minimizar la ventana de la pantalla" onPress={() => send({ type: 'window.minimize' })} />
        <Btn label={more ? 'Menos' : 'Más'} className={more ? 'accent' : ''} onPress={() => setMore(!more)} />
      </div>
      {more && (
        <div className="browser-row">
          <Btn icon="zoomOut" title="Alejar (Ctrl -)" repeat onPress={key('ctrl+minus')} />
          <Btn icon="zoomIn" title="Acercar (Ctrl +)" repeat onPress={key('ctrl+plus')} />
          <Btn label="Alt+Tab" title="Cambiar de ventana" onPress={key('alt+tab')} />
          <Btn icon="desktop" title="Mostrar escritorio (Win+D)" onPress={key('win+d')} />
        </div>
      )}
    </Card>
  );
}

