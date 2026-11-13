// Ratón y teclado. Todas las teclas y combinaciones pasan por una lista blanca.
import { Key, keyboard } from '@nut-tree-fork/nut-js';
import { mouseCommand } from './mouse.js';

keyboard.config.autoDelayMs = 0;

// Nombre que envía la app -> teclas que se pulsan a la vez.
const KEYS = {
  enter: [Key.Enter],
  escape: [Key.Escape],
  tab: [Key.Tab],
  backspace: [Key.Backspace],
  delete: [Key.Delete],
  space: [Key.Space],
  up: [Key.Up],
  down: [Key.Down],
  left: [Key.Left],
  right: [Key.Right],
  home: [Key.Home],
  end: [Key.End],
  pageup: [Key.PageUp],
  pagedown: [Key.PageDown],
  f: [Key.F],
  k: [Key.K],
  m: [Key.M],
  c: [Key.C],
  f5: [Key.F5],
  f11: [Key.F11],
  'shift+tab': [Key.LeftShift, Key.Tab],
  'alt+f4': [Key.LeftAlt, Key.F4],
  'alt+tab': [Key.LeftAlt, Key.Tab],
  'alt+left': [Key.LeftAlt, Key.Left],
  'alt+right': [Key.LeftAlt, Key.Right],
  'ctrl+w': [Key.LeftControl, Key.W],
  'ctrl+t': [Key.LeftControl, Key.T],
  'ctrl+l': [Key.LeftControl, Key.L],
  'ctrl+shift+t': [Key.LeftControl, Key.LeftShift, Key.T],
  'ctrl+tab': [Key.LeftControl, Key.Tab],
  'ctrl+shift+tab': [Key.LeftControl, Key.LeftShift, Key.Tab],
  'ctrl+plus': [Key.LeftControl, Key.Add],
  'ctrl+minus': [Key.LeftControl, Key.Subtract],
  'ctrl+0': [Key.LeftControl, Key.Num0],
  'win+d': [Key.LeftSuper, Key.D],
  'shift+n': [Key.LeftShift, Key.N],
  'shift+p': [Key.LeftShift, Key.P],
};

export const KEY_NAMES = Object.keys(KEYS);

// El ratón va por mouse.ps1 (píxeles físicos): nut-js falla con pantallas de distinto escalado.
const BUTTONS = ['left', 'right', 'middle'];

// Cola en serie para el teclado: las órdenes se ejecutan en el orden en que llegan.
let chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch((err) => console.error('[input]', err.message));
  return chain;
}

const fmt = (n) => (Math.round(n * 100) / 100).toString();

export function move(dx, dy) {
  if (dx || dy) mouseCommand('m', fmt(dx), fmt(dy));
}

export function click(button = 'left', count = 1) {
  if (BUTTONS.includes(button)) mouseCommand('c', button, count === 2 ? 2 : 1);
}

export function buttonDown(button = 'left') {
  if (BUTTONS.includes(button)) mouseCommand('d', button);
}

export function buttonUp(button = 'left') {
  if (BUTTONS.includes(button)) mouseCommand('u', button);
}

// Unidades de rueda de Windows (120 = una muesca).
export function scroll(dx, dy) {
  if (dx || dy) mouseCommand('w', Math.round(dx), Math.round(dy));
}

// Doble clic en el centro de la ventana activa (pantalla completa en muchos reproductores).
export function doubleClickActiveWindow() {
  mouseCommand('center');
}

export function key(name) {
  const keys = KEYS[name];
  if (!keys) throw new Error(`Tecla no permitida: ${name}`);
  // Mismo orden al pulsar y al soltar: nut-js ya separa la tecla de los modificadores.
  // Se suelta siempre, aunque falle la pulsación, para no dejar Ctrl/Alt atascados en Windows.
  return enqueue(async () => {
    try {
      await keyboard.pressKey(...keys);
    } finally {
      await keyboard.releaseKey(...keys);
    }
  });
}

// Suelta Ctrl, Alt y Shift por si un fallo anterior los dejó pulsados.
export function releaseModifiers() {
  const mods = [Key.LeftControl, Key.RightControl, Key.LeftAlt, Key.RightAlt, Key.LeftShift, Key.RightShift];
  return enqueue(async () => {
    for (const k of mods) await keyboard.releaseKey(k);
  });
}

// Texto libre del teclado de iOS. Se quitan los caracteres de control.
export function type(text) {
  const clean = String(text).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500);
  if (clean) return enqueue(() => keyboard.type(clean));
}
