// Panel del PC: la ventana que abre el acceso directo «Mando PC».
// Solo responde a la propia máquina (loopback y Host localhost) y las acciones exigen una cabecera
// propia, así que otra web abierta en el navegador no puede leerlo ni pararlo.
import { createRequire } from 'node:module';
import path from 'node:path';
import { CLIENT_DIST } from './config.js';
import { lanAddresses } from './certs.js';
import { isLoopback } from './security.js';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

// ---------- Registro en memoria ----------
// Se guardan las últimas líneas de la consola para verlas en el panel aunque no haya terminal.

const LOG_MAX = 200;
const logLines = [];
for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    const text = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    // Sin códigos de color ni el QR de texto de la consola (el panel ya lo enseña como imagen).
    if (/\x1b\[/.test(text)) return;
    for (const line of text.split('\n')) {
      if (!line.trim() || /^[█▄▀ ]+$/.test(line)) continue;
      logLines.push({ t: Date.now(), level, line });
      if (logLines.length > LOG_MAX) logLines.shift();
    }
  };
}

// ---------- QR en SVG ----------

function qrSvg(text) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// ---------- Rutas ----------

export function mountPanel(app, { settings, lanName, wss, startedAt }) {
  const hosts = new Set([`localhost:${settings.httpPort}`, `127.0.0.1:${settings.httpPort}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));

  // Host fijo también frena el DNS rebinding (una web que se hace pasar por 127.0.0.1).
  function localOnly(req, res, next) {
    if (!isLoopback(req.socket.remoteAddress) || !hosts.has(req.headers.host)) return res.status(403).end();
    res.set('Cache-Control', 'no-store');
    next();
  }

  // Las acciones piden una cabecera propia: desde otro origen eso obliga a un preflight que no se contesta.
  function action(req, res, next) {
    if (req.get('x-mando-panel') !== '1' || (req.headers.origin && !origins.has(req.headers.origin))) return res.status(403).end();
    next();
  }

  app.get('/panel', localOnly, (req, res) => res.type('html').send(PANEL_HTML));
  app.get('/panel/icon.png', localOnly, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'icon-192.png'), (err) => err && res.status(404).end()));

  app.get('/panel/state', localOnly, (req, res) => {
    const ips = lanAddresses();
    const main = ips[0] || 'localhost';
    const certUrl = `http://${main}:${settings.httpPort}/`;
    const appUrl = `https://${lanName}:${settings.httpsPort}/`;
    const devices = [...wss.clients].filter((ws) => ws.authed).map((ws) => ws.ip);
    res.json({
      startedAt,
      appUrl,
      appQr: qrSvg(appUrl),
      ipUrl: `https://${main}:${settings.httpsPort}/`,
      certUrl,
      certQr: qrSvg(certUrl),
      otherIps: ips.slice(1),
      devices,
      log: logLines.slice(-80),
    });
  });

  app.post('/panel/stop', localOnly, action, (req, res) => {
    console.log('Servidor detenido desde el panel.');
    res.json({ ok: true });
    setTimeout(() => process.exit(0), 300);
  });
}

