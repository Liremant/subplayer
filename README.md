# subplayer

Свой плеер для своих файлов: видео + двойные субтитры, панель реплик, поиск, сдвиг тайминга.

Один пользователь, один сервер, локальная сеть. Без регистрации, без базы данных, без
каталога с TMDB — только твои файлы и твои субтитры.

- **Двойные субтитры.** Оригинал и перевод одновременно, режимы `оба / оригинал / перевод / выкл`.
- **Сдвиг тайминга.** Подогнать чужие субтитры под свой релиз — главная фича.
- **Панель реплик.** Список всех реплик, клик → переход, активная подсвечена и держится в центре.
- **Поиск по субтитрам** с подсветкой и переходом к найденному.
- **Свободное положение субтитров** — размер и позиция в процентах от кадра, можно двигать мышью.
- **Фуллскрин с колонкой диалогов** справа, видео не перекрывается.
- **Каталог.** Карточки с обложками, фильмы и сериалы, прогресс, сортировка.
- **Обложки** — своя картинка в папке или поиск в TVmaze / iTunes.

**Как добавить свои файлы — [docs/ADDING-MEDIA.md](docs/ADDING-MEDIA.md).**

Требования и границы — в [SPEC.md](SPEC.md). Правила разработки — в [AGENTS.md](AGENTS.md).

![Каталог](docs/screenshots/catalog.png)

| | |
|---|---|
| ![Плеер с двойными субтитрами](docs/screenshots/player.png) | ![Фуллскрин: видео и колонка диалогов](docs/screenshots/fullscreen.png) |
| Плеер: обе строки, панель реплик, активная подсвечена | Фуллскрин: диалоги колонкой, видео не перекрыто |
| ![Страница сериала](docs/screenshots/series.png) | ![Поиск обложек](docs/screenshots/posters.png) |
| Сериал: «продолжить», эпизоды по сезонам | Обложка ищется по названию и скачивается |

---

## Что нужно поставить

