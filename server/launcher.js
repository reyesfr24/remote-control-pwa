// Abre los accesos directos en el navegador. La URL siempre sale del JSON del servidor.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { call } from './winhelper.js';

const PF = process.env.ProgramFiles || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const LOCAL = process.env.LOCALAPPDATA || '';

const CANDIDATES = {
  chrome: [
    path.join(PF, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(PF86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ],
  brave: [
    path.join(PF, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ],
  edge: [
    path.join(PF86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(PF, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ],
};

function findBrowser(name) {
  const exe = (CANDIDATES[name] || []).find((p) => fs.existsSync(p));
  if (exe) return { name, exe };
  // Si falta el elegido, Edge viene con Windows 11.
  if (name !== 'edge') return findBrowser('edge');
  return null;
}

// Perfil propio para las ventanas de "tele": se pueden cerrar sin tocar tu navegador normal.
// La primera vez tendrás que iniciar sesión en cada servicio dentro de esa ventana.
export function tvUserDataDir(browser) {
  return path.join(DATA_DIR, 'browser', browser);
}

export async function closeTvBrowsers() {
  let closed = 0;
  for (const browser of Object.keys(CANDIDATES)) {
    const dir = tvUserDataDir(browser);
    if (fs.existsSync(dir)) closed += await call('kill.userdatadir', dir, 20_000);
  }
  return closed;
}

export async function openShortcut(shortcut) {
  if (shortcut.browser === 'default') {
    // Sin shell: la URL se pasa como argumento, no se interpreta.
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', shortcut.url], { windowsHide: true });
    return;
  }

  const browser = findBrowser(shortcut.browser);
  if (!browser) throw new Error('No se encuentra Chrome ni Edge');

  const args = [];
  if (shortcut.isolated) {
    const dir = tvUserDataDir(browser.name);
    if (shortcut.closePrevious && fs.existsSync(dir)) {
      await call('kill.userdatadir', dir, 20_000);
      // Margen para que Chrome libere el bloqueo del perfil.
      await new Promise((r) => setTimeout(r, 400));
    }
    args.push(`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble');
  }
  if (shortcut.profile) args.push(`--profile-directory=${shortcut.profile}`);
  args.push('--autoplay-policy=no-user-gesture-required');
  if (shortcut.mode === 'kiosk') args.push('--kiosk');
  else if (shortcut.mode === 'fullscreen') args.push('--start-fullscreen');
  args.push('--new-window', shortcut.url);

  const child = spawn(browser.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', (err) => console.error('[launcher]', err.message));
  child.unref();
}
