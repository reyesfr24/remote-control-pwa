import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserCard, KeysCard, MediaCard, VolumeCard } from './components/Controls.jsx';
import KeyboardCapture from './components/KeyboardCapture.jsx';
import Pairing from './components/Pairing.jsx';
import PowerSheet, { formatLeft, useNow } from './components/PowerSheet.jsx';
import { ShortcutEditor, ShortcutGrid } from './components/Shortcuts.jsx';
import Touchpad from './components/Touchpad.jsx';
import { Btn, Icon, Modal } from './components/ui.jsx';
import { Remote, loadToken, saveToken } from './remote.js';

const PREFS_KEY = 'mandopc.prefs';
const DEFAULT_PREFS = { sensitivity: 1.4, scrollSensitivity: 1, dim: false };

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

const CONN_LABEL = { connecting: 'Conectando…', online: 'Conectado', offline: 'Sin conexión', unauthorized: 'No autorizado' };

// Móvil en vertical: touchpad arriba, reproducción y volumen abajo, el resto en el panel «Más».
const PHONE_QUERY = '(max-width: 600px) and (orientation: portrait)';

function useMatchMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function StatusBar({ conn, host, latency, status, timer, onPower, onSettings, onDim, dim, onMore }) {
  const now = useNow(!!timer);
  return (
    <header className="topbar">
      <div className={`conn conn-${conn}`}>
        <span className="dot" />
        <span>{conn === 'online' && host ? host : CONN_LABEL[conn]}</span>
        {conn === 'online' && latency != null && <small>{latency} ms</small>}
      </div>
      <div className="now-playing" title={status?.title}>
        <span className={`eq ${status?.playing ? 'on' : ''}`} aria-label={status?.playing ? 'Sonando' : 'En silencio'}>
          <i />
          <i />
          <i />
        </span>
        <span className="np-text">
          <b>{status?.title || 'Sin ventana activa'}</b>
          {status?.process && <small>{status.process}</small>}
        </span>
      </div>
      {timer && (
        <Btn className="timer-pill" icon="timer" label={formatLeft(timer.endsAt - now)} title="Temporizador" onPress={onPower} />
      )}
      {onMore ? (
        <Btn icon="apps" className="ghost round" title="Más controles" onPress={onMore} />
      ) : (
        <>
          <Btn icon="dim" className={`ghost round ${dim ? 'on' : ''}`} title="Atenuar la app" onPress={onDim} />
          <Btn icon="settings" className="ghost round" title="Ajustes" onPress={onSettings} />
        </>
      )}
      <Btn icon="power" className="round power-trigger" title="Energía" onPress={onPower} />
    </header>
  );
}

function SettingsSheet({ prefs, setPrefs, onClose, onUnpair }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title="Ajustes" onClose={onClose}>
      <label className="range-row">
        <span>Velocidad del cursor</span>
        <input type="range" min="0.5" max="3" step="0.1" value={prefs.sensitivity} onChange={(e) => setPrefs({ ...prefs, sensitivity: Number(e.target.value) })} />
        <b>{prefs.sensitivity.toFixed(1)}</b>
      </label>
      <label className="range-row">
        <span>Velocidad del scroll</span>
        <input type="range" min="0.3" max="3" step="0.1" value={prefs.scrollSensitivity} onChange={(e) => setPrefs({ ...prefs, scrollSensitivity: Number(e.target.value) })} />
        <b>{prefs.scrollSensitivity.toFixed(1)}</b>
      </label>
      <p className="note">
        Limitación de Windows: si la ventana activa se ejecuta como administrador, el ratón y el teclado del mando no le llegan.
      </p>
      <button type="button" className={`btn wide ${confirm ? 'danger' : 'subtle'}`} onClick={() => (confirm ? onUnpair() : setConfirm(true))}>
        {confirm ? 'Pulsa otra vez para olvidar este PC' : 'Olvidar este PC (desemparejar)'}
      </button>
    </Modal>
  );
}

// Panel del móvil con lo que no cabe en pantalla: accesos, teclas, navegador y ajustes.
function MoreSheet({ shortcuts, send, kbActive, onKeyboard, onEditShortcuts, onSettings, onDim, dim, onClose }) {
  return (
    <Modal title="Más controles" onClose={onClose}>
      <ShortcutGrid shortcuts={shortcuts} send={send} onEdit={onEditShortcuts} onOpened={onClose} />
      <KeysCard send={send} onKeyboard={onKeyboard} keyboardActive={kbActive} />
      <BrowserCard send={send} />
      <div className="more-actions">
        <Btn icon="dim" label={dim ? 'Quitar atenuado' : 'Atenuar la app'} className={dim ? 'accent' : ''} onPress={onDim} />
        <Btn icon="settings" label="Ajustes" onPress={onSettings} />
      </div>
    </Modal>
  );
}