const PANEL_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mando PC</title>
<link rel="icon" href="/panel/icon.png">
<style>
:root {
  --bg: #07080b; --panel: #0f1116; --panel-2: #151820; --line: #1d212b;
  --text: #c3c7d2; --text-hi: #eef0f5; --dim: #6c7282;
  --accent: #d4a531; --accent-soft: rgba(212,165,49,.14);
  --danger: #ff6464; --danger-soft: rgba(255,100,100,.12); --ok: #4fd18b;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body { font: 14px/1.45 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif; padding: 20px 20px 24px; user-select: none; }
h1, h2 { margin: 0; font-weight: 600; color: var(--text-hi); }
h1 { font-size: 20px; letter-spacing: .2px; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--dim); margin-bottom: 10px; }
button { font: inherit; cursor: pointer; border: 0; border-radius: 10px; padding: 8px 14px; background: var(--panel-2); color: var(--text-hi); transition: background .15s, transform .1s; }
button:hover { background: #1c202a; }
button:active { transform: scale(.97); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
header img { width: 44px; height: 44px; border-radius: 11px; }
.status { display: flex; align-items: center; gap: 7px; color: var(--dim); font-size: 13px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px rgba(79,209,139,.15); }
.off .dot { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }

.card { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin-bottom: 12px; }
.url { display: flex; align-items: center; gap: 10px; }
.url { flex-wrap: wrap; }
.url code { font: 600 14px/1.3 'Cascadia Code', Consolas, monospace; color: var(--accent); white-space: nowrap; user-select: text; }
.url button { padding: 5px 11px; font-size: 13px; }
.sub { color: var(--dim); font-size: 12.5px; margin-top: 6px; }
.sub code { user-select: text; color: var(--text); }

.qr { display: flex; gap: 16px; align-items: center; }
.qr > div:last-child { flex: 1; min-width: 0; }
details .qr { margin-top: 12px; }
.qr .img { width: 116px; height: 116px; flex: none; border-radius: 10px; overflow: hidden; background: #fff; padding: 2px; }
.qr .img svg { display: block; width: 100%; height: 100%; }


.devices { list-style: none; margin: 0; padding: 0; }
.devices li { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-family: 'Cascadia Code', Consolas, monospace; font-size: 13px; }
.empty { color: var(--dim); }

details summary { cursor: pointer; list-style: none; display: flex; justify-content: space-between; }
details summary::-webkit-details-marker { display: none; }
details summary h2 { margin: 0; }
details summary::after { content: '▾'; color: var(--dim); transition: transform .2s; }
details[open] summary::after { transform: rotate(180deg); }
.log { margin-top: 10px; max-height: 190px; overflow: auto; font: 12px/1.5 'Cascadia Code', Consolas, monospace; color: var(--dim); user-select: text; white-space: pre-wrap; word-break: break-word; }
.log .warn { color: #e8925a; } .log .error { color: var(--danger); }
.log time { color: #454a57; margin-right: 8px; }

footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
footer p { margin: 0; color: var(--dim); font-size: 12px; }
.danger { background: var(--danger-soft); color: var(--danger); }
.danger:hover { background: rgba(255,100,100,.2); }
.danger.armed { background: var(--danger); color: #1a0505; }
.toast { position: fixed; left: 50%; bottom: 18px; transform: translate(-50%, 20px); opacity: 0; background: var(--panel-2); border: 1px solid var(--line); padding: 8px 14px; border-radius: 10px; transition: .2s; pointer-events: none; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }

.stopped { text-align: center; padding: 60px 10px; }
.stopped h1 { margin-bottom: 8px; }
</style>
</head>
<body>
<main id="app">
  <header>
    <img src="/panel/icon.png" alt="">
    <div>
      <h1>Mando PC</h1>
      <div class="status" id="status"><span class="dot"></span><span id="statusText">Conectando…</span></div>
    </div>
  </header>

  <section class="card">
    <h2>Aplicación web</h2>
    <div class="qr"><div class="img" id="appQr"></div>
      <div>
        <div class="url"><code id="appUrl">…</code><button data-copy="appUrl">Copiar</button></div>
        <div class="sub">Escanéalo con la cámara para abrirla.</div>
        <div class="sub">IP de hoy: <code id="ipUrl">…</code><span id="otherIps"></span></div>
      </div>
    </div>
  </section>

  <section class="card">
    <details><summary><h2>Instalar certificado</h2></summary>
      <div class="qr"><div class="img" id="qr"></div>
        <div class="sub" style="margin:0">Escanéalo con la cámara para instalar el certificado (solo una vez por dispositivo).<br><br><code id="certUrl"></code></div>
      </div>
    </details>
  </section>

  <section class="card">
    <h2>Dispositivos conectados</h2>
    <ul class="devices" id="devices"></ul>
  </section>

  <section class="card">
    <details id="logBox"><summary><h2>Registro</h2></summary><div class="log" id="log"></div></details>
  </section>

  <footer>
    <p>Cerrar esta ventana no detiene el servidor.</p>
    <button class="danger" id="stop">Detener servidor</button>
  </footer>
</main>
<div class="toast" id="toast"></div>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
let state = null, stopped = false;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 1800);
}

async function post(url) {
  const r = await fetch(url, { method: 'POST', headers: { 'X-Mando-Panel': '1' } });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function setQr(id, url, svg) {
  if ($(id).dataset.url !== url) { $(id).innerHTML = svg; $(id).dataset.url = url; }
}

function render() {
  $('status').classList.remove('off');
  $('statusText').textContent = 'En marcha desde las ' + hhmm(state.startedAt);
  $('appUrl').textContent = state.appUrl;
  $('ipUrl').textContent = state.ipUrl;
  $('otherIps').textContent = state.otherIps.length ? ' · otras: ' + state.otherIps.join(', ') : '';
  $('certUrl').textContent = state.certUrl;
  setQr('appQr', state.appUrl, state.appQr);
  setQr('qr', state.certUrl, state.certQr);
  $('devices').innerHTML = state.devices.length
    ? state.devices.map((ip) => '<li><span class="dot"></span>' + esc(ip.replace(/^::ffff:/, '')) + '</li>').join('')
    : '<li class="empty">Ninguno ahora mismo</li>';
  const log = $('log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 20;
  log.innerHTML = state.log.map((l) => '<div class="' + l.level + '"><time>' + hhmm(l.t) + '</time>' + esc(l.line) + '</div>').join('');
  if (atBottom) log.scrollTop = log.scrollHeight;
}

async function refresh() {
  if (stopped) return;
  try {
    const r = await fetch('/panel/state');
    state = await r.json();
    render();
  } catch {
    $('status').classList.add('off');
    $('statusText').textContent = 'Sin respuesta del servidor';
  }
}

document.addEventListener('click', (e) => {
  const id = e.target.dataset?.copy;
  if (!id) return;
  navigator.clipboard.writeText($(id).textContent).then(() => toast('Copiado'));
});

$('stop').onclick = async (e) => {
  const btn = e.currentTarget;
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.textContent = '¿Seguro? Pulsa otra vez';
    setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Detener servidor'; }, 4000);
    return;
  }
  try { await post('/panel/stop'); } catch {}
  stopped = true;
  $('app').innerHTML = '<div class="stopped"><h1>Servidor detenido</h1><p class="sub">El mando ya no funciona. Abre «Mando PC» otra vez para arrancarlo.</p></div>';
  fit();
};

// La ventana se ajusta a la altura del contenido (al cargar, al desplegar y si cambia la lista).
function fit() {
  const want = Math.ceil($('app').getBoundingClientRect().bottom + window.scrollY) + 24;
  const h = Math.min(screen.availHeight, want + window.outerHeight - window.innerHeight);
  if (Math.abs(window.outerHeight - h) > 2) window.resizeTo(window.outerWidth, h);
}
document.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', fit));

refresh().then(fit);
setInterval(() => refresh().then(fit), 2000);
</script>
</body>
</html>`;
