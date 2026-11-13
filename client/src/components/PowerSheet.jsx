import { useEffect, useState } from 'react';
import { Btn, Icon, Modal } from './ui.jsx';

const ACTIONS = [
  { id: 'monitorOff', label: 'Pantalla en negro', icon: 'monitorOff', hint: 'El sonido sigue. Se quita al tocar el touchpad.' },
  { id: 'lock', label: 'Bloquear', icon: 'lock', hint: 'Pantalla de bloqueo de Windows.' },
  { id: 'hibernate', label: 'Hibernar', icon: 'moon', confirm: true, hint: 'Guarda todo y apaga. Al encender sigue donde estaba.' },
  { id: 'restart', label: 'Reiniciar', icon: 'restart', confirm: true },
  { id: 'shutdown', label: 'Apagar PC', icon: 'power', confirm: true, danger: true },
];

const TIMER_ACTIONS = { shutdown: 'apagar', hibernate: 'hibernar', monitorOff: 'poner la pantalla en negro' };
const MINUTES = [15, 30, 45, 60, 90, 120];

export function formatLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function PowerSheet({ send, timer, onClose }) {
  const [armed, setArmed] = useState(null);
  const [timerAction, setTimerAction] = useState('shutdown');
  const [siesta, setSiesta] = useState(true);
  const now = useNow(!!timer);

  // La confirmación caduca a los 4 segundos para no dejar el botón "cargado".
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const run = (action) => {
    if (action.confirm && armed !== action.id) return setArmed(action.id);
    setArmed(null);
    send({ type: 'power', action: action.id, confirmed: action.confirm ? true : undefined });
    if (action.id !== 'monitorOff') onClose();
  };

  const startTimer = (minutes) => {
    send({ type: 'timer.set', minutes, action: timerAction, monitorOff: siesta && timerAction !== 'monitorOff' });
  };

  return (
    <Modal title="Energía" onClose={onClose} wide>
      <div className="power-grid">
        {ACTIONS.map((a) => (
          <Btn
            key={a.id}
            className={`power-btn ${a.danger ? 'danger-soft' : ''} ${armed === a.id ? 'armed' : ''}`}
            onPress={() => run(a)}
          >
            <Icon name={a.icon} size={30} />
            <span className="btn-label">{armed === a.id ? 'Pulsa otra vez' : a.label}</span>
            {a.hint && armed !== a.id && <small>{a.hint}</small>}
            {armed === a.id && <small>para confirmar</small>}
          </Btn>
        ))}
      </div>

      <h3 className="section-title">
        <Icon name="timer" /> Temporizador
      </h3>
      {timer ? (
        <div className="timer-active">
          <div>
            <div className="timer-big">{formatLeft(timer.endsAt - now)}</div>
            <div className="muted">para {TIMER_ACTIONS[timer.action]} el PC</div>
          </div>
          <div className="timer-buttons">
            <Btn label="+15 min" onPress={() => send({ type: 'timer.set', minutes: Math.ceil((timer.endsAt - Date.now()) / 60000) + 15, action: timer.action })} />
            <Btn label="Cancelar" className="danger-soft" onPress={() => send({ type: 'timer.cancel' })} />
          </div>
        </div>
      ) : (
        <>
          <div className="segmented">
            {Object.entries(TIMER_ACTIONS).map(([id, label]) => (
              <button key={id} type="button" className={timerAction === id ? 'on' : ''} onClick={() => setTimerAction(id)}>
                {label[0].toUpperCase() + label.slice(1)}
              </button>
            ))}
          </div>
          <div className="chips">
            {MINUTES.map((m) => (
              <Btn key={m} className="chip" label={m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`} onPress={() => startTimer(m)} />
            ))}
          </div>
          {timerAction !== 'monitorOff' && (
            <label className="check">
              <input type="checkbox" checked={siesta} onChange={(e) => setSiesta(e.target.checked)} />
              Modo siesta: poner ya la pantalla en negro y dejar solo el sonido
            </label>
          )}
        </>
      )}
    </Modal>
  );
}
