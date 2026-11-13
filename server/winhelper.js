// Cliente del helper PowerShell (winhelper.ps1): un proceso persistente para no pagar
// el arranque de PowerShell en cada orden.
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT } from './config.js';

const SCRIPT = path.join(ROOT, 'server', 'winhelper.ps1');
const TIMEOUT_MS = 10_000;

let child = null;
let ready = null;
let nextId = 1;
const pending = new Map();

function start() {
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.setDefaultEncoding('utf8');

  ready = new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line.replace(/^﻿/, ''));
      } catch {
        return;
      }
      if (msg.ready) return resolve();
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      clearTimeout(job.timer);
      msg.ok ? job.resolve(msg.result) : job.reject(new Error(msg.error));
    });
    child.once('exit', (code) => reject(new Error(`El helper de Windows terminó (código ${code})`)));
  });
  ready.catch(() => {});

  child.stderr.on('data', (d) => console.error('[winhelper]', d.toString().trim()));
  child.on('exit', () => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error('El helper de Windows se ha reiniciado'));
    }
    pending.clear();
    child = null;
    // Se relanza automáticamente si se cae.
    setTimeout(start, 1000);
  });
}

export async function call(cmd, arg, timeoutMs = TIMEOUT_MS) {
  if (!child) start();
  await ready;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Tiempo de espera agotado en ${cmd}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, cmd, arg }) + '\n');
  });
}

export function startHelper() {
  if (!child) start();
  return ready;
}
