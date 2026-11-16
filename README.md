# inlineNotes

Расширение для Chrome (Manifest V3) для личных inline-комментариев к статьям: выделяешь текст → пишешь
заметку (до 256 символов) → на этой странице она показывается как подсветка с тултипом; в попапе —
список «имя + чекбокс» на каждую запись. Данные только локальные (`chrome.storage.local`), без сервера
и без сетевых запросов.

**Текущий статус:** агентный харнесс настроен; идёт реализация. Стадия 1 (инструментарий сборки) сделана:
`package.json`, `src/`, `tests/` на месте, `npm run build` собирает `dist/` как unpacked MV3-расширение
(попап и настройки на Angular, content-скрипт на Preact). Поведение продукта пока — заглушки.

## Как устроена работа

Пользователь общается **только с PM**. PM — это основная сессия pi, не субагент; `.pi/agents/project-manager.md`
— эталонное тело роли и определение фонового оркестратора.

Схема: `вопросы → декомпозиция (≤3 стадии × ≤3 задачи) → делегирование по имени роли → приёмка по артефакту и коду`.

Роли (`.pi/agents/`):

| Роль | Кто это | Чем занимается |
|---|---|---|
| `project-manager` | read-only + делегирование | вопросы, декомпозиция, брифы, state-файлы, приёмка, ретро |
| `extension-engineer` | полный доступ + bash | весь TypeScript: `src/core`, `src/content` (Preact), `src/popup`/`src/options` (Angular), `tests` |
| `code-reviewer` | read-only, git только на чтение | ревью каждого задачи, вердикт по AC спеки |

Скиллы (`.pi/skills/`): `chrome-mv3-extension-ts`, `requirements-spec`, `delivery-planning`, `code-review-checklist`.

Спецификации (`docs/specs/`, связаны в `docs/specs/INDEX.md`):

- `inline-comment-model.md` — модель данных, ключ страницы, лимиты, авторство, якоря, пересечения.
- `content-overlay-ui.md` — карточка выделения, подсветка через CSS Highlight API, тултип/редактор, попап.
- `code-review-flow.md` — обязательное ревью, вердикты, зелёные ворота.

Источник истины по проекту: `docs/project-profile.md` (стек, лимиты, команды, runtime-модель, `timeoutMs`).
Состояние задач: `docs/state/<task-id>.md`. Ретро: `docs/retro.md`.

## Команды

```bash
npm install                                      # зависимости: Angular (попап/настройки) + Preact (контент)
npm run build                                    # сборка unpacked-расширения в dist/ (manifest + 3 бандла)
npm test                                         # Vitest: чистые правила src/core + контракты слоёв
npm run typecheck                                # tsc --noEmit по трём tsconfig (контент, Angular, тесты)
node scripts/check-agent-config.mjs              # механическая проверка харнесса (0 ошибок обязательно)
node scripts/check-agent-config.mjs --strict     # предупреждения тоже считаются ошибками
node scripts/check-agent-config.mjs --json       # машиночитаемый отчёт
```

Ворота приёмки для задач реализации (включатся после появления `package.json`): `npm test`, `npm run build`,
`node scripts/check-agent-config.mjs`. Известно-падающей базы нет — всё должно быть зелёным. Команды ворот выполняет
`extension-engineer` и приводит вывод в отчёте; PM (без bash) проверяет наличие вывода, а при сомнениях просит
`code-reviewer` перегнать `node scripts/check-agent-config.mjs`.

Смоук-проверка ролей пройдена (все три): `docs/state/smoke-project-manager.md`, `docs/state/smoke-extension-engineer.md`,
`docs/state/smoke-code-reviewer.md` — роль получает ровно свой список инструментов, свои скиллы, чистый контекст,
модель сессии, thinking выключен.

Проверки харнесса внутри pi: `/subagents` (у всех ролей thinking выключен), `/subagents-models` (у всех роль тот же модель, что у сессии).

## Wiring

`.pi/settings.json`: `defaultThinkingLevel: "off"`, `skills: [".pi/skills"]`, `parallel.concurrency: 1`,
`compaction.reserveTokens: 8000`, `subagents.disableThinking/defaultThinking/maxThinking: "off"`,
`agentOverrides` 1:1 с ролями. Модель нигде не закреплена: все роли `model: inherit`.

Чтобы pi подхватил проектную конфигурацию, сессия должна принять доверие к проекту (project trust) —
иначе проектные роли из `.pi/agents/` и скиллы из `.pi/skills/` не загружаются.

`timeoutMs: 1800000` во всех ролях скопирован из `docs/project-profile.md` → Runtime Model. Менять его можно
только сначала в профиле, затем в ролях, в одном коммите, и после этого перегонять чекер.

## Дальше: план реализации

1. Спеки уже написаны — уточнить только открытые вопросы из профиля.
2. Слайс ядра: `src/core` (нормализация URL, лимиты, авторство, якоря, пересечения) + юнит-тесты.
3. Контент-скрипт: выделение, Preact-виджеты в shadow-хосте, `CSS.highlights` + `::highlight()`.
4. Popup/options на Angular: список записей, чекбокс на каждую, поле «Имя».
5. Сборка `dist/`, загрузка unpacked в `chrome://extensions`, проверка наблюдаемого поведения по спекам.
