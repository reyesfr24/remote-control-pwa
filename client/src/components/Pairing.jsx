import { useEffect, useState } from 'react';
import { pair } from '../remote.js';

// Dos modos según el servidor: PIN fijo de config/settings.json o código temporal de 6 cifras.
export default function Pairing({ onPaired, reason }) {
  const [info, setInfo] = useState({ mode: 'code', numeric: true, minLength: 6 });
  const [code, setCode] = useState('');
  const [error, setError] = useState(reason || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/pair-info')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  const isPin = info.mode === 'pin';
  const valid = isPin ? code.length >= info.minLength : code.length === 6;

  const onChange = (e) => {
    const value = e.target.value;
    if (!isPin) setCode(value.replace(/\D/g, '').slice(0, 6));
    else setCode(info.numeric ? value.replace(/\D/g, '').slice(0, 64) : value.slice(0, 64));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onPaired(await pair(code));
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pairing">
      <form className="pairing-card" onSubmit={submit}>
        <img src="/icon-192.png" alt="" width="72" height="72" />
        <h1>Emparejar con el PC</h1>
        <p>
          {isPin ? (
            <>Escribe el PIN definido en el PC (<code>config/settings.json</code>). Solo hace falta una vez.</>
          ) : (
            <>En el PC abre <code>http://localhost:8080/pair</code> y escribe aquí el código de 6 cifras. Solo hace falta una vez.</>
          )}
        </p>
        <input
          className="pin"
          type={isPin ? 'password' : 'text'}
          value={code}
          onChange={onChange}
          inputMode={info.numeric ? 'numeric' : 'text'}
          autoComplete={isPin ? 'current-password' : 'one-time-code'}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={isPin ? 'PIN' : '••••••'}
          autoFocus
        />
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary wide" disabled={!valid || busy}>
          {busy ? 'Comprobando…' : 'Emparejar'}
        </button>
      </form>
    </div>
  );
}
