import { forwardRef, useImperativeHandle, useRef } from 'react';

// Un <textarea> invisible recoge lo que se escribe con el teclado de iOS. Se compara el texto
// antes y después de cada cambio, así funcionan también el autocorrector y las sugerencias:
// lo borrado se envía como Retroceso y lo nuevo como texto.
const SENTINEL = '~'; // siempre hay algo que borrar, para que Retroceso funcione con el campo "vacío"

const SPECIAL_KEYS = {
  Escape: 'escape',
  Tab: 'tab',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Delete: 'delete',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
};

const KeyboardCapture = forwardRef(function KeyboardCapture({ send, onActiveChange }, ref) {
  const area = useRef(null);
  const prev = useRef(SENTINEL);

  const reset = () => {
    const el = area.current;
    el.value = SENTINEL;
    prev.current = SENTINEL;
    el.setSelectionRange(SENTINEL.length, SENTINEL.length);
  };

  useImperativeHandle(ref, () => ({
    // Debe llamarse dentro del gesto del usuario o iOS no saca el teclado.
    open() {
      reset();
      area.current.focus();
    },
    close() {
      area.current.blur();
    },
  }));

  const onInput = () => {
    const el = area.current;
    const before = prev.current;
    const now = el.value;
    let p = 0;
    while (p < before.length && p < now.length && before[p] === now[p]) p++;
    const removed = before.length - p;
    for (let i = 0; i < removed; i++) send({ type: 'key', name: 'backspace' });
    const added = now.slice(p);
    if (added) {
      // Los saltos de línea son Enter; el resto, texto.
      added.split(/(\n)/).forEach((part) => {
        if (part === '\n') send({ type: 'key', name: 'enter' });
        else if (part) send({ type: 'text', text: part });
      });
    }
    prev.current = now;
    if (!now.startsWith(SENTINEL) || now.length > 60 || now.includes('\n')) reset();
  };

  const onKeyDown = (e) => {
    const name = SPECIAL_KEYS[e.key];
    if (name) {
      e.preventDefault();
      send({ type: 'key', name });
    }
  };

  return (
    <textarea
      ref={area}
      className="kbd-capture"
      defaultValue={SENTINEL}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="send"
      aria-label="Teclado"
      onInput={onInput}
      onKeyDown={onKeyDown}
      onFocus={() => onActiveChange(true)}
      onBlur={() => onActiveChange(false)}
    />
  );
});

export default KeyboardCapture;
