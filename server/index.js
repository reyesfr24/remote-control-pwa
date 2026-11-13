// Servidor del mando: sirve la PWA por HTTPS y recibe órdenes por WebSocket autenticado.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import qrcode from 'qrcode-terminal';
import { WebSocketServer } from 'ws';
import { caDer, ensureCertificates, lanAddresses } from './certs.js';
import { CLIENT_DIST, ICONS_DIR, findShortcut, getShortcuts, loadSettings, saveShortcuts } from './config.js';
import * as input from './input.js';
import { closeTvBrowsers, openShortcut } from './launcher.js';
import { startMdns } from './mdns.js';
import { startMouse } from './mouse.js';
import { mountPanel } from './panel.js';
import { cancelTimer, getTimer, onTimerChange, runPower, setTimer } from './power.js';
import {
  checkToken,
  clearFailures,
  configurePin,
  getToken,
  isBlocked,
  isLocalNetwork,
  isLoopback,
  newPairingCode,
  PIN_MIN_LENGTH,
  pinIsNumeric,
  redeemPairingCode,
  redeemPin,
  registerFailure,
  usesFixedPin,
} from './security.js';
import { call, startHelper } from './winhelper.js';

const settings = loadSettings();
const startedAt = Date.now();
// Nombre fijo en la red (mando-pc.local): la app del iPad no depende de la IP, que puede cambiar.
const lanName = `${settings.mdnsName}.local`.toLowerCase();
const { key, cert, caPem } = ensureCertificates([lanName]);
if (configurePin(settings.pairingPin) === 'too-short') {
  console.warn(`pairingPin tiene menos de ${PIN_MIN_LENGTH} caracteres: se ignora y se usa el código temporal.`);
}
getToken();
getShortcuts();
input.releaseModifiers();
startMouse();
await startHelper().catch((err) => console.error('No arranca el helper de Windows:', err.message));

// ---------- HTTP común ----------

function lanOnly(req, res, next) {
  if (!isLocalNetwork(req.socket.remoteAddress)) return res.status(403).end();
  next();
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  next();
}

