import { useEffect, useRef, useState } from 'react';

/** Native color pickers can emit hundreds of events; defer expensive document mutations. */
export default function BufferedColorPicker({ value, label, onCommit }: {
  value: string;
  label: string;
  onCommit: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const lastCommitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valid = /^#[a-f\d]{6}$/i;

  useEffect(() => {
    latest.current = value;
    lastCommitted.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const finish = () => {
    clearTimeout(timer.current);
    const next = latest.current;
    if (next !== lastCommitted.current && valid.test(next)) {
      lastCommitted.current = next;
      onCommit(next);
    }
  };

  return <input type="color" aria-label={label} title={label}
    value={valid.test(draft) ? draft : '#ffffff'}
    onChange={event => {
      latest.current = event.target.value;
      setDraft(event.target.value);
      // Idle commit also works in native color pickers that don't emit blur until closed.
      clearTimeout(timer.current);
      timer.current = setTimeout(finish, 160);
    }}
    onBlur={finish}
    onPointerUp={finish}
  />;
}
