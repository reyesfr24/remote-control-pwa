import { useState } from 'react';
import { Btn, Card, Icon, Modal } from './ui.jsx';

function initials(name) {
  const words = name.replace(/[+]/g, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function Tile({ shortcut, onOpen, busy }) {
  return (
    <button
      type="button"
      className={`tile ${busy ? 'busy' : ''}`}
      style={{ '--tile': shortcut.color }}
      onClick={() => onOpen(shortcut.id)}
    >
      <span className="tile-logo">
        {shortcut.icon ? <img src={`/icons/${shortcut.icon}`} alt="" draggable="false" /> : initials(shortcut.name)}
      </span>
      <span className="tile-name">{shortcut.name}</span>
    </button>
  );
}

export function ShortcutGrid({ shortcuts, send, onEdit, onOpened }) {
  const [busy, setBusy] = useState(null);
  const open = (id) => {
    send({ type: 'open', id });
    setBusy(id);
    setTimeout(() => setBusy(null), 1500);
    onOpened?.();
  };
  return (
    <Card
      title="Accesos directos"
      className="shortcuts"
      action={<Btn icon="edit" className="ghost round small" title="Editar accesos" onPress={onEdit} />}
    >
      <div className="tiles">
        {shortcuts.map((s) => (
          <Tile key={s.id} shortcut={s} onOpen={open} busy={busy === s.id} />
        ))}
      </div>
      <Btn icon="tv" label="Cerrar ventana de la tele" className="wide subtle" onPress={() => send({ type: 'browser.closeTv' })} />
    </Card>
  );
}

const EMPTY = { id: '', name: '', url: 'https://', color: '#d4a531', browser: 'chrome', mode: 'kiosk', isolated: true, closePrevious: true, profile: '', icon: '' };

function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function ShortcutForm({ initial, existingIds, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = (e) => {
    e.preventDefault();
    let id = form.id || slug(form.name);
    if (!initial.id) {
      let n = 2;
      const base = id;
      while (existingIds.includes(id)) id = `${base}-${n++}`;
    }
    try {
      const url = new URL(form.url);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      return setError('La URL debe empezar por https:// o http://');
    }
    if (!form.name.trim()) return setError('Ponle un nombre');
    const out = { ...form, id, name: form.name.trim() };
    if (!out.profile) delete out.profile;
    if (!out.icon) delete out.icon;
    onSave(out);
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Nombre
          <input value={form.name} onChange={set('name')} placeholder="Twitch" required />
        </label>
        <label className="narrow">
          Color
          <input type="color" value={form.color} onChange={set('color')} />
        </label>
      </div>
      <label>
        URL (portada o enlace concreto: un canal, un directo…)
        <input value={form.url} onChange={set('url')} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <div className="form-row">
        <label>
          Navegador
          <select value={form.browser} onChange={set('browser')}>
            <option value="chrome">Chrome</option>
            <option value="brave">Brave</option>
            <option value="edge">Edge</option>
            <option value="default">Navegador predeterminado</option>
          </select>
        </label>
        <label>
          Modo
          <select value={form.mode} onChange={set('mode')} disabled={form.browser === 'default'}>
            <option value="kiosk">Quiosco (sin barras, ideal para la tele)</option>
            <option value="fullscreen">Pantalla completa</option>
            <option value="normal">Ventana normal</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Perfil del navegador (opcional)
          <input value={form.profile || ''} onChange={set('profile')} placeholder="Default, Profile 1…" disabled={form.browser === 'default'} />
        </label>
        <label>
          Icono (opcional, fichero en config/icons)
          <input value={form.icon || ''} onChange={set('icon')} placeholder="twitch.png" autoCapitalize="off" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.isolated} onChange={set('isolated')} disabled={form.browser === 'default'} />
        Usar el navegador de la tele (perfil aparte: se puede cerrar sin tocar tu navegador normal)
      </label>
      <label className="check">
        <input type="checkbox" checked={form.closePrevious} onChange={set('closePrevious')} disabled={!form.isolated || form.browser === 'default'} />
        Cerrar lo anterior antes de abrir esto
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn subtle" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn primary">Guardar</button>
      </div>
    </form>
  );
}

export function ShortcutEditor({ shortcuts, send, onClose }) {
  const [list, setList] = useState(shortcuts);
  const [editing, setEditing] = useState(null); // índice o 'new'
  const [confirmDelete, setConfirmDelete] = useState(null);

  const commit = (next) => {
    setList(next);
    send({ type: 'shortcuts.save', list: next });
  };
  const moveItem = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const remove = (i) => {
    if (confirmDelete !== i) return setConfirmDelete(i);
    setConfirmDelete(null);
    commit(list.filter((_, k) => k !== i));
  };
  const save = (item) => {
    const next = editing === 'new' ? [...list, item] : list.map((s, k) => (k === editing ? item : s));
    commit(next);
    setEditing(null);
  };

  return (
    <Modal title={editing === null ? 'Accesos directos' : editing === 'new' ? 'Nuevo acceso' : 'Editar acceso'} onClose={onClose} wide>
      {editing === null ? (
        <>
          <ul className="edit-list">
            {list.map((s, i) => (
              <li key={s.id}>
                <span className="edit-swatch" style={{ background: s.color }}>{initials(s.name)}</span>
                <span className="edit-text">
                  <b>{s.name}</b>
                  <small>{s.url}</small>
                </span>
                <button type="button" className="btn ghost round small" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="Subir"><Icon name="up" /></button>
                <button type="button" className="btn ghost round small" onClick={() => moveItem(i, 1)} disabled={i === list.length - 1} aria-label="Bajar"><Icon name="down" /></button>
                <button type="button" className="btn ghost round small" onClick={() => setEditing(i)} aria-label="Editar"><Icon name="edit" /></button>
                <button type="button" className={`btn round small ${confirmDelete === i ? 'danger' : 'ghost'}`} onClick={() => remove(i)} aria-label="Eliminar">
                  {confirmDelete === i ? '¿Borrar?' : <Icon name="trash" />}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary wide" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Añadir acceso
          </button>
          <p className="note">
            Los cambios se guardan en el PC (config/shortcuts.json). En los servicios con cuenta (Movistar Plus+, Netflix…)
            inicia sesión una vez dentro de la ventana de la tele y se quedará guardada.
          </p>
        </>
      ) : (
        <ShortcutForm
          initial={editing === 'new' ? {} : list[editing]}
          existingIds={list.map((s) => s.id)}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </Modal>
  );
}
