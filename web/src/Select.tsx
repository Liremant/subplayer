import { useEffect, useId, useRef, useState } from 'react';

interface Props<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Accessible name — the visible label is rendered by the caller. */
  label: string;
  className?: string;
}

/**
 * A listbox styled with the app's tokens. A native `<select>` cannot be themed
 * beyond the closed state, so the menu itself is built here.
 */
export function Select<T extends string | number>({ value, options, onChange, label, className }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(options.findIndex((o) => o.value === value), 0));
  const wrap = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActive(Math.max(options.findIndex((o) => o.value === value), 0));
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(active);
    }
  };

  return (
    <div className={className ? `select ${className}` : 'select'} ref={wrap}>
      <button
        type="button"
        className="select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className="select__value">{selected?.label}</span>
        <svg className="select__chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ul className="select__list" role="listbox" id={listId} aria-label={label} tabIndex={-1}>
          {options.map((option, i) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={i === active ? 'select__option select__option--active' : 'select__option'}
                onPointerEnter={() => setActive(i)}
                onClick={() => commit(i)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <span className="select__check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
