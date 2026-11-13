// Instala o quita el arranque automático al iniciar sesión en Windows.
// Crea un .vbs en la carpeta Inicio que lanza el servidor sin ventana (no hace falta ser administrador).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTUP = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const VBS = path.join(STARTUP, 'MandoPC.vbs');

const q = (s) => s.replace(/"/g, '""');

const action = process.argv[2];
if (action === 'install') {
  if (!fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))) {
    console.error('Primero compila la app con: npm run build');
    process.exit(1);
  }
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const cmd = `cmd /c ""${q(process.execPath)}" server\\index.js >> data\\server.log 2>&1"`;
  const script = [
    "' Mando PC: arranca el servidor en segundo plano al iniciar sesion.",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${q(ROOT)}"`,
    `sh.Run "${q(cmd)}", 0, False`,
    '',
  ].join('\r\n');
  fs.writeFileSync(VBS, script);
  console.log(`Arranque automático instalado: ${VBS}`);
  console.log('Se iniciará la próxima vez que inicies sesión. Para arrancarlo ya sin ventana, haz doble clic en ese fichero.');
  console.log(`Registro del servidor: ${path.join(ROOT, 'data', 'server.log')}`);
} else if (action === 'remove') {
  fs.rmSync(VBS, { force: true });
  console.log('Arranque automático eliminado. Si el servidor está en marcha, ciérralo desde el Administrador de tareas (node.exe).');
} else {
  console.log('Uso: node scripts/autostart.js install | remove');
}
