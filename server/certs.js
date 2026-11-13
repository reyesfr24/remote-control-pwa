// Certificados HTTPS: una CA local propia (se instala una vez en el iPad) y un certificado
// de servidor firmado por ella que se regenera solo si cambia la IP del PC.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import forge from 'node-forge';
import { DATA_DIR } from './config.js';

const CERT_DIR = path.join(DATA_DIR, 'certs');
const CA_KEY = path.join(CERT_DIR, 'ca-key.pem');
const CA_CERT = path.join(CERT_DIR, 'ca-cert.pem');
const SERVER_KEY = path.join(CERT_DIR, 'server-key.pem');
const SERVER_CERT = path.join(CERT_DIR, 'server-cert.pem');

// Adaptadores virtuales (VPN, Hyper-V, VirtualBox…) que no son la red de casa.
const VIRTUAL_RE = /vethernet|virtualbox|vmware|tailscale|zerotier|wsl|hyper-v|vpn|loopback|bluetooth/i;

// IPs IPv4 del PC, con la de la red real (Wi-Fi/Ethernet) primero.
export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        const physical = !VIRTUAL_RE.test(name) && !iface.address.startsWith('192.168.56.');
        const score = (physical ? 2 : 0) + (/wi-?fi|wlan|ethernet/i.test(name) ? 1 : 0);
        out.push({ address: iface.address, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).map((i) => i.address);
}

function newKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' })),
    publicKey: forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' })),
  };
}

function serial() {
  // Número de serie positivo de 16 bytes.
  return '01' + crypto.randomBytes(15).toString('hex');
}

function createCa() {
  const keys = newKeyPair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000);
  const attrs = [
    { name: 'commonName', value: `Mando PC CA (${os.hostname()})` },
    { name: 'organizationName', value: 'Mando PC local' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  fs.writeFileSync(CA_KEY, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
  fs.writeFileSync(CA_CERT, forge.pki.certificateToPem(cert));
}

function createServerCert(ips, names) {
  const caKey = forge.pki.privateKeyFromPem(fs.readFileSync(CA_KEY, 'utf8'));
  const caCert = forge.pki.certificateFromPem(fs.readFileSync(CA_CERT, 'utf8'));
  const keys = newKeyPair();
  const cert = forge.pki.createCertificate();
  const host = os.hostname().toLowerCase();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  // iOS rechaza certificados de servidor con más de 825 días de validez.
  cert.validity.notAfter = new Date(Date.now() + 800 * 24 * 3600 * 1000);
  cert.setSubject([{ name: 'commonName', value: ips[0] || host }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: host },
        { type: 2, value: `${host}.local` },
        ...names.map((value) => ({ type: 2, value })),
        { type: 7, ip: '127.0.0.1' },
        ...ips.map((ip) => ({ type: 7, ip })),
      ],
    },
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  fs.writeFileSync(SERVER_KEY, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
  fs.writeFileSync(SERVER_CERT, forge.pki.certificateToPem(cert));
}

function serverCertCovers(ips, names) {
  try {
    const cert = forge.pki.certificateFromPem(fs.readFileSync(SERVER_CERT, 'utf8'));
    const san = cert.getExtension('subjectAltName');
    const covered = new Set((san?.altNames || []).map((n) => n.ip || n.value));
    const daysLeft = (cert.validity.notAfter - Date.now()) / (24 * 3600 * 1000);
    return daysLeft > 30 && [...ips, ...names].every((v) => covered.has(v));
  } catch {
    return false;
  }
}

// `names`: nombres extra que debe cubrir el certificado (p. ej. mando-pc.local).
export function ensureCertificates(names = []) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  if (!fs.existsSync(CA_KEY) || !fs.existsSync(CA_CERT)) {
    console.log('Generando la autoridad de certificación local…');
    createCa();
    fs.rmSync(SERVER_CERT, { force: true });
  }
  const ips = lanAddresses();
  if (!serverCertCovers(ips, names)) {
    console.log(`Generando certificado HTTPS para ${[...names, ...ips].join(', ') || 'localhost'}…`);
    createServerCert(ips, names);
  }
  return {
    key: fs.readFileSync(SERVER_KEY),
    cert: fs.readFileSync(SERVER_CERT),
    caPem: fs.readFileSync(CA_CERT, 'utf8'),
  };
}

// Versión DER del certificado raíz: es el formato que iOS ofrece instalar como perfil.
export function caDer(caPem) {
  const cert = forge.pki.certificateFromPem(caPem);
  return Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
}