| | Linux | macOS | Windows |
|---|---|---|---|
| Rust | [rustup](https://rustup.rs) | [rustup](https://rustup.rs) | [rustup](https://rustup.rs) + MSVC build tools |
| Node.js 20+ | репозиторий или [nodejs.org](https://nodejs.org) | [nodejs.org](https://nodejs.org) или `brew install node` | [nodejs.org](https://nodejs.org) |
| pnpm | `corepack enable pnpm` | `corepack enable pnpm` | `corepack enable pnpm` |
| ffmpeg | `sudo pacman -S ffmpeg` / `apt install ffmpeg` | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |

ffmpeg нужен **только** для импорта видео (`scripts/import.sh`) и демо-библиотеки.
Для запуска уже готовых `mp4` он не требуется.

---

## Билд

Порядок важен: бинарь читает `web/dist` с диска, а не носит фронт внутри себя.
Собрать фронт → собрать сервер.

### Linux

```sh
git clone <repo> subplayer && cd subplayer

cd web && pnpm install && pnpm build && cd ..
cargo build --release

./target/release/subplayer        # http://127.0.0.1:3000
```

### macOS

То же самое. Отдельно про Apple Silicon: целевая платформа определяется сама, ничего
дописывать не нужно.

```sh
git clone <repo> subplayer && cd subplayer

cd web && pnpm install && pnpm build && cd ..
cargo build --release

./target/release/subplayer
```

Если `cargo` не видит линкер — поставь Xcode Command Line Tools: `xcode-select --install`.

### Windows

Нужен **MSVC toolchain**, а не GNU: `rustup default stable-msvc`.
Если при `rustup` не выбраны C++ build tools — поставь «Build Tools for Visual Studio» с
компонентом «Desktop development with C++».

PowerShell:

```powershell
git clone <repo> subplayer; cd subplayer

cd web; pnpm install; pnpm build; cd ..
cargo build --release

.\target\release\subplayer.exe
```

PowerShell не выполняет `&&` в старых версиях — используй `;`, как выше, либо запускай из
Git Bash / WSL, где команды те же, что в Linux-блоке.

Пути в проекте строятся через `Path`, поэтому `\` и `/` работают одинаково. Если медиатека
лежит на другом диске — задай абсолютный путь в `SUBPLAYER_MEDIA`.

### Разработка (все ОС)

Два процесса вместо сборки: Vite отдаёт фронт с горячей заменой и проксирует `/api` и
`/media` на бэкенд.

```sh
cargo run                          # терминал 1: :3000
cd web && pnpm dev                 # терминал 2: :5173
```

Открывать `http://localhost:5173`.

---

## Настройка

| Переменная | По умолчанию | Что это |
|---|---|---|
| `SUBPLAYER_MEDIA` | `media` | корень медиатеки |
| `SUBPLAYER_DATA` | `data` | прогресс, настройки, обложки |
| `SUBPLAYER_DIST` | `web/dist` | собранный фронт |
| `SUBPLAYER_PORT` | `3000` | порт |

Сервис слушает **только `127.0.0.1`** — наружу не смотрит намеренно.

### Раскладка библиотеки

```
media/
  Breaking Bad/S02/E05/
    video.mp4        # h264 + aac, moov в начале файла
    subs.vtt         # оба языка, оригинал в <b>
    meta.json        # опционально
  Dune.2021.1080p/
    video.mp4
    subs.vtt
    poster.jpg       # опционально
```

Скан рекурсивный: любая папка с видео попадает в каталог, эпизоды сворачиваются в карточку
сериала по имени. `Dune.2021.1080p.BluRay.x264-GRP` разбирается сам: название, год, теги
отброшены. Подробно про имена, `meta.json`, обложки и перекодирование —
[docs/ADDING-MEDIA.md](docs/ADDING-MEDIA.md).

### Субтитры

Один файл на эпизод, в каждой реплике оба языка, оригинал помечен `<b>`:

```
1
00:00:01.000 --> 00:00:03.000
<b>I am the one who knocks</b>
Я тот, кто стучится
```

Склеить пару `srt` в такой файл:

```sh
python3 scripts/merge-subs.py original.srt translation.srt -o subs.vtt
```

Скрипт сам находит сдвиг и растяжение между релизами (`--no-warp`, если тайминги совпадают).

### Импорт готовой раздачи

```sh
./scripts/import.sh раздача.zip ~/Downloads/subs-ru ~/Downloads
```

Распаковывает по одному эпизоду, транскодирует в `mp4`, склеивает субтитры, кладёт
`meta.json`. Место нужно только под один эпизод за раз.

### Демо-библиотека

```sh
./scripts/demo.sh                  # ffmpeg: 3 коротких ролика с субтитрами
```

---

## Автозапуск (Linux)

```ini
# ~/.config/systemd/user/subplayer.service
[Unit]
Description=subplayer
After=network.target

[Service]
WorkingDirectory=%h/Projects/subplayer
ExecStart=%h/Projects/subplayer/target/release/subplayer
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now subplayer
journalctl --user -u subplayer -f
```

После пересборки — `systemctl --user restart subplayer`.

**Если `cargo run` падает с `AddrInUse`** — порт держит этот юнит. Он с `Restart=always`,
убивать процесс бесполезно: перезапускай через `systemctl`.

macOS: `launchd` (`~/Library/LaunchAgents`). Windows: Планировщик задач или NSSM.
Юнита в репозитории для них нет.

---

## Горячие клавиши

Работают на любой раскладке, включая русскую: клавиши различаются по физической позиции.

| | |
|---|---|
| `Space` / `K` | пауза |
| `←` `→` | ±5 с |
| `J` / `L` | ±10 с |
| `↑` `↓` | громкость |
| `0`–`9` | 10 %…90 % |
| `Home` / `End` | начало / конец |
| `M` | звук |
| `F` | фуллскрин |
| `I` | picture-in-picture |
| `C` | режим субтитров |
| `G` | двигать субтитры мышью |
| `[` `]` | сдвиг субтитров ∓0.5 с |
| `,` `.` | скорость |

---

## API

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/api/library` | `{ movies, series }`, у каждого эпизода свой прогресс |
| GET / PUT | `/api/settings` | глобальные настройки |
| POST | `/api/progress` | `{ id, t, dur, shift }` |
| GET | `/api/posters/search?kind=&q=` | поиск обложек |
| POST | `/api/posters` | скачать выбранную в `data/posters/` |
| GET | `/media/<path>` | файлы с `Range` |
| GET | `/posters/<file>` | скачанные обложки |

---

## Доступ с других устройств

Сервис слушает только loopback. Варианты — reverse proxy на хосте или mesh-VPN.
Авторизации внутри нет и не планируется: доступ даёт тот слой, что стоит спереди.

Если нужен проброс в контейнере — в `src/main.rs` адрес зашит как `127.0.0.1:{port}`;
понадобится переменная `SUBPLAYER_HOST`.

---

## Лицензия

[AGPL-3.0](LICENSE). Можно использовать, менять и распространять; если ставишь
модифицированную версию на сервер и даёшь к ней доступ другим — обязан открыть исходники.
Закрыть код и продать нельзя.
