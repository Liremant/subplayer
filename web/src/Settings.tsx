import { useEffect, useState } from 'react';
import { api, SORT_LABELS, type Settings, type Sort } from './api';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
import { navigate } from './router';
import { Select } from './Select';

/**
 * Only the settings that have no better home. Subtitle controls live in the player's
 * own settings panel, next to the video they affect.
 */
export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.settings()
      .then(setSettings)
      .catch((e: unknown) => setStatus(String(e)));
  }, []);

  const patch = (change: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...change } : s));

  const save = () => {
    if (!settings) return;
    setStatus('Сохраняю…');
    api.saveSettings(settings)
      .then((saved) => {
        setSettings(saved);
        setStatus('Сохранено');
      })
      .catch((e: unknown) => setStatus(String(e)));
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={() => navigate('/')}>
          ← каталог
        </button>
        <h1 className="topbar__brand">Настройки</h1>
        <span className="topbar__count" role="status">
          {status}
        </span>
      </header>

      {!settings && !status && <p className="muted">Загрузка…</p>}

      {settings && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <fieldset className="field">
            <legend>Каталог</legend>
            <label className="field__row" htmlFor="sort">
              <span className="field__label">Сортировка</span>
              <span className="field__control">
                <Select
                  label="Сортировка"
                  value={settings.sort}
                  onChange={(sort) => patch({ sort })}
                  options={(Object.keys(SORT_LABELS) as Sort[]).map((s) => ({ value: s, label: SORT_LABELS[s] }))}
                />
              </span>
            </label>
          </fieldset>

          <fieldset className="field">
            <legend>Плеер</legend>
            <label className="field__row" htmlFor="rate">
              <span className="field__label">Скорость по умолчанию</span>
              <span className="field__control">
                <Select
                  label="Скорость по умолчанию"
                  value={settings.rate}
                  onChange={(rate) => patch({ rate })}
                  options={RATES.map((r) => ({ value: r, label: `${r}×` }))}
                />
              </span>
            </label>
          </fieldset>

          <p className="muted form__note">
            Субтитры — режим, размер, позиция, сдвиг — настраиваются в самом плеере, в панели «Настройки плеера».
          </p>

          <div className="form__actions">
            <button className="primary" type="submit">
              Сохранить
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
