// Carga y guarda la configuración (ajustes y accesos directos) en ficheros JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const DATA_DIR = path.join(ROOT, 'data');
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
export const ICONS_DIR = path.join(CONFIG_DIR, 'icons');

const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const SHORTCUTS_FILE = path.join(CONFIG_DIR, 'shortcuts.json');

const DEFAULT_SETTINGS = {
  httpsPort: 8443,
  // Puerto HTTP solo para descargar el certificado raíz e instrucciones. No permite controlar nada.
  httpPort: 8080,
  // Multiplicadores que ajustan la sensibilidad sin tocar la app.
  pointerSpeed: 1,
  scrollSpeed: 1,
  seekSeconds: 10,
  // Mostrar la barra de volumen de Windows al cambiar el volumen desde el mando.
  showVolumeOsd: true,
  // Nombre en la red local: la app se abre en https://<mdnsName>.local:8443 aunque cambie la IP.
  mdnsName: 'mando-pc',
  // PIN fijo para emparejar (6 caracteres o más). Vacío: código temporal en http://localhost:8080/pair.
  pairingPin: '',
};

const DEFAULT_SHORTCUTS = [
  { id: 'movistar', name: 'Movistar Plus+', url: 'https://ver.movistarplus.es/', color: '#00a9e0', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', color: '#ff3b30', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/', color: '#9146ff', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true },
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/browse', color: '#e50914', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true },
  { id: 'primevideo', name: 'Prime Video', url: 'https://www.primevideo.com/', color: '#1f8ff0', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true },
  { id: 'rtve', name: 'RTVE Play', url: 'https://www.rtve.es/play/', color: '#ff6a00', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`No se pudo leer ${file}: ${err.message}`);
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function loadSettings() {
  const stored = readJson(SETTINGS_FILE);
  const settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  // Se reescribe si faltan opciones nuevas, para que aparezcan en el fichero.
  if (!stored || Object.keys(DEFAULT_SETTINGS).some((k) => !(k in stored))) writeJson(SETTINGS_FILE, settings);
  return settings;
}

// ---------- Accesos directos ----------

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PROFILE_RE = /^[\w .-]{1,60}$/;
const ICON_RE = /^[\w.-]{1,80}\.(png|jpg|jpeg|svg|webp)$/i;
const BROWSERS = ['chrome', 'brave', 'edge', 'default'];
const MODES = ['kiosk', 'fullscreen', 'normal'];

function cleanUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error('URL no válida');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Solo se permiten URLs http(s)');
  return url.toString();
}

// Valida un acceso directo campo a campo; cualquier cosa desconocida se descarta.
export function sanitizeShortcut(input) {
  if (!input || typeof input !== 'object') throw new Error('Acceso directo no válido');
  const id = String(input.id || '').toLowerCase();
  if (!ID_RE.test(id)) throw new Error('El id solo puede tener letras minúsculas, números y guiones');
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('Falta el nombre');
  const out = {
    id,
    name,
    url: cleanUrl(input.url),
    color: COLOR_RE.test(input.color) ? input.color : '#d4a531',
    browser: BROWSERS.includes(input.browser) ? input.browser : 'chrome',
    mode: MODES.includes(input.mode) ? input.mode : 'kiosk',
    isolated: input.isolated !== false,
    closePrevious: input.closePrevious !== false,
  };
  if (input.profile && PROFILE_RE.test(input.profile)) out.profile = input.profile;
  if (input.icon && ICON_RE.test(input.icon)) out.icon = input.icon;
  return out;
}

let shortcuts = null;

export function getShortcuts() {
  if (!shortcuts) {
    const stored = readJson(SHORTCUTS_FILE);
    if (Array.isArray(stored)) {
      shortcuts = [];
      for (const item of stored) {
        try {
          shortcuts.push(sanitizeShortcut(item));
        } catch (err) {
          console.error(`Acceso directo ignorado (${item?.id}): ${err.message}`);
        }
      }
    } else {
      shortcuts = DEFAULT_SHORTCUTS.map(sanitizeShortcut);
      writeJson(SHORTCUTS_FILE, shortcuts);
    }
  }
  return shortcuts;
}

export function saveShortcuts(list) {
  if (!Array.isArray(list) || list.length > 60) throw new Error('Lista de accesos no válida');
  const clean = list.map(sanitizeShortcut);
  const ids = new Set(clean.map((s) => s.id));
  if (ids.size !== clean.length) throw new Error('Hay ids repetidos');
  writeJson(SHORTCUTS_FILE, clean);
  shortcuts = clean;
  return clean;
}

export function findShortcut(id) {
  return getShortcuts().find((s) => s.id === id) || null;
}

export { readJson, writeJson };
