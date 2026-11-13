// Conexión con el PC: WebSocket autenticado con reconexión automática.
const TOKEN_KEY = 'mandopc.token';

export function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function pair(code) {
  const res = await fetch('/api/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del PC' }));
  if (!data.ok) throw new Error(data.error || 'No se pudo emparejar');
  return data.token;
}

export class Remote {
  constructor(token, onEvent) {
    this.token = token;
    this.onEvent = onEvent;
    this.ws = null;
    this.retry = 0;
    this.closed = false;
    this.pingTimer = null;
    this.connect();
    // Al volver a la app desde segundo plano, reconectar al momento.
    this.onVisible = () => {
      if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState > 1)) this.connect();
    };
    document.addEventListener('visibilitychange', this.onVisible);
  }

  connect() {
    if (this.closed) return;
    clearTimeout(this.reconnectTimer);
    this.onEvent({ type: 'conn', state: 'connecting' });
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.token }));

    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        this.retry = 0;
        this.onEvent({ type: 'conn', state: 'online' });
        this.startPing();
      }
      if (msg.type === 'pong') {
        this.onEvent({ type: 'latency', ms: Math.round(performance.now() - msg.t) });
        return;
      }
      this.onEvent(msg);
    };

    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      clearInterval(this.pingTimer);
      if (e.code === 4003) {
        this.onEvent({ type: 'conn', state: 'unauthorized' });
        return;
      }
      this.onEvent({ type: 'conn', state: 'offline' });
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  startPing() {
    clearInterval(this.pingTimer);
    const ping = () => this.send({ type: 'ping', t: performance.now() });
    ping();
    this.pingTimer = setInterval(ping, 5000);
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.ws?.close();
  }
}
