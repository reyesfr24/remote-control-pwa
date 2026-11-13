// Apagar, reiniciar, suspender, bloquear, apagar pantalla y temporizador.
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.js';
import { call } from './winhelper.js';

let blackout = null;

// Pantalla en negro en lugar de apagarla: en los portátiles con Modern Standby (S0),
// apagar la pantalla suspende el PC al momento.
function screenBlack() {
  if (blackout) return;
  blackout = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'server', 'blackout.ps1')], {
    windowsHide: true,
    stdio: 'ignore',
  });
  blackout.on('exit', () => (blackout = null));
  blackout.on('error', (err) => console.error('[blackout]', err.message));
}

// Hibernar en lugar de suspender: guarda la sesión en disco y apaga del todo, sin gastar batería.
export const POWER_ACTIONS = ['lock', 'monitorOff', 'hibernate', 'shutdown', 'restart'];
// Estas acciones exigen que la app confirme en dos pasos.
const NEEDS_CONFIRM = new Set(['hibernate', 'shutdown', 'restart']);
const TIMER_ACTIONS = ['shutdown', 'hibernate', 'monitorOff'];

export async function runPower(action, confirmed) {
  if (!POWER_ACTIONS.includes(action)) throw new Error('Acción no permitida');
  if (NEEDS_CONFIRM.has(action) && confirmed !== true) throw new Error('Falta la confirmación');
  switch (action) {
    case 'lock':
      return call('lock');
    case 'monitorOff':
      return screenBlack();
    case 'hibernate':
      execFile('shutdown.exe', ['/h'], { windowsHide: true });
      return;
    case 'shutdown':
      execFile('shutdown.exe', ['/s', '/t', '0'], { windowsHide: true });
      return;
    case 'restart':
      execFile('shutdown.exe', ['/r', '/t', '0'], { windowsHide: true });
      return;
  }
}

let timer = null;
let onChange = () => {};

export function onTimerChange(fn) {
  onChange = fn;
}

export function getTimer() {
  return timer ? { action: timer.action, endsAt: timer.endsAt } : null;
}

export function setTimer(minutes, action) {
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins < 1 || mins > 600) throw new Error('Minutos fuera de rango (1-600)');
  if (!TIMER_ACTIONS.includes(action)) throw new Error('Acción de temporizador no permitida');
  cancelTimer(false);
  const endsAt = Date.now() + mins * 60_000;
  const handle = setTimeout(() => {
    timer = null;
    onChange(getTimer());
    runPower(action, true).catch((err) => console.error('[power]', err.message));
  }, mins * 60_000);
  timer = { action, endsAt, handle };
  onChange(getTimer());
  return getTimer();
}

export function cancelTimer(notify = true) {
  if (timer) clearTimeout(timer.handle);
  timer = null;
  if (notify) onChange(null);
}
