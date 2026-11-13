// Lo que ejecuta el acceso directo «Mando PC»: arranca el servidor en segundo plano (si no estaba ya)
// y abre el panel en una ventana de aplicación de Edge, sin consola.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_DIST, DATA_DIR, ROOT, loadSettings } from '../server/config.js';

const { httpPort } = loadSettings();
const STATE_URL = `http://127.0.0.1:${httpPort}/panel/state`;
const PANEL_URL = `http://localhost:${httpPort}/panel`;
const LOG = path.join(DATA_DIR, 'server.log');

async function running() {
  try {
    const res = await fetch(STATE_URL, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function startServer() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = fs.openSync(LOG, 'a');
  fs.writeSync(out, `\n--- ${new Date().toLocaleString('es-ES')} ---\n`);
  const child = spawn(process.execPath, [path.join('server', 'index.js')], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
}

function findEdge() {
  const PF = process.env.ProgramFiles || 'C:\\Program Files';
  const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(PF86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(PF, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(PF, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].find((p) => fs.existsSync(p));
}

function openPanel() {
  const exe = findEdge();
  if (!exe) {
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', PANEL_URL], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  // Perfil propio: la ventana va aparte de tu navegador y recuerda su tamaño y posición.
  spawn(exe, [
    `--app=${PANEL_URL}`,
    `--user-data-dir=${path.join(DATA_DIR, 'panel-browser')}`,
    '--window-size=520,640',
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' }).unref();
}

if (!fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  spawnSync('npm', ['run', 'build'], { cwd: ROOT, shell: true, windowsHide: true, stdio: 'ignore' });
}

if (!(await running())) {
  startServer();
  let ok = false;
  for (let i = 0; i < 50 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ok = await running();
  }
  if (!ok) {
    // No ha arrancado: se enseña el registro para ver por qué.
    spawn('notepad.exe', [LOG], { detached: true, stdio: 'ignore' }).unref();
    process.exit(1);
  }
}

openPanel();
