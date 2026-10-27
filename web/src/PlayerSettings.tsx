import { useEffect, useRef, useState } from 'react';
import { MODE_LONG, type Mode, type Settings } from './api';
import { Select } from './Select';

const MODES = Object.keys(MODE_LONG) as Mode[];
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface Props {
  settings: Settings;
  mode: Mode;
  movable: boolean;
  onChange: (change: Partial<Settings>) => void;
  onMode: (mode: Mode) => void;
  onMovable: (value: boolean) => void;
}

/** Subtitle and playback settings, next to the video they affect. */
export function PlayerSettings({ settings, mode, movable, onChange, onMode, onMovable }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onClick);
    };
  }, [open]);

  return (
    <div className="psettings" ref={wrap}>
      <button className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Настройки плеера
      </button>

      {open && (
        <div className="psettings__panel" role="group" aria-label="Настройки плеера">
          <div className="psettings__row">
            <span className="psettings__label">Скорость</span>
            <span className="psettings__control">
              <Select
                label="Скорость"
                value={settings.rate}
                onChange={(rate) => onChange({ rate })}
                options={RATES.map((r) => ({ value: r, label: `${r}×` }))}
              />
            </span>
          </div>

          <div className="psettings__row psettings__row--stack">
            <span className="psettings__label">Субтитры</span>
            <span className="chips" role="group" aria-label="Режим субтитров">
              {MODES.map((m) => (
                <button
                  key={m}
                  className={m === mode ? 'chip chip--on' : 'chip'}
                  aria-pressed={m === mode}
                  onClick={() => onMode(m)}
                >
                  {MODE_LONG[m]}
                </button>
              ))}
            </span>
          </div>

          <label className="psettings__row">
            <span className="psettings__label">Размер</span>
            <span className="psettings__control">
              <input
                type="range"
                min={14}
                max={48}
                value={settings.size}
                onChange={(e) => onChange({ size: Number(e.target.value) })}
              />
              <output>{settings.size} px</output>
            </span>
          </label>

          <label className="psettings__row">
            <span className="psettings__label">По горизонтали</span>
            <span className="psettings__control">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.posX)}
                onChange={(e) => onChange({ posX: Number(e.target.value) })}
              />
              <output>{Math.round(settings.posX)}%</output>
            </span>
          </label>

          <label className="psettings__row">
            <span className="psettings__label">По вертикали</span>
            <span className="psettings__control">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.posY)}
                onChange={(e) => onChange({ posY: Number(e.target.value) })}
              />
              <output>{Math.round(settings.posY)}%</output>
            </span>
          </label>

          <div className="psettings__row">
            <span className="psettings__label">Двигать мышью</span>
            <span className="psettings__control">
              <button
                className={movable ? 'chip chip--on' : 'chip'}
                aria-pressed={movable}
                onClick={() => onMovable(!movable)}
              >
                {movable ? 'включено' : 'выключено'}
              </button>
            </span>
          </div>

          <label className="psettings__row">
            <span className="psettings__label">Предыдущая реплика</span>
            <span className="psettings__control">
              <input
                type="checkbox"
                checked={settings.showPrev}
                onChange={(e) => onChange({ showPrev: e.target.checked })}
              />
            </span>
          </label>

          <p className="psettings__hint">
            В фуллскрине диалоги открываются колонкой справа, видео не перекрывают.
          </p>
        </div>
      )}
    </div>
  );
}