export default function App() {
  const [token, setToken] = useState(loadToken);
  const [conn, setConn] = useState('connecting');
  const [hello, setHello] = useState(null);
  const [shortcuts, setShortcuts] = useState([]);
  const [status, setStatus] = useState(null);
  const [volume, setVolume] = useState({ level: null, muted: false });
  const [timer, setTimer] = useState(null);
  const [latency, setLatency] = useState(null);
  const [toast, setToast] = useState(null);
  const [sheet, setSheet] = useState(null); // 'power' | 'shortcuts' | 'settings' | 'more'
  const [kbActive, setKbActive] = useState(false);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const isPhone = useMatchMedia(PHONE_QUERY);
  const remote = useRef(null);
  const kb = useRef(null);
  const toastTimer = useRef(0);

  const setPrefs = (p) => {
    setPrefsState(p);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {}
  };

  const showToast = useCallback((message, kind = 'info') => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    if (!token) return;
    const r = new Remote(token, (msg) => {
      switch (msg.type) {
        case 'conn':
          setConn(msg.state);
          break;
        case 'hello':
          setHello(msg);
          setShortcuts(msg.shortcuts);
          setTimer(msg.timer);
          if (msg.status) {
            setStatus(msg.status);
            setVolume({ level: msg.status.level, muted: msg.status.muted });
          }
          break;
        case 'status':
          setStatus(msg.status);
          setVolume({ level: msg.status.level, muted: msg.status.muted });
          break;
        case 'volume':
          setVolume({ level: msg.level, muted: msg.muted });
          break;
        case 'shortcuts':
          setShortcuts(msg.shortcuts);
          break;
        case 'timer':
          setTimer(msg.timer);
          break;
        case 'latency':
          setLatency(msg.ms);
          break;
        case 'toast':
          showToast(msg.message);
          break;
        case 'error':
          showToast(msg.message, 'error');
          break;
      }
    });
    remote.current = r;
    return () => r.close();
  }, [token, showToast]);

  const send = useCallback((msg) => {
    if (!remote.current?.send(msg) && msg.type !== 'move' && msg.type !== 'scroll') showToast('Sin conexión con el PC', 'error');
  }, [showToast]);

  const onSeek = useCallback((dir) => send({ type: 'seek', dir }), [send]);

  const unpair = () => {
    remote.current?.close();
    saveToken(null);
    setToken(null);
    setSheet(null);
  };

  if (!token || conn === 'unauthorized') {
    return (
      <Pairing
        reason={conn === 'unauthorized' ? 'El PC ya no reconoce este dispositivo. Vuelve a emparejarlo.' : ''}
        onPaired={(t) => {
          saveToken(t);
          setConn('connecting');
          setToken(t);
        }}
      />
    );
  }

  const toggleKeyboard = () => (kbActive ? kb.current.close() : kb.current.open());
  const toggleDim = () => setPrefs({ ...prefs, dim: !prefs.dim });
  const touchpad = <Touchpad send={send} sensitivity={prefs.sensitivity} scrollSensitivity={prefs.scrollSensitivity} onSeek={onSeek} />;
  const media = <MediaCard send={send} seekSeconds={hello?.seekSeconds ?? 10} />;

  return (
    <div className={`app ${isPhone ? 'phone' : ''} ${prefs.dim ? 'dim' : ''} ${conn !== 'online' ? 'disconnected' : ''}`}>
      <StatusBar
        conn={conn}
        host={hello?.host}
        latency={latency}
        status={status}
        timer={timer}
        dim={prefs.dim}
        onDim={toggleDim}
        onPower={() => setSheet('power')}
        onSettings={() => setSheet('settings')}
        onMore={isPhone ? () => setSheet('more') : null}
      />

      {isPhone ? (
        <main className="phone-layout">
          {/* Los botones van fuera del touchpad (hermanos, no hijos) para que tocarlos no haga clic en el PC. */}
          <div className="pad-wrap">
            {touchpad}
            <Btn
              icon="minimize"
              className="round pad-fab minimize-fab"
              title="Minimizar la ventana de la pantalla"
              onPress={() => send({ type: 'window.minimize' })}
            />
            <Btn
              icon="keyboard"
              className={`round pad-fab kbd-fab ${kbActive ? 'accent' : ''}`}
              title={kbActive ? 'Ocultar teclado' : 'Teclado'}
              onPress={toggleKeyboard}
            />
          </div>
          {media}
          <VolumeCard send={send} level={volume.level} muted={volume.muted} compact />
        </main>
      ) : (
      <main className="layout">
        <aside className="col col-left">
          <ShortcutGrid shortcuts={shortcuts} send={send} onEdit={() => setSheet('shortcuts')} />
          <KeysCard send={send} onKeyboard={toggleKeyboard} keyboardActive={kbActive} />
          <BrowserCard send={send} />
        </aside>

        {/* Clic y clic derecho: un toque con uno o dos dedos en el touchpad. */}
        <section className="col col-center">{touchpad}</section>

        <aside className="col col-right">
          {media}
          <VolumeCard send={send} level={volume.level} muted={volume.muted} />
        </aside>
      </main>
      )}

      <KeyboardCapture ref={kb} send={send} onActiveChange={setKbActive} />
      {kbActive && (
        <div className="kbd-banner">
          <Icon name="keyboard" /> Escribiendo en el PC
          <Btn label="Cerrar" className="small" onPress={() => kb.current.close()} />
        </div>
      )}

      {conn !== 'online' && (
        <div className="offline-banner">
          <span className="spinner" /> {CONN_LABEL[conn]} — reintentando…
        </div>
      )}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}

      {sheet === 'more' && (
        <MoreSheet
          shortcuts={shortcuts}
          send={send}
          kbActive={kbActive}
          // El teclado se abre dentro del toque (si no, iOS no lo saca) y el panel se cierra para escribir.
          onKeyboard={() => {
            toggleKeyboard();
            setSheet(null);
          }}
          onEditShortcuts={() => setSheet('shortcuts')}
          onSettings={() => setSheet('settings')}
          onDim={toggleDim}
          dim={prefs.dim}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'power' && <PowerSheet send={send} timer={timer} onClose={() => setSheet(null)} />}
      {sheet === 'shortcuts' && <ShortcutEditor shortcuts={shortcuts} send={send} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <SettingsSheet prefs={prefs} setPrefs={setPrefs} onClose={() => setSheet(null)} onUnpair={unpair} />}
    </div>
  );
}
