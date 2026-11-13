// Token de acceso, emparejamiento con código temporal y filtros de red.
import crypto from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, readJson, writeJson } from './config.js';

const SECRET_FILE = path.join(DATA_DIR, 'secret.json');

let token = null;

// Token de 256 bits generado en el primer arranque. Es lo que guarda el iPad.
export function getToken() {
  if (token) return token;
  const stored = readJson(SECRET_FILE);
  if (stored?.token && stored.token.length >= 40) {
    token = stored.token;
  } else {
    token = crypto.randomBytes(32).toString('base64url');
    writeJson(SECRET_FILE, { token, createdAt: new Date().toISOString() });
  }
  return token;
}

// Cambia el token: todos los dispositivos emparejados tendrán que volver a emparejarse.
export function rotateToken() {
  token = crypto.randomBytes(32).toString('base64url');
  writeJson(SECRET_FILE, { token, createdAt: new Date().toISOString() });
  return token;
}

export function checkToken(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(getToken());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Código de emparejamiento ----------
// Código de 6 dígitos, válido 5 minutos y con 5 intentos. Solo se ve en el propio PC.

const PAIR_TTL_MS = 5 * 60 * 1000;
const PAIR_MAX_ATTEMPTS = 5;
let pairing = null;

export function newPairingCode() {
  pairing = {
    code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
    expires: Date.now() + PAIR_TTL_MS,
    attempts: 0,
  };
  return pairing;
}

export function redeemPairingCode(code) {
  if (!pairing || Date.now() > pairing.expires) {
    pairing = null;
    return { ok: false, error: 'No hay ningún código activo. Genera uno nuevo en el PC.' };
  }
  pairing.attempts += 1;
  const a = Buffer.from(String(code || '').padEnd(6).slice(0, 6));
  const b = Buffer.from(pairing.code);
  if (crypto.timingSafeEqual(a, b)) {
    pairing = null;
    return { ok: true, token: getToken() };
  }
  if (pairing.attempts >= PAIR_MAX_ATTEMPTS) {
    pairing = null;
    return { ok: false, error: 'Demasiados intentos. Genera un código nuevo en el PC.' };
  }
  return { ok: false, error: `Código incorrecto (quedan ${PAIR_MAX_ATTEMPTS - pairing.attempts} intentos)` };
}

// ---------- PIN fijo (opcional) ----------
// Si config/settings.json define pairingPin (6 caracteres o más), se empareja con él en lugar del
// código temporal. Es más fácil de adivinar que un código que cambia, así que además del bloqueo
// por IP hay un límite global: más de 30 fallos en una hora desactivan el PIN durante una hora.

export const PIN_MIN_LENGTH = 6;
const PIN_GLOBAL_LIMIT = 30;
const PIN_WINDOW_MS = 60 * 60 * 1000;
let fixedPin = null;
let pinFailures = [];
let pinDisabledUntil = 0;

export function configurePin(pin) {
  const value = typeof pin === 'string' ? pin.trim() : '';
  if (!value) {
    fixedPin = null;
    return 'off';
  }
  if (value.length < PIN_MIN_LENGTH) {
    fixedPin = null;
    return 'too-short';
  }
  fixedPin = value;
  return 'on';
}

export function usesFixedPin() {
  return fixedPin !== null;
}

export function pinIsNumeric() {
  return fixedPin !== null && /^\d+$/.test(fixedPin);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

export function redeemPin(candidate) {
  const now = Date.now();
  if (now < pinDisabledUntil) {
    const mins = Math.ceil((pinDisabledUntil - now) / 60000);
    return { ok: false, error: `Demasiados intentos fallidos. El PIN está bloqueado ${mins} min.` };
  }
  // Se comparan los hashes para que la comparación sea de longitud fija y en tiempo constante.
  if (crypto.timingSafeEqual(hash(candidate ?? ''), hash(fixedPin))) return { ok: true, token: getToken() };

  pinFailures = pinFailures.filter((t) => now - t < PIN_WINDOW_MS);
  pinFailures.push(now);
  if (pinFailures.length > PIN_GLOBAL_LIMIT) {
    pinDisabledUntil = now + PIN_WINDOW_MS;
    pinFailures = [];
    console.warn('Demasiados PIN incorrectos: el emparejamiento con PIN queda bloqueado una hora.');
  }
  return { ok: false, error: 'PIN incorrecto' };
}

// ---------- Red ----------

function normalizeIp(ip = '') {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isLoopback(ip) {
  const addr = normalizeIp(ip);
  return addr === '127.0.0.1' || addr === '::1';
}

// Solo se aceptan conexiones desde la propia máquina o desde rangos de red privada.
export function isLocalNetwork(ip) {
  const addr = normalizeIp(ip);
  if (isLoopback(addr)) return true;
  const m = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const lower = addr.toLowerCase();
  return lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
}

// ---------- Bloqueo por intentos fallidos ----------

const FAIL_LIMIT = 10;
const BLOCK_MS = 15 * 60 * 1000;
const failures = new Map();

export function isBlocked(ip) {
  const entry = failures.get(normalizeIp(ip));
  if (!entry) return false;
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) return true;
  if (entry.blockedUntil) failures.delete(normalizeIp(ip));
  return false;
}

export function registerFailure(ip) {
  const key = normalizeIp(ip);
  const entry = failures.get(key) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= FAIL_LIMIT) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    entry.count = 0;
    console.warn(`IP ${key} bloqueada 15 minutos por demasiados intentos fallidos`);
  }
  failures.set(key, entry);
}

export function clearFailures(ip) {
  failures.delete(normalizeIp(ip));
}