const page = (title, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;background:#0b0c10;color:#d8dae3;max-width:640px;margin:0 auto;padding:24px}
a{color:#e0b84e}code{background:#1a1c24;padding:2px 6px;border-radius:6px}.code{font-size:56px;letter-spacing:10px;font-weight:700;color:#fff;margin:16px 0}
li{margin-bottom:10px}.btn{display:inline-block;background:#d4a531;color:#1a1404;padding:12px 18px;border-radius:12px;text-decoration:none;margin:6px 0}</style></head><body>${body}</body></html>`;

// ---------- Servidor HTTP (solo instalación del certificado y emparejamiento) ----------

const setup = express();
setup.disable('x-powered-by');
setup.use(lanOnly, securityHeaders);

setup.get('/', (req, res) => {
  const httpsUrl = `https://${lanName}:${settings.httpsPort}/`;
  res.send(page('Instalar Mando PC', `
    <h1>Mando PC</h1>
    <p>Para que el iPad confíe en el servidor hay que instalar el certificado raíz una sola vez:</p>
    <ol>
      <li>Abre esta página en <b>Safari</b> en el iPad y pulsa: <br><a class="btn" href="/ca.crt">Descargar certificado</a></li>
      <li>Ajustes → <b>Perfil descargado</b> → Instalar.</li>
      <li>Ajustes → General → Información → <b>Ajustes de confianza de certificados</b> → activa «Mando PC CA».</li>
      <li>Abre <a href="${httpsUrl}">${httpsUrl}</a> en Safari → Compartir → <b>Añadir a pantalla de inicio</b>.</li>
      <li>${usesFixedPin()
        ? 'Abre la app desde el icono e introduce el PIN definido en <code>config/settings.json</code>.'
        : `Abre la app desde el icono e introduce el código de emparejamiento que verás en el PC en <code>http://localhost:${settings.httpPort}/pair</code>.`}</li>
    </ol>`));
});

setup.get('/ca.crt', (req, res) => {
  res.set('Content-Type', 'application/x-x509-ca-cert');
  res.set('Content-Disposition', 'attachment; filename="mando-pc-ca.crt"');
  res.send(caDer(caPem));
});

// El código de emparejamiento solo se puede ver desde el propio PC.
setup.get('/pair', (req, res) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).send(page('Prohibido', '<p>Abre esta página en el propio PC.</p>'));
  if (usesFixedPin()) {
    return res.send(page('Emparejar', `<h1>Emparejar con PIN</h1>
      <p>El emparejamiento usa el PIN fijo definido en <code>config/settings.json</code> (<code>pairingPin</code>).
      Escríbelo en la app. Para volver al código temporal, deja <code>pairingPin</code> vacío y reinicia el servidor.</p>`));
  }
  const { code, expires } = newPairingCode();
  console.log(`Código de emparejamiento: ${code}`);
  res.set('Cache-Control', 'no-store');
  res.send(page('Emparejar', `<h1>Código de emparejamiento</h1><div class="code">${code}</div>
    <p>Escríbelo en la app del iPad. Caduca a las ${new Date(expires).toLocaleTimeString('es-ES')} y admite 5 intentos.</p>
    <p><a class="btn" href="/pair">Generar otro</a></p>`));
});

// ---------- Servidor HTTPS (la PWA y el WebSocket) ----------

const app = express();
app.disable('x-powered-by');
app.use(lanOnly, securityHeaders);
app.use(express.json({ limit: '4kb' }));

app.post('/api/pair', (req, res) => {
  const ip = req.socket.remoteAddress;
  if (isBlocked(ip)) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  const result = usesFixedPin() ? redeemPin(req.body?.code) : redeemPairingCode(req.body?.code);
  if (!result.ok) registerFailure(ip);
  else clearFailures(ip);
  res.set('Cache-Control', 'no-store');
  res.status(result.ok ? 200 : 401).json(result);
});

// La pantalla de emparejar pregunta qué pedir: PIN fijo o código temporal (nunca el PIN en sí).
app.get('/api/pair-info', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ mode: usesFixedPin() ? 'pin' : 'code', numeric: usesFixedPin() ? pinIsNumeric() : true, minLength: PIN_MIN_LENGTH });
});

app.use('/icons', express.static(ICONS_DIR, { maxAge: '1h', fallthrough: false }));

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, {
    setHeaders(res, file) {
      // El HTML y el service worker nunca se cachean para que las actualizaciones lleguen.
      if (file.endsWith('.html') || file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    },
  }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  app.get('/', (req, res) => res.send(page('Sin compilar', '<p>Falta compilar la app: ejecuta <code>npm run build</code>.</p>')));
}

const httpsServer = https.createServer({ key, cert }, app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
mountPanel(setup, { settings, lanName, wss, startedAt });

httpsServer.on('upgrade', (req, socket, head) => {
  const ip = req.socket.remoteAddress;
  let originUrl = null;
  try {
    originUrl = new URL(req.headers.origin);
  } catch {}
  // Mismo origen que la app; desde el propio PC también se permite el servidor de desarrollo de Vite.
  const sameOrigin = originUrl && (originUrl.host === req.headers.host || (isLoopback(ip) && originUrl.hostname === 'localhost'));
  if (req.url !== '/ws' || !isLocalNetwork(ip) || isBlocked(ip) || !sameOrigin) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

// ---------- Estado en vivo ----------

let lastStatus = null;
let statusTimer = null;

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.authed && ws.readyState === ws.OPEN) ws.send(data);
}

async function pollStatus() {
  try {
    const s = await call('status');
    const status = { title: s.title, process: s.process, playing: s.peak > 0.005, level: s.level, muted: s.muted };
    if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
      lastStatus = status;
      broadcast({ type: 'status', status });
    }
  } catch (err) {
    console.error('[status]', err.message);
  }
}

function updatePolling() {
  const anyone = [...wss.clients].some((ws) => ws.authed);
  if (anyone && !statusTimer) {
    pollStatus();
    statusTimer = setInterval(pollStatus, 1000);
  } else if (!anyone && statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
    lastStatus = null;
  }
}

onTimerChange((timer) => broadcast({ type: 'timer', timer }));

// ---------- Órdenes ----------

const num = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));

async function handle(ws, msg) {
  switch (msg.type) {
    case 'ping':
      return ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
    case 'move':
      return input.move(num(msg.dx, -2000, 2000) * settings.pointerSpeed, num(msg.dy, -2000, 2000) * settings.pointerSpeed);
    case 'click':
      return input.click(msg.button, msg.count === 2 ? 2 : 1);
    case 'down':
      return input.buttonDown(msg.button);
    case 'up':
      return input.buttonUp(msg.button);
    case 'scroll':
      return input.scroll(num(msg.dx, -5000, 5000) * settings.scrollSpeed, num(msg.dy, -5000, 5000) * settings.scrollSpeed);
    case 'key':
      return input.key(String(msg.name));
    case 'text':
      return input.type(msg.text);
    case 'media':
      return call('media', String(msg.action));
    case 'seek':
      return input.key(msg.dir < 0 ? 'left' : 'right');
    case 'fullscreenPlayer': {
      if (msg.method === 'dblclick') return input.doubleClickActiveWindow();
      return input.key('f');
    }
    case 'volume': {
      // Con showVolumeOsd, Windows enseña su barra de volumen en pantalla.
      const prefix = settings.showVolumeOsd ? 'volume.osd' : 'volume';
      let v;
      if (msg.op === 'set') v = await call(`${prefix}.set`, num(msg.level, 0, 100));
      else if (msg.op === 'step') v = await call(`${prefix}.step`, num(msg.delta, -20, 20));
      else if (msg.op === 'mute') v = await call(`${prefix}.mute`, null);
      else throw new Error('Operación de volumen no válida');
      if (lastStatus) lastStatus = { ...lastStatus, level: v.level, muted: v.muted };
      return broadcast({ type: 'volume', level: v.level, muted: v.muted });
    }
    case 'open': {
      const shortcut = findShortcut(String(msg.id));
      if (!shortcut) throw new Error('Acceso directo desconocido');
      await openShortcut(shortcut);
      return ws.send(JSON.stringify({ type: 'toast', message: `Abriendo ${shortcut.name}` }));
    }
    case 'window.minimize': {
      const done = await call('window.minimize');
      if (!done) ws.send(JSON.stringify({ type: 'toast', message: 'No hay ninguna ventana que minimizar' }));
      return;
    }
    case 'browser.closeTv': {
      const n = await closeTvBrowsers();
      return ws.send(JSON.stringify({ type: 'toast', message: n ? 'Navegador de la tele cerrado' : 'No había nada que cerrar' }));
    }
    case 'shortcuts.save': {
      const list = saveShortcuts(msg.list);
      return broadcast({ type: 'shortcuts', shortcuts: list });
    }
    case 'power':
      return runPower(String(msg.action), msg.confirmed);
    case 'timer.set':
      if (msg.monitorOff) await runPower('monitorOff');
      return setTimer(msg.minutes, String(msg.action));
    case 'timer.cancel':
      return cancelTimer();
    default:
      throw new Error('Orden desconocida');
  }
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.ip = ip;
  ws.authed = false;
  ws.isAlive = true;
  let budget = 0;
  let budgetStart = Date.now();

  // Hay 5 segundos para autenticarse; si no, se corta.
  const authTimer = setTimeout(() => ws.close(4001, 'auth timeout'), 5000);

  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (!ws.authed) {
      if (msg.type === 'auth' && checkToken(msg.token)) {
        ws.authed = true;
        clearTimeout(authTimer);
        clearFailures(ip);
        ws.send(JSON.stringify({
          type: 'hello',
          host: os.hostname(),
          shortcuts: getShortcuts(),
          timer: getTimer(),
          status: lastStatus,
          seekSeconds: settings.seekSeconds,
        }));
        updatePolling();
        if (!lastStatus) pollStatus().then(() => lastStatus && ws.send(JSON.stringify({ type: 'status', status: lastStatus })));
      } else {
        registerFailure(ip);
        ws.close(4003, 'unauthorized');
      }
      return;
    }

    // Límite de 400 mensajes por segundo y conexión.
    const now = Date.now();
    if (now - budgetStart > 1000) {
      budgetStart = now;
      budget = 0;
    }
    if (++budget > 400) return;

    try {
      await handle(ws, msg);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    updatePolling();
  });
});

// Corta conexiones muertas (el iPad se bloquea, se va la wifi…).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);

// ---------- Arranque ----------

httpsServer.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\nMando PC ya está en marcha (el puerto ${settings.httpsPort} está ocupado). No hace falta abrirlo otra vez.`);
  process.exit(1);
});

httpsServer.listen(settings.httpsPort, '0.0.0.0', () => {
  const ips = lanAddresses();
  const main = ips[0] || 'localhost';
  startMdns(settings.mdnsName);
  console.log('\n=== Mando PC ===');
  console.log(`App:          https://${lanName}:${settings.httpsPort}/   (no cambia aunque cambie la IP)`);
  console.log(`              https://${main}:${settings.httpsPort}/   (IP de hoy)`);
  console.log(`Certificado:  http://${main}:${settings.httpPort}/`);
  if (ips.length > 1) console.log(`Otras IPs:    ${ips.slice(1).join(', ')}`);
  if (usesFixedPin()) {
    console.log('Emparejar:    con el PIN fijo de config/settings.json (pairingPin)\n');
  } else {
    console.log(`Emparejar:    http://localhost:${settings.httpPort}/pair  (ábrelo en este PC)`);
    const { code } = newPairingCode();
    console.log(`\nCódigo de emparejamiento (5 min): ${code}\n`);
  }
  console.log('Escanea con la cámara del iPad para instalar el certificado:');
  qrcode.generate(`http://${main}:${settings.httpPort}/`, { small: true });
});

http.createServer(setup).listen(settings.httpPort, '0.0.0.0');
