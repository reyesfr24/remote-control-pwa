// Cliente del proceso de ratón (mouse.ps1). Las órdenes se escriben por stdin y se ejecutan
// en orden; no hay respuestas, así que no añade esperas.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.js';

const SCRIPT = path.join(ROOT, 'server', 'mouse.ps1');

let child = null;

function start() {
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (d) => console.error('[mouse]', d.toString().trim()));
  child.on('exit', () => {
    child = null;
    // Se relanza automáticamente si se cae.
    setTimeout(start, 1000);
  });
}

export function mouseCommand(...parts) {
  if (!child) start();
  child.stdin.write(parts.join(' ') + '\n');
}

export function startMouse() {
  if (!child) start();
}
