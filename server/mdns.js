// Anuncia un nombre fijo en la red (p. ej. mando-pc.local) para que el iPad no dependa de la IP,
// que el router puede cambiar en cada reinicio.
import makeMdns from 'multicast-dns';
import { lanAddresses } from './certs.js';

let mdns = null;
let currentIp = null;

function listen(hostname, ip) {
  mdns?.destroy();
  currentIp = ip;
  // Se escucha en la interfaz de la red de casa, no en las virtuales (Hyper-V, VPN…).
  mdns = makeMdns({ interface: ip, reuseAddr: true, loopback: true });
  mdns.on('error', (err) => console.error('[mdns]', err.message));
  mdns.on('query', (query) => {
    const asked = query.questions.some((q) => q.name.toLowerCase() === hostname && (q.type === 'A' || q.type === 'ANY'));
    if (!asked) return;
    mdns.respond({ answers: [{ name: hostname, type: 'A', ttl: 120, data: currentIp }] });
  });
}

export function startMdns(name) {
  const hostname = `${name}.local`.toLowerCase();
  const check = () => {
    const ip = lanAddresses()[0];
    if (ip && ip !== currentIp) listen(hostname, ip);
  };
  check();
  // Si el router cambia la IP con el servidor en marcha, se vuelve a anunciar con la nueva.
  setInterval(check, 60_000).unref();
  return hostname;
}
