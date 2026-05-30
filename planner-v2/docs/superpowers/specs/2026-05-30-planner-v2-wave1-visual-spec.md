<!-- Сгенерировано designer-first Workflow (8 агентов, адверсариальное ревью). Источник истины токенов — theme.css после токен-патча; HEX в таблицах справочные. -->

# Визуал-спека волны 1 — planner-v2

Тёмный onyx + ember. Документ — закон для frontend: точные значения по ролям DESIGN.md, без догадок. Маппинг приоритета: P1=high=Signal Red, P2=medium=Amber, P3=low=Ember-кант, P4=none=без канта.

> **Важно про источник истины токенов (фикс ревью, blocker):** значения цвета берутся из `theme.css`, НЕ из HEX в таблице ниже. Таблица — справочная карта ролей. Волна 1 вносит точечный токен-патч (см. «Токен-патч»), всё остальное не трогает. Если spec-HEX и `theme.css` разойдутся — закон = `theme.css` после патча.

---

## Токен-патч `:root` (выполнить первым — иначе все ссылки на роли врут)

Текущий `theme.css` расходится с ролями DESIGN §2. Приводим три токена к канону Onyx/Smoke/Slate; остальное не трогаем.

```css
:root {
  --bg: #0F0F11;          /* было var(--tg-theme-bg-color,#08080a) → фиксируем Onyx, не наследуем tg-фон */
  --surface: #1A1B1F;     /* было #161619 → Smoke */
  --surface-2: #242529;   /* было #1f1f23 → Slate */
  /* --text/--text-muted/--accent/--accent-soft/--danger/--warning/--border — без изменений, уже каноничны */
}
```

- **`--bg` решение:** фиксируем `#0F0F11` вместо `var(--tg-theme-bg-color,#08080a)`. Причина: фолбэк `#08080a` — де-факто near-black, а tg-inherit отдаёт фон на откуп клиенту Telegram (нарушает §2 «никогда не #000000» и контроль над холстом). Onyx `#0F0F11` — канон DESIGN. **Если продукт сознательно хочет наследовать тему Telegram — это должно быть явным решением CEO (см. design-debt), а не молчаливый фолбэк в near-black.** Дефолт волны 1: фиксированный Onyx.
- Патч `--surface`/`--surface-2` сдвигает ВСЕ поверхности приложения (карточки, строки, чипы, таб-бар) на +неск. пунктов яркости. Это глобальное, но безопасное изменение (роли те же, ближе к DESIGN). Визуально проверить, что инпуты (`--surface-2`) и карточки (`--surface`) сохраняют различимость на новом Onyx.

### Цвета по ролям (справочная карта — значения из токенов выше)
| Роль | Токен | HEX (после патча) | Где |
|---|---|---|---|
| Canvas | `--bg` | `#0F0F11` Onyx | фон всех экранов |
| Surface | `--surface` | `#1A1B1F` Smoke | карточки, строки, блоки, таб-бар |
| Surface-2 | `--surface-2` | `#242529` Slate | active/pressed строк, чипы, lifted, фон блока без проекта |
| Текст | `--text` | `#F4F4F5` Bone | заголовки, названия |
| Мета | `--text-muted` | `#8A8B91` Steel | дата, счётчики, время, неактивные иконки, section-label |
| Акцент | `--accent` | `#EE8A3C` Ember | active-строка, FAB, badge, линия «сейчас», чекбокс-done, P3-кант |
| Ember Soft | `--accent-soft` | `rgba(238,138,60,0.16)` | фон активной строки |
| High | `--danger` | `#FF5C5C` Signal Red | приоритет P1 (кант) |
| Medium | `--warning` | `#FFB02E` Amber | приоритет P2 (кант) |
| Hairline | `--border` | `rgba(255,255,255,0.07)` | разделители, линии часов, верх таб-бара |

**Правило 1 акцента (§2):** Ember только на активном/действенном элементе. Неактивные иконки навигации и смарт-строк — Steel. Это требует scope-фикса `.drawer-ico` (см. нарушения).

### Типографика (роли строго по DESIGN §3 — фикс ревью, major)
DESIGN §3 фиксирует **заголовок экрана = 22px/700**. Текущий `theme.css` `.screen h1` = `26px/700`. **Приводим h1 к 22px/700** во всех поверхностях (Today/Lists/Tracking). Это правка `theme.css`, не отклонение.

```css
.screen h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; margin: 0 0 var(--s2); }
```

- Заголовки экранов: Geist **22/700**, ls −0.4, Bone.
- Названия (строки, блоки): Geist **16/500**, Bone (§3 «строка 16px/500»). Исключение — `.bt` блока таймлайна 14/600 (компактный таймлайн, см. ниже).
- Мета (дата/время/счётчики): Geist Mono. **Единый размер роли «мета» = 13px** (DESIGN §4). Зафиксированные отклонения от 13px (каждое — осознанное, как radius):
  - `.cal-hourlabel` и `.cal-block .bm` (таймлайн) = **11px** — компактный плотный таймлайн, осознанное исключение. **Гарантия §3 «min touch text 14»:** 11px-текст в `.bm`/`.cal-hourlabel` НИКОГДА не является самостоятельной тач-целью — тап ловит весь блок/ряд ≥44px; текст внутри — пассивная подпись.
  - `.today-date` / `.drawer-count` = **14px** (уже в theme; чуть крупнее для читаемости даты и счётчиков на полном экране — терпимо, в пределах §3 min-14).
  - `.today-summary` = **13px** (канон роли).

### Spacing-токены (DESIGN §5: экран 16, gap строк 8, группы 16–24)
- `--s1`=4, `--s2`=8, `--s3`=12, `--s4`=16, `--s5`=20, `--s6`=24 (как в theme).
- Экран: `.screen` padding `20 / 16 / 24` (top/side/bottom) — как есть.
- Gap между строками списка: `--s2` (8px).
- **Межгрупповой ритм (фикс ревью, minor — унифицирован): между всеми соседними группами = 20px** (`--s5`). hero `mb 20`, inbox `mb 20`, секции — `margin 20`. **Исключение — единственный задокументированный скачок: section-label «Без времени» = `24px` сверху** (`--s6`), потому что «Без времени» — смена контекста (таймлайн → плоский список), а не очередная карточка. Это намеренная отбивка, не разнобой.
- `.drawer-sep` (разделитель секций Смарт/Проекты в Lists): вертикальный margin = **`--s4` (16px)** — нижняя граница §5 «между группами 16–24». **Фикс ревью (minor):** было `--s3`=12px (ниже диапазона §5), поднято до 16px.
- Padding-bottom под таб-бар: `calc(var(--tab-h) + env(safe-area-inset-bottom))`, `--tab-h`=72px. Базово даёт `.app`; экраны с обнулённым side-padding (Today, Lists) задают bottom явно.

### Единый паттерн строк/карточек
- **entry-card / task-row / cal-block / drawer-row** — поверхность `--surface`, не `#000`, не glow.
- **Радиус:** контентные карточки и task-row = 16px (`--radius`, фактический theme). cal-block = 10px (компактный таймлайн-блок — осознанное исключение). **Расхождение с DESIGN §4 (radius 12 / checkbox 22): волна 1 НЕ ломает текущий theme (16/24), фиксируется как намеренное отклонение — см. нарушения + design-debt тикет.**
- **Тач:** все интерактивные строки/кнопки ≥44px. task-row/entry-card min-height 60px; drawer-row на full-screen Lists 52px; tree-btn hit-area фиксится до 44px.
- **Приоритет = левый inset-кант 3px:** P1 Signal Red / P2 Amber / P3 Ember / P4 нет. **Единый источник приоритета — `Task.priority` (`"none"|"low"|"medium"|"high"`, подтверждено в `types.ts`).** task-row через `.prio-*` (box-shadow inset), cal-block через `border-left:3px` инлайн по роли. **Один маппинг high→Red / medium→Amber / low→Ember / none→нет — и в TaskItem, и в DayTimeline** (иначе untimed-через-TaskItem и таймлайн рассинхронятся).
  - **Внимание (конфликт в текущем TaskItem):** `TaskItem` сейчас вешает И класс `.prio-*`, И инлайн `borderLeft:3px solid {color}` при переданном `color` — инлайн-бордер визуально перекрывает приоритетный box-shadow. **Правило волны 1:** в Today untimed приоритет важнее цвета проекта — `TaskItem` должен показывать кант приоритета, если `priority !== "none"`, иначе кант цвета проекта. Frontend: НЕ передавать `color` в TaskItem когда `priority !== "none"`, ИЛИ свести к одному канту в самом TaskItem. Цель — task-row и cal-block читаются одинаково.
- **Идентичность проекта = цвет (точка/тинт/кант), НЕ emoji.** В таймлайне фон-тинт = цвет проекта (`${color}22`), кант = приоритет (если задан), иначе цвет проекта, иначе Ember. В строках — цветная точка 6px вместо emoji-иконки.
- **Счётчики/время/дата/числа = Geist Mono** (`--font-mono`, `font-feature-settings:"tnum"`). Названия = Geist 16/500. Заголовки = Geist 22/700, ls −0.4px.

### Motion (§6: 120–160ms, ease/spring, только transform/opacity)
- Нажатие строки навигации (drawer-row, cal-hour): фон → Slate, 120ms. Без scale.
- Нажатие карточки/блока/кнопки (entry-card, task-row, cal-block, FAB): `transform: scale(0.98–0.99)` (FAB 0.94), 140ms ease.
- Чекбокс done: фон/border 140ms, галочка мгновенно (opacity).
- Таб active: `color` 140ms ease.
- Chevron раскрытия дерева: rotate 90°, 150ms ease (подрезано с 180).
- Линия «сейчас»: статична, без пульсации/glow (поминутный пересчёт top — мгновенный, без transition, см. Поверхность 4).
- Скелетон shimmer 1.2s — единственный разрешённый цикл (только на загрузке).
- **Запрещено:** linear, анимация top/left/height/width, вечные циклы, glow, авто-скролл-прыжки на Today.
- Staggered-fade появления списков — опционально, только transform/opacity, только на mount/смену дня. По умолчанию в волне 1 НЕ вводим.

### Иконки (§4/§7: SVG, без emoji в UI)
- Nav-иконки (таб-бар) 24×24, паттерн `P={active?:boolean}` + `stroke(active)` (→ `--accent` при active, иначе `currentColor`), constant `strokeWidth="2"`. Active = смена ЦВЕТА, НЕ толщины (единообразие набора). **Фикс ревью: НЕ `strokeWidth={active?2.2:1.8}` из черновика плана — это рассинхрон с IcoToday/Calendar/Goals (constant 2). Перевести новые иконки на color-swap при width 2.**
- Inline-мета-иконки (таймлайн `.bm`, chevron-строки) — через хелпер `sv()`, `strokeWidth 1.8–1.9`, размер задаётся контекстом (12px в `.bm`, ~14px в chev).
- **Новые иконки волны 1:** `IcoLists`, `IcoTracking` (nav, 24, паттерн `stroke(active)`/width 2); `IcoChevron` (chev строк); `IcoRepeatMicro`/`IcoBellMicro` (таймлайн `.bm`, 12); `IcoPin` (pin-маркер проектов, ~14).

### Скелетоны (§4: не спиннеры)
- `.skeleton` + `@keyframes shimmer` (1.2s) повторяет размеры реального элемента.
- Today: summary-строка ~120×14, untimed 2–3 блока 60px radius16 gap8. Hero/rail рендерятся сразу (детерминированы), не скелетонятся.
- Lists: 3–4 строки 52px radius12 (`.lists-skeleton-row`). Смарт-строки рендерятся сразу.
- Timeline: rail сразу, блоки доезжают (loading-флаг — опционально, по умолчанию НЕ вводим).
- Tracking/таб-бар/FAB: нет загрузки → нет скелетонов и спиннеров.
- **Никаких круглых спиннеров нигде.**

---

## Изменение навигационной модели (новый раздел — фикс ревью, major)

Волна 1 — это не «+2 иконки», а перестройка 5-табовой IA. Спека фиксирует переход явно, чтобы frontend не получил два конкурирующих входа в списки.

**Было (текущий App.tsx):** табы `today / calendar / tasks / goals / projects`, где
- `tasks` = смарт-лист «Все» (единственный явный вход во «Все задачи»),
- `projects` НЕ открывает экран, а вызывает `openDrawer()` — выезжающую панель Drawer,
- App-корень слушает свайп `dx>60 && dx>dy*1.5 → openDrawer()` (горизонтальный свайп слева открывает Drawer).

**Стало (волна 1):** табы `today / calendar / lists / goals / tracking`.
- Таб `tasks` (Все) **удалён** — «Все задачи» теперь = первая смарт-строка внутри Lists (это **единственный** вход во «Все», подсвечена по дефолту).
- Таб `projects`+Drawer **заменён** на таб `lists` (полноэкранный Lists: смарт-вью + дерево).
- Добавлен таб `tracking` (плейсхолдер).

**Судьба swipe-Drawer и утверждения «Drawer жив» (разрешение противоречия ревью):**
- **Дефолт волны 1: swipe-открытие Drawer на App-корне УБИРАЕТСЯ** (снять `openDrawer()` из touch-хендлера App). Причина: при едином скролле Today горизонтальный детектор `dx>60` конфликтует с вертикальным панорамированием ленты 1344px и pull-to-close Telegram (см. Поверхность 1). Держать второй (скрытый) вход в списки через свайп при наличии полноэкранного таба Lists — это два конкурирующих способа открыть одно и то же → удаляем.
- **Drawer-компонент физически НЕ удаляем** (файл остаётся, мёртвый импорт из App убирается). Утверждение черновика «swipe-quick-switch жив, zero-risk» **снимается** — quick-switch свайпом в волне 1 нет. `.lists`-скоуп CSS не трогает `.drawer-*` правила (Drawer-стили живы для возможного возврата в будущей волне), но это про CSS-изоляцию, не про живой жест.
- **`ListView.onMenu`** перепроводится на «назад к Lists» (`setViewing(null)`) — см. Lists, навигация назад.

Итог: ровно один вход в каждый список (таб Lists → строка → ListView), без скрытых дублей.

---

## Поверхность 1 — Экран «Сегодня» (Today)

Файл: `frontend/src/screens/Today.tsx`. Зависит от `DayTimeline.tsx` (НОВЫЙ, см. Поверхность 4), `TaskItem.tsx`, `theme.css`, `icons.tsx`.

### Ключевое решение layout: ЕДИНЫЙ скролл всего экрана
НЕ вложенный скролл таймлайна. Палец тянет всю ленту (hero → inbox → timeline → untimed) как один поток — паттерн TickTick/Things «Today». Отказ от планового `height:100% + DayTimeline flex:1` (два вложенных скролла = scroll-trap в Telegram WebView, конфликт с pull-to-close).

Корень: `<div className="screen today">`. Side-padding 0 на корне (таймлайн full-bleed), bottom-padding явный под таб-бар. Текстовые блоки (hero/inbox/untimed) отбиваются внутренним враппером `.today-pad` (16px).

**Скролл-контейнер и конфликт жестов (фикс ревью, major):**
- **Скролл-порт = `.app`** (он несёт `min-height:100dvh` + bottom-padding), НЕ `<body>`. Холст таймлайна 1344px живёт в общем потоке `.app`; `.daytimeline--static` снимает `overflow`/`flex` с `.cal-scroll`, под-скролла нет. FAB/tabbar остаются `position:fixed` — на скролл-порт не влияют.
- **App-swipe-хендлер на Today ОТКЛЮЧЁН** (см. «Изменение навигационной модели»: `openDrawer` по свайпу удалён глобально). Это снимает конфликт горизонтального `dx>60`-детектора с вертикальным панорамированием ленты и с pull-to-close Telegram у верхней кромки (hero).
- **Обязательная проверка (QA, Поверхность 7-чеклист):** одной рукой проскроллить Today от hero (верх) до последней untimed-задачи (низ) в Telegram WebView — лента тянется как один поток, pull-to-close у верха не залипает, горизонтальных перехватов нет.

**Цена решения:** теряем авто-скролл к текущему часу (`autoScroll={false}`). Закрываем сознательным отказом — экран открывается с hero вверху, маркер «сейчас» виден при скролле.

### Структура (сверху вниз)
1. **HERO** `.screen-hero` (mb 20):
   - `<h1>Сегодня</h1>` — Geist **22/700**, ls −0.4, Bone.
   - `.today-date` — `FMT.format(new Date())` («суббота, 30 мая»), Geist Mono 14, Steel, `text-transform:capitalize`, mt 2px.
   - **`.today-summary`** — «{n} задач · {done} закрыто», Geist Mono **13**, Steel, mt `--s1`. Разделитель — middot `·` с пробелами (НЕ emoji). Числа НЕ склоняем в волне 1.
   - **Фикс ревью (minor — двойная пустота): при `tasks.length === 0` summary-строку НЕ рендерить.** Носитель пустоты — один (Empty ниже), hero не дублирует «0 задач · 0 закрыто». При N>0 — показываем.
2. **INBOX** `.entry-card` (surface, radius 16, min-h 60, padding 16), mb 20:
   - lead = `<IcoInbox/>` 24px Ember (НЕ текст «In»).
   - label `.grow` «Разобрать Inbox» — 16/500 Bone.
   - count `.count` — ember-кружок, Geist Mono 13/700, белый (только если `inboxCount>0`).
   - chev = `<IcoChevron/>` SVG 18px Steel (НЕ текст «›»).
   - При `inboxCount===0` карточку показываем без бейджа (affordance входа сохраняется).
3. **TIMELINE** `<DayTimeline isToday autoScroll={false} .../>`:
   - Модификатор `.daytimeline--static` снимает `overflow-y:auto` и `flex:1` с `.cal-scroll`.
   - Естественная высота 24×56=1344px в общем потоке. Full-bleed (rail-инсет 52px слева). Side-padding `.screen` НЕ режет rail (корень `today` имеет side-padding 0).
   - Внутри блоков: emoji 🔁/⏰ → SVG `IcoRepeatMicro`/`IcoBellMicro` 12px; `proj.icon` emoji → убрать. Кант = приоритет. Детали — Поверхность 4.
4. **UNTIMED** (только `untimed.length>0`), в `.today-pad`:
   - `.section-label` «Без времени» — 12/600 uppercase, ls 0.6, Steel, margin `24/0/12` (намеренная отбивка контекста, см. spacing).
   - `.list` (gap `--s2`=8).
   - `<TaskItem task onToggle ... />` каждая. **Кант = приоритет** (high/medium/low), P4 без канта. Если приоритет none и есть проект — кант = цвет проекта (см. правило конфликта TaskItem выше). Источник приоритета — `task.priority`, тот же, что в таймлайне.
   - Пуст → секция не рендерится (нет пустого label).
5. **Хвост:** `.app` padding-bottom 72px + safe-area; последняя задача не под таб-баром.

### Состояния
- **empty (пустой день):** hero БЕЗ summary-строки (только h1 + дата) + Inbox + rail (валиден сам по себе, тап = создание) + `<Empty>` без кнопки «План на день пуст. Тап по часу или + добавит задачу.» **FAB присутствует** (today входит в `today|lists|calendar` видимости FAB), поэтому ссылка Empty на «+» корректна. Голый rail НЕ скрываем.
- **loading:** hero+date сразу (детерминированы); summary — skeleton ~120×14; rail сразу; untimed — 2–3 skeleton 60px. Без спиннера.
- **active:** полная лента. Тап чекбокса → haptic light → patchTask → load(). Тап часа → onTapHour → композер. Тап Inbox → onInbox.
- **done (всё закрыто):** summary «{n} задач · {n} закрыто», блоки/TaskItem в done-стиле. БЕЗ поздравлений/конфетти (волна 3). **FAB виден.**
- **error:** оставить последний успешный стейт; если данных не было — `<Empty>` «Не удалось загрузить. Потяните, чтобы обновить.» БЕЗ raw-error (убрать `Ошибка: {err}` из старого Today). **FAB виден** (Empty-текст «+ добавит задачу» ссылается на реально присутствующую кнопку).

> **Фикс ревью (minor — FAB-видимость во всех состояниях Today):** FAB присутствует в empty/done/error Today, а не только в active. Правило видимости (`today|lists|calendar && !viewing`) от состояния данных не зависит — значит Empty-affordance «+» всегда валиден.

### CSS-классы
**Reuse как есть:** `.screen`, `.screen-hero`, `.screen h1` (после правки 22px), `.section-label`, `.muted`, `.entry-card` (+`.lead/.count/.chev/:active`), `.list`, `.task-row`/`.prio-*`, `.cal-*`, `.skeleton`, `.card`, `.app` padding-bottom.

**Добавить (theme.css):**
```css
.screen.today { padding-left: 0; padding-right: 0; }
.today-pad { padding-left: var(--s4); padding-right: var(--s4); }
.screen-hero .date.today-date { text-transform: capitalize; } /* или применить к .today-date */
.today-summary {
  font-family: var(--font-mono); font-feature-settings: "tnum";
  color: var(--text-muted); font-size: 13px; margin-top: var(--s1);
}
.daytimeline--static .cal-scroll,
.daytimeline--static.cal-scroll { overflow: visible; flex: none; }
.cal-block { transition: transform 140ms ease, opacity 140ms ease; }
.cal-block:active { transform: scale(0.99); opacity: 0.9; }
.cal-block .bt .pdot {
  display:inline-block; width:6px; height:6px; border-radius:50%;
  margin-right:6px; vertical-align:middle; flex:0 0 auto;
}
.cal-block .bm svg { width:12px; height:12px; vertical-align:middle; margin-left:6px; }
```
**Изменить:** `.entry-card .chev` под SVG: `display:inline-flex; align-items:center;` + `.entry-card .chev svg{width:18px;height:18px}`.
**НЕ переиспользовать:** `.drawer-*` (для Lists), плановый flex-height layout (заменён единым скроллом).

### Новые иконки
- `IcoChevron = () => sv(<path d="M9 6l6 6-6 6"/>)` — 24-бокс, stroke currentColor 1.9, для `.chev` (цвет Steel через родителя). Заменяет «›».
- `IcoRepeatMicro`/`IcoBellMicro` — 12px, см. Поверхность 4.

---

## Поверхность 2 — Экран «Списки» (Lists)

Полноэкранный таб (3-й из 5), `.screen` на Onyx. НЕ выезжающая панель Drawer (Drawer как вход удалён — см. «Изменение навигационной модели»).

### Ключевое решение: scope-namespace `.lists`
Классы `.drawer-*` рассчитаны на узкую панель (84%/max-360px). На полном экране дают слишком узкую плотность, прилипший счётчик, баннер-active. Решение: модификатор `.lists` на корне `.screen` ПЕРЕОПРЕДЕЛЯЕТ только нужное (плотность, отступы, цвет иконок), правила скоупятся через `.lists .drawer-row` — CSS-изоляция от Drawer-стилей (на случай возврата Drawer в будущей волне).

### Структура (один документный скролл)
Корень `<div className="screen lists">`: side-padding 0 (отступы уходят внутрь строк full-bleed), top `--s5`, bottom `calc(var(--tab-h) + env(safe-area-inset-bottom) + var(--s4))` — критично, чтобы «+ Проект» и хвост дерева не ушли под таб-бар.

1. **Hero** `.screen-hero` > `<h1>Списки</h1>` (**22/700** Bone). Горизонтальный отступ через `.lists .screen-hero{padding:0 var(--s4)}`. Без подзаголовка/даты.
2. **Секция «Смарт-списки»** `.drawer-section` (uppercase 12/600 Steel, ls 0.6). 6 строк `.drawer-row` в порядке: Все / Сегодня / Завтра / Следующие 7 дней / Входящие / План на неделю. **«Все» — единственный вход во «Все задачи» (таб `tasks` удалён), подсвечена по дефолту.** Строка = `[SVG 22–24px Steel] [label Geist 16/500 Bone] [grow] [count Geist Mono 14 Steel, только >0]`. Иконки: `IcoAll, IcoTodaySmall, IcoTomorrow, IcoNext7, IcoInbox, IcoWeekPlan`.
3. **Разделитель** `.drawer-sep` (1px Hairline, inset 16px), **вертикальный margin `--s4` (16px)** на `.lists` (фикс ревью §5).
4. **Секция «Проекты»** `.drawer-section` + `<ProjectTree/>`. Строки `.drawer-row.tree-row`, `paddingLeft:16+depth*22` (INDENT инлайн — НЕ трогать; depth0=16px совпадает со смарт-строками). Строка проекта = `[цвет-точка/IcoDot] [название (+pin-маркер IcoPin)] [count subtree] [chevron-кнопка если есть дети] [меню-кнопка IcoMore]`. Active = `.drawer-row.active`. Drag: `.tree-row.lifted` (Slate, radius12, shadow, translate3d+scale1.02, haptic medium).
5. **Строка «+ Проект»** `.drawer-row.drawer-add` — `IcoPlus` + «Проект», иконка/label Steel Muted (вторичное действие, НЕ Ember).

### Плотность строк (переопределение)
`.lists .drawer-row { min-height:52px; padding:14px var(--s4); }` — тач ≥44px, density-6. Gap внутри строки `--s3` (12px) — как есть.

### Два tree-btn в строке проекта (фикс ревью, minor — коллизия хит-зон)
Строка проекта содержит ДВЕ кнопки `.tree-btn` (chevron-toggle + меню IcoMore), обе фиксятся до 44×44 хит-зоны. На узкой колонке + при глубокой вложенности (`paddingLeft:16+depth*22`) две 44px-зоны рядом могут перекрыться и съесть тап-по-строке (drill).
**Правило:**
- Обе `.tree-btn` прижаты к ПРАВОМУ краю строки (`flex:0 0 auto`, в конце flex-ряда), визуальный глиф 18px центрирован в 44px hit-area.
- Между ними gap ≥4px (не перекрываются хит-зонами).
- Центр строки (точка + label + count, `.drawer-label{flex:1}`) остаётся тач-целью drill — кнопки не растягиваются на всю строку.
- На максимальной глубине дерева проверить, что под label остаётся ≥ ~40% ширины (иначе обрезается ellipsis, что допустимо, но имя должно читаться).

### Состояния
- **loading:** смарт-строки + иконки сразу (не зависят от сети), счётчики отсутствуют до прихода (без скелетона на цифре). Дерево: 3–4 `.lists-skeleton-row` 52px radius12. **Рекомендация: добавить `loading` boolean в Lists.tsx** (план грузит молча → проекты «допрыгивают», FOUC) — небольшое отклонение от Task 4, рекомендуется.
- **empty (нет проектов):** строка «+ Проект» сама = призыв; опц. muted-подпись «Пока нет проектов» (Steel 14, padding 8/16) над ней. Дефолт — только «+ Проект». НЕ центр-Empty (смарт-строки сверху делают центр неуместным).
- **active:** одна строка active (смарт XOR проект). Дефолт «Все» подсвечена до первого drill. Active = Ember Soft фон + Ember иконка/текст.
- **pressed:** фон Slate (`--surface-2`), 120ms. Без scale на навигационных строках.
- **drag:** `.tree-row.lifted`, только transform/opacity.
- **long-press/меню:** IcoMore/long-press → ProjectMenu. Триггер-кнопка `.tree-btn` тач ≥44px (фикс).
- **error:** тихий деградейд (строки без счётчиков, дерево пусто). Без красного баннера.
- **done (drill):** экран → ListView. Сохранение scroll/expanded при возврате НЕ гарантируется (re-mount) — открытый вопрос (не блокер).

### Навигация «назад» (drill → ListView → назад)
План перегружает `ListView.onMenu` под «назад» (гамбургер ≠ назад — ломает аффорданс). **Рекомендация:** Telegram WebApp `BackButton` (платформенный паттерн, авто-анимация). Альтернатива — chevron-left SVG 24px в слоте `.hamb` (48px тач, Bone, active scale 0.97). Меняет контракт ListView сверх плана — см. открытые вопросы. **В минимуме волны 1 контракт плана (`onMenu → setViewing(null)`) работает функционально; визуальный аффорданс — фикс по выбору CEO.**

### CSS-классы
**Reuse как есть:** `.screen-hero`, `.screen h1` (после 22px), `.drawer-section`, `.drawer-count`, `.drawer-label` (ellipsis), `.drawer-row` (+`.active`/`:active`), `.drawer-add`, `.drawer-sep`, `.tree-row`/`.lifted`/`.tree-chev`/`.tree-btn` (с фиксами), `.skeleton`. Иконки `IcoAll/IcoTodaySmall/IcoTomorrow/IcoNext7/IcoInbox/IcoWeekPlan/IcoPlus/IcoMore/IcoDot`.

**Добавить (scope `.lists`):**
```css
.screen.lists {
  padding-left: 0; padding-right: 0;
  padding-bottom: calc(var(--tab-h) + env(safe-area-inset-bottom) + var(--s4));
}
.lists .screen-hero { padding: 0 var(--s4); }
.lists .drawer-row { min-height: 52px; padding: 14px var(--s4); }
.lists .drawer-row.active { background: var(--accent-soft); }
.lists .drawer-row .drawer-ico { color: var(--text-muted); }       /* 1 акцент */
.lists .drawer-row.active .drawer-ico { color: var(--accent); }
.lists .drawer-sep { margin: var(--s4); }                          /* §5 фикс: было --s3 */
.lists .tree-chev { transition: transform 150ms ease; }            /* подрезано с 180 */
.lists-skeleton-row {
  height: 52px; border-radius: var(--radius-sm);
  margin: 0 var(--s4) var(--s2);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%);
  background-size: 400% 100%; animation: shimmer 1.2s ease infinite;
}
.lists .tree-btn { width: 44px; height: 44px; }                    /* hit-area фикс */
```
Опц. «пилюля» active вместо full-bleed: `margin:0 var(--s2); border-radius:var(--radius-sm)` + уменьшить padding строк на `--s2`. Дефолт — full-bleed (нативнее) — см. открытые вопросы.

**Изменить в icons.tsx:** `IcoPin` (~14, вместо 📌), `IcoChevron` (~12–14, вместо текстового ▸ в `.tree-chev`). Через `sv()`, stroke currentColor 1.9.

---

## Поверхность 3 — Nav-shell (таб-бар + FAB) + Tracking placeholder

### Tracking placeholder (`screens/Tracking.tsx`)
Корень `<div className="screen">` (padding 20/16/24 + `.app` bottom под таб-бар). Блоки:
1. `.screen-hero` > `<h1>Трекинг</h1>` (Geist **22/700** Bone). Без подзаголовка/фейк-статов (честный placeholder).
2. `<Empty text="Тепловая карта, метрики, привычки и ретро — скоро." />` — центр `.card` (surface, radius 16, padding 28), одна `.muted` строка Steel. Без кнопки (навигировать некуда). Без FAB на этом табе.

> **Фикс ревью (minor — copy, open question 15 закрыт): убрать «в волне 3», дефолт = «…— скоро.»** Внутренняя нумерация волн — жаргон, не для пользовательского UI.

Состояния: только **empty** (resting state, не ошибка). loading/error — нет. Без спиннера, без emoji, без фейк-метрик (§7).

### Таб-бар (`components/BottomTabs.tsx` + `.tabbar`)
`.tabbar` в theme.css уже корректен (fixed bottom, height `72px+safe-area`, grid 5 колонок, surface, `border-top:1px Hairline`, z-30). **CSS-правок структуры не требует.**

Каждый таб = `<button>`: column flex, gap 4px, иконка 24×24 над label. Label Geist 11px, Steel inactive / Ember `.active`. Тач = вся ячейка (≥44px шир., 72px выс.).

Порядок + лейблы: `today` «Сегодня» (IcoToday), `calendar` «Календарь» (IcoCalendar), `lists` «Списки» (**IcoLists NEW**), `goals` «Цели» (IcoGoals), `tracking` «Трекинг» (**IcoTracking NEW**).

**Inbox-бейдж:** только на `today`, только `inboxCount>0`. `.tab-badge` (Ember кружок, белый текст, Geist Mono 10/700, min-width 16px, `top:10px; left:50%`). **Фикс:** `transform: translateX(6px)` → `translateX(8px)` (на узкой 5-колоночной ячейке +6px задевает правый край иконки). Бейдж над иконкой, никогда над label. Cap «99+» при >99 — опционально (open question).

### FAB (`components/Fab.tsx` + `.fab/.fab-secondary`)
Позиция/размер/тень в theme.css корректны — **не менять.** `.fab`: 56px круг, Ember fill, белый глиф, `fixed; right:16px; bottom:calc(72px+safe-area+12px)`, `box-shadow:0 6px 20px rgba(0,0,0,0.45)` (depth-тень, НЕ neon/glow — не увеличивать blur, не красить в акцент), z-40, `:active scale(0.94)`. `.fab-secondary` (AI): 50px, bottom-left, Slate fill, Ember текст, 1px Hairline.

**Видимость:** FAB только на `today | lists | calendar` И `!viewing`. НЕ на goals, НЕ на tracking, НЕ при открытом ListView. (Распространяется на все состояния Today — empty/done/error — см. Поверхность 1.)

**Глиф primary FAB:** заменить текстовый `+` (28px) на `<IcoPlus/>` SVG (on-system, §4). Добавить `.fab svg{width:24px;height:24px}`. `AI` на secondary — wordmark-label, остаётся.

### Новые nav-иконки (icons.tsx, паттерн `stroke(active)` + **width 2** — фикс ревью, НЕ `active?2.2:1.8` из плана)
```tsx
export function IcoLists({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.3" fill={stroke(active)} stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill={stroke(active)} stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill={stroke(active)} stroke="none" />
    </svg>
  );
}
export function IcoTracking({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v15a1 1 0 0 0 1 1h15" />
      <path d="M7.5 14.5l3.5-4 3 2.5 4.5-6" />
    </svg>
  );
}
```
Active = смена цвета на Ember (color-swap), НЕ толщины — единообразие с IcoToday/Calendar/Goals (constant width 2). Использовать существующий хелпер `stroke(active)` из icons.tsx. НЕ вводить per-icon толщину-при-active.

### CSS-классы
**Reuse как есть:** `.screen`, `.screen-hero`, `.screen h1` (после 22px), `.card`+`.muted` (через `Empty`), `.tabbar`+`button`+`.active`+`svg`, `.fab`/`.fab-secondary`, `.app` bottom-padding.
**Изменить:** `.tab-badge transform: translateX(6px)→translateX(8px)`.
**Добавить:** `.fab svg{width:24px;height:24px}` (под SVG-глиф FAB).

---

## Поверхность 4 — DayTimeline (часовой таймлайн)

> **Объём работы (фикс ревью, blocker): DayTimeline.tsx НЕ существует.** Таймлайн живёт инлайном внутри `Calendar.tsx` (rail/блоки/cal-now, scrollRef, focusHour, parseMin/hhmm/resolveColor). Волна 1 = **извлечь** общий компонент из Calendar.tsx, перенести состояние и переключить Calendar на него. Формулировка «reuse как есть» относится к CSS-классам `.cal-*` (они в theme.css), НЕ к компоненту.

**Что извлекается из `Calendar.tsx` в новый `frontend/src/components/DayTimeline.tsx`:**
- Презентационная разметка: `.cal-scroll` > `.cal-grid` (rail 0–23, абсолютные блоки, `.cal-now`).
- Состояние/refs: `scrollRef`, `focusHour`-эффект (auto-scroll при mount), `nowMin`, `timed`-мемо.
- Хелперы: `parseMin`, `hhmm`, `resolveColor`, константы `HOUR_H=56`, `HOURS`.
- Пропсы: `{ tasks, byId, isToday, autoScroll=true, onTapHour, onToggle }`.

**Регрессия Calendar (риск, обязательно проверить):** Calendar переписывается — из него удаляются перенесённые хелперы/разметка/refs, остаётся шапка (`cal-head`), `cal-allday` (untimed-чипы над таймлайном), `addHour`-композер. Calendar вызывает `<DayTimeline autoScroll={true} .../>`. **Формулировка черновика «Calendar-вызов с autoScroll=true НЕ трогать» снимается — Calendar редактируется, не остаётся нетронутым.** Чеклист QA (Поверхность 7) обязан включить «Календарь-день не сломан рефактором».

Поверхность = вертикальный скролл-контейнер; три слоя в одной `.cal-grid` (`position:relative`): rail 0–23 (фон+тап-зоны), абсолютные блоки задач, линия «сейчас» (только isToday). Untimed-задачи НЕ часть таймлайна (рендерит экран: Calendar = `.cal-allday` чипы, Today = секция «Без времени»). Высота холста 24×56=1344px.

### Layout
- `.cal-scroll`: `flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch`. В Today-режиме (`.daytimeline--static`) — `overflow:visible; flex:none` (единый скролл экрана). Padding под таб-бар внутри НЕ нужен.
- `.cal-grid`: `position:relative; height:1344px`.
- **Авто-скролл при монтировании (только Calendar, `autoScroll=true`):** `scrollTop = max(0, focusHour*56 − 56)`, focusHour = isToday ? текущий час : 7. Мгновенно. В Today `autoScroll=false`.
- **Rail:** 24 ряда `.cal-hour` (height 56, `border-top:1px Hairline`, `padding-left:52px`). Лейбл `.cal-hourlabel` (`absolute; left:0; top:-8px; width:46px; text-align:right`, Geist Mono 11, Steel, `HH:00`). Тап ряда → `onTapHour(h)` (тач = вся ширина × 56px ≥44).
- **Линия «сейчас» `.cal-now`** (только isToday): `absolute; left:50px; right:0; height:2px; background:Ember; z-index:3; top:(nowMin/60)*56`. `::before` — 8px Ember круг слева — **функциональный маркер текущего времени** (несёт данные «где сейчас»), НЕ декор-кружок §7.

**Состояние «таймлайн открыт долго» (фикс ревью, minor):** при едином скролле Today экран не авто-скроллит к «сейчас», и линия статична на момент mount. Чтобы пользователь, оставивший Today открытым, не видел устаревшую линию:
- **Поминутный пересчёт `top` у `.cal-now`** через `setInterval(60s)` → setState nowMin. Пересчёт МГНОВЕННЫЙ, **без CSS-transition на top** (§6 запрещает анимировать top — поэтому именно мгновенный пересчёт позиции, не анимация). Дешёво, не цикл-анимация.
- Это снимает «застывшую линию». Принятое ограничение зафиксировано здесь, а не спрятано в motion-секции.

### Блок задачи `.cal-block` (финальный вид, БЕЗ emoji)
`position:absolute; left:56px; right:8px; top:(startMin/60)*56+1; height:max((durMin/60)*56−2, 22); overflow:hidden; border-radius:10px; padding:5px 9px; border-left:3px solid <роль>; background:<тинт>; box-shadow:0 1px 4px rgba(0,0,0,0.3); cursor:pointer`.

**КАНТ (borderLeftColor) = ПРИОРИТЕТ важнее проекта** (фикс ревью, major — open question 16 ЗАКРЫТ: поле `Task.priority` подтверждено в `types.ts` = `"none"|"low"|"medium"|"high"`; маппинг обязателен в волне 1, оговорка «если поля нет — переносим» снята):
- high → `--danger` Signal Red `#FF5C5C`
- medium → `--warning` Amber `#FFB02E`
- low → `--accent` Ember `#EE8A3C`
- none → цвет проекта `resolveColor(project_id)`; нет → Ember (дефолт).

**ФОН (тинт) = ВСЕГДА цвет проекта**: есть цвет `c` → `${c}22` (12.5% альфа); нет → `--surface-2` Slate. (Тинт проекта + кант приоритета разных цветов — норма: «синий проект, красный срочный».)

**Единый источник приоритета с TaskItem:** и `.cal-block` border-left, и `.task-row` `.prio-*` читают `task.priority` по одному маппингу. Untimed в Today (через TaskItem) и таймлайн рендерят приоритет одинаково.

- **Строка 1 `.bt`** (название): Geist 14/600, Bone, `nowrap/ellipsis`. **УДАЛИТЬ emoji-префикс `proj.icon`**. Опц. цветная точка 6px `.pdot` перед title (resolveColor) — **только если проект есть и у него есть цвет** (иначе пустой кружок = декор §7; фикс ревью minor: pdot не появляется без проекта).
- **Строка 2 `.bm`** (мета): Geist Mono 11, Steel, `mt:1px; display:flex; align-items:center; gap:5px; nowrap; overflow:hidden`. Состав:
  1. **Время** (всегда, якорь): `HH:MM` или `HH:MM–HH:MM` (если end>start).
  2. **Повтор** (вместо 🔁): `<IcoRepeatMicro/>` 12px, только если `t.recurrence`.
  3. **Напоминание** (вместо ⏰): `<IcoBellMicro/>` 12px, только если `t.reminder_at`.
  Иконки — inline-flex дети после времени, `gap:5px` (НЕ пробелами-emoji). Узкий блок → естественное усечение overflow (время приоритетно).
- **done `.cal-block.done`:** `opacity:0.5` + `.bt line-through`. Кант/тинт/иконки под общим opacity.
- **Клик:** `onClick` с `e.stopPropagation()` → `onToggle(t)`. Haptic light на уровне экрана.

### Состояния
- **empty:** rail 0–23 целиком (фон-холст для создания) + линия «сейчас» (isToday). БЕЗ внутреннего empty-state (текст живёт на экране).
- **loading:** rail сразу (не зависит от данных) + блоки доезжают = НЕ спиннер. Опц. 2–3 skeleton-блока — по умолчанию НЕ вводим (риск мерцания при reload).
- **active (нажатие):** ряд `.cal-hour:active` фон Smoke; блок `.cal-block:active` scale 0.98.
- **done:** см. блок выше.
- **error:** проглатывается на уровне экрана (`.catch(()=>{})`); таймлайн = пустой rail.

### Motion
- Блок `:active scale(0.98)`, `transition transform 140ms ease` (новое).
- Час `:active` фон Smoke, `transition background 120ms ease` (добавить плавность).
- Авто-скролл монтирования — мгновенный (НЕ анимировать).
- `.cal-now` top — поминутный мгновенный пересчёт, без transition (§6).
- Появление блоков — без обязательной анимации; staggered-fade только опц. на mount/смену дня. По умолчанию НЕ вводим.
- Микро-иконки — статичны, без glow/пульсации.

### CSS-классы
**Reuse как есть (CSS, не компонент):** `.cal-scroll`, `.cal-grid`, `.cal-hour`(+`:active`), `.cal-hourlabel`, `.cal-now`(+`::before`), `.cal-block`(+`.bt`/`.bm`/`.done`), `.skeleton`.
**Изменить (theme.css):**
```css
.cal-block .bm { font-size:11px; color:var(--text-muted); font-family:var(--font-mono);
  margin-top:1px; display:flex; align-items:center; gap:5px; white-space:nowrap; overflow:hidden; }
.cal-block { transition: transform 140ms ease; }
.cal-block:active { transform: scale(0.98); }
.cal-block .bm svg { width:12px; height:12px; display:block; flex:0 0 auto; }
.cal-hour { transition: background 120ms ease; }
```
**Добавить (icons.tsx):**
- `IcoRepeatMicro` — 12×12 (viewBox 0 0 24 24, width/height 12, fill none, stroke currentColor, strokeWidth 1.8, round): `<path d="M4 9a8 8 0 0 1 14-3M20 15a8 8 0 0 1-14 3"/><path d="M18 3v3.5h-3.5M6 21v-3.5h3.5"/>`.
- `IcoBellMicro` — 12×12, тот же стиль: `<path d="M18 9a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>`. Колокол семантически точнее «напоминание» + контраст с повтором; альтернатива IcoClockMicro — open question.
**НЕ переиспользовать:** `.prio-high/.prio-medium/.prio-low` (box-shadow inset) на cal-block — у блока настоящий `border-left:3px`, дублировать не нужно. `prio-*` остаются для task-row (тот же маппинг приоритета).

---

## Нарушения DESIGN.md к фиксу (сводно)

### Критично — токены/типографика (НОВОЕ по ревью)
0a. **Токены `theme.css` ≠ роли DESIGN §2** (blocker): `--bg:var(--tg-theme-bg-color,#08080a)` (near-black fallback, §2/§7 «не #000»), `--surface:#161619`, `--surface-2:#1f1f23`. → токен-патч: `--bg:#0F0F11`, `--surface:#1A1B1F`, `--surface-2:#242529`. Таблица цветов в спеке — справочная карта ролей, значения = токены после патча.
0b. **`.screen h1` = 26px** vs DESIGN §3 «заголовок 22px/700» (major). → `.screen h1{font-size:22px}`. Не отклонение — приведение к §3.

### Критично — emoji в UI (§7)
1. **🔁/⏰ в таймлайне** (`Calendar.tsx` инлайн `t.recurrence?'  🔁':''` / `t.reminder_at?'  ⏰':''`): → SVG `IcoRepeatMicro`/`IcoBellMicro` 12px, `gap:5px`. Касается Today И Calendar (общий извлечённый DayTimeline). Обязателен.
2. **`proj.icon` emoji-префикс в `.cal-block .bt`** (`Calendar.tsx` инлайн `{proj?.icon?proj.icon+' ':''}{t.title}`): → убрать; идентичность = кант/тинт (опц. точка 6px только при наличии проекта+цвета). Касается обоих.
3. **pin-маркер 📌 в проектах** (`ProjectTree.tsx:87` `{item.pinned?"📌 ":""}`): → SVG `IcoPin` 14px (Ember/Steel).
4. **`p.icon` эмодзи-иконки проектов** (`ProjectTree.tsx:45` `<span style={{fontSize:18}}>{p.icon}</span>`, из ProjectSheet emoji-grid): → цветовая точка `p.color` (fallback `IcoDot` уже есть). Широкий рефактор (вся фича emoji-иконок) — вероятно отдельная волна; **минимум волны 1: НЕ вводить новых emoji, задокументировать.** Политика emoji-данных — open question.

### SVG вместо текст-глифов (§4/§7)
5. **entry-card lead «In» + chev «›»** (старый Today): → `<IcoInbox/>` + `<IcoChevron/>` SVG.
6. **chevron дерева ▸** (`ProjectTree.tsx:91` `.tree-chev` текстовый `▸`): → SVG `IcoChevron` 12–14px.
7. **FAB `+` глиф** (`Fab.tsx`, текст 28px): → `<IcoPlus/>` SVG. `AI` wordmark остаётся.

### 1 акцент (§2)
8. **`.drawer-ico { color: var(--accent) }`** (`theme.css:209`): красит ВСЕ иконки строк Ember безусловно. На full-screen Lists 6 смарт-иконок + дерево горят оранжевым = размыт «1 акцент». → scope-фикс: `.lists .drawer-row .drawer-ico{color:var(--text-muted)}` + `.active .drawer-ico{color:var(--accent)}`. (Drawer-правило не трогаем.)

### Тач ≥44px (§5)
9. **`.tree-btn 30×30px`** (`theme.css:251-256`): chevron/меню меньше минимума, ДВЕ кнопки в строке. → hit-area до 44px (`.lists .tree-btn{width:44px;height:44px}`), глиф 18px, обе прижаты к правому краю, gap ≥4px, не съедают drill-зону строки (см. Поверхность 2).

### Приоритет = кант (§4) — рассинхрон РАЗРЕШЁН
10. **Кант таймлайна не учитывает приоритет** (текущий инлайн `borderLeftColor` = цвет проекта/Ember): → кант = приоритет (high/medium/low), фон-тинт = проект. **Поле `Task.priority` подтверждено (`types.ts`) — маппинг обязателен в волне 1, НЕ переносится.** TaskItem (`.prio-*`) и cal-block (`border-left`) используют ОДИН источник `task.priority`. Внимание на конфликт TaskItem: инлайн `borderLeft` от `color` перекрывает `.prio-*` — приоритет важнее проекта в Today untimed.

### RAW error в UI
11. **`Ошибка: {err}` в `.card`** (старый Today): → тихий `<Empty>` «Не удалось загрузить».

### Тактильное нажатие (§6)
12. **Нет `.cal-block:active scale`**: → `.cal-block:active{transform:scale(0.98)}`, 140ms.

### Геометрия строк — намеренное отклонение (зафиксировать)
13. **DESIGN §4 (row radius 12 / checkbox 22) vs theme (16 / 24):** консистентность с задеплоенным UI важнее. → намеренное отклонение, design-debt тикет на весь app — решение CEO.

### UX (§5 «один вьюпорт») + скролл-конфликт
14. **Вложенный двойной скролл планового Today** (`height:100% + DayTimeline flex:1`): → единый скролл `.app` + `.daytimeline--static`. **Скролл-порт = `.app`; App-swipe-Drawer удалён глобально** (снимает конфликт горизонтального детектора с вертикальным панорамированием и pull-to-close). Проверить одной рукой верх↔низ в WebView.

### Навигационная модель (НОВОЕ по ревью)
15. **Таб `tasks`+`projects(Drawer)` → `lists`+`tracking`** (major): «Все задачи» = смарт-строка в Lists (единственный вход). swipe-Drawer удалён (один вход в списки, без скрытых дублей). Drawer-компонент не удаляется физически; «Drawer жив» из черновика снято.

### DayTimeline — объём (НОВОЕ по ревью)
16. **DayTimeline.tsx не существует** (blocker): таймлайн инлайн в Calendar.tsx. → извлечь компонент (перенести scrollRef/focusHour/parseMin/hhmm/resolveColor/разметку), переключить Calendar, проверить регрессию Calendar. «reuse как есть» — только про CSS `.cal-*`, не про компонент.

---

## Открытые вопросы к пользователю

**Закрыто по ревью (дефолты приняты — фиксы применены в спеке):**
- ~~OQ16 поле приоритета~~ → **закрыто:** `Task.priority` = none/low/medium/high, кант обязателен.
- ~~OQ15 copy Tracking «волна 3»~~ → **закрыто:** «…— скоро.» без номеров волн.
- ~~OQ7 навигация назад~~ → **рекомендация:** Telegram `BackButton`; минимум плана функционален.

**Остаются:**

**Политика emoji-данных (сквозной, блокер консистентности):**
1. `proj.icon`/`p.icon` эмодзи-иконки проектов и pin 📌 — заменить на цветовую точку + SVG-pin ВЕЗДЕ (консистентно, но регрессия восприятия если пользователь привык к emoji), ИЛИ §7 = «без emoji в хроме, пользовательские данные можно»? Объём (волна 1 vs отдельная волна)? Минимум сейчас: IcoPin + НЕ вводить новых emoji.

**Today:**
2. Склонение числительных («1 задача / 2 задачи / 5 задач» через `Intl.PluralRules`) vs «N задач»? Дефолт — упрощённо.
3. Авто-скролл к «сейчас»: подтвердить отказ (hero вверху) ИЛИ мягкий `scrollIntoView(.cal-now)` один раз? Дефолт — отказ.
4. Пустой таймлайн: всегда 24-часовой rail (тап=создание) ИЛИ при пустом дне свернуть rail + центр-Empty? Дефолт — rail виден всегда.
5. done-day позитив-стейт: спец-вид в волне 1 ИЛИ ждём волну трекинга? Дефолт — НЕ в волне 1.
6. Pull-to-refresh: нативный Telegram pull (на него ссылается error-state) ИЛИ явный refresh? Подтвердить, что WebView даёт его в текущей конфигурации.
19. **Слияние date+summary в одну мета-строку** («суббота, 30 мая · 5 задач, 2 закрыто») чтобы убрать один уровень иерархии hero и поднять Inbox/таймлайн в зону большого пальца? Дефолт — две строки (date + summary), при N=0 summary скрыта.

**Lists:**
7. Навигация «назад» из ListView: Telegram `BackButton` (рекоменд.) vs экранный chevron-left в `.hamb`?
8. Active-строка на full-screen: full-bleed Ember Soft (дефолт) vs «пилюля» с margin+radius?
9. `loading` boolean в Lists.tsx (FOUC «допрыгивающих» проектов): добавить скелетон-дерево? Рекомендуется.
10. Сохранение scroll/`expanded` дерева при возврате из ListView (re-mount сбрасывает): поднять стейт в App / sessionStorage?
11. Empty-дерево: только «+ Проект» (дефолт) vs + muted «Пока нет проектов»?
12. Error в Lists: тихий деградейд (дефолт) vs тонкая retry-строка?

**Nav-shell:**
13. Inbox-бейдж cap «99+» при >99 ИЛИ raw-count? Дефолт — raw.

**DayTimeline:**
17. Reminder-иконка: колокол `IcoBellMicro` (дефолт) vs циферблат `IcoClockMicro` (если reminder_at = «будильник-время»)?
18. Skeleton-блоки таймлайна на первой загрузке: вводить loading-флаг ИЛИ мгновенный rail без блоков (тоже не спиннер)? Рекомендую НЕ вводить (риск мерцания при reload).

---

## Что изменено по ревью

**Blocker:**
- **Токены.** Добавлен раздел «Токен-патч `:root`»: `--bg→#0F0F11` (снят near-black tg-fallback, §2), `--surface→#1A1B1F`, `--surface-2→#242529`. Таблица цветов помечена справочной (значения = токены, не spec-HEX). Нарушение 0a.
- **DayTimeline не существует.** Поверхность 4 переписана как «извлечь компонент из инлайна Calendar.tsx» (перенос scrollRef/focusHour/parseMin/hhmm/resolveColor/разметки), добавлена регрессия Calendar в риски, снято «Calendar-вызов НЕ трогать» и «reuse как есть» (теперь только про CSS `.cal-*`). Нарушение 16.

**Major:**
- **h1 26px→22px** по DESIGN §3, во всех поверхностях + правка `.screen h1`. Нарушение 0b.
- **Навигационная модель.** Новый раздел «Изменение навигационной модели»: `tasks`+`projects(Drawer)`→`lists`+`tracking`, «Все» = единственный вход в Lists, **swipe-Drawer удалён** (снято противоречие «Drawer жив»). Нарушение 15.
- **Скролл-конфликт Today.** Явно: скролл-порт `.app`, App-swipe отключён, обязательная проверка жестов в WebView. Нарушение 14 дополнено.
- **Кант=приоритет обязателен.** OQ16 закрыт (`Task.priority` подтверждён в `types.ts`), оговорка «если поля нет — переносим» снята, добавлено правило единого источника приоритета TaskItem↔cal-block + предупреждение о конфликте инлайн-border в TaskItem. Нарушение 10.

**Minor (применено):**
- nav-иконки `IcoLists/IcoTracking` переведены на color-swap при constant width 2 (не `active?2.2:1.8`).
- `.drawer-sep` margin `--s3→--s4` (§5 «группы 16–24»).
- Межгрупповой ритм Today унифицирован 20px, единственный задокументированный скачок 24px на «Без времени».
- Tracking copy «волна 3»→«скоро» (OQ15 закрыт).
- summary-строка скрыта при N=0 (двойная пустота); добавлен OQ19 о слиянии date+summary.
- FAB-видимость явно распространена на empty/done/error Today.
- Два `.tree-btn` 44px: правило против коллизии хит-зон и съедания drill-зоны.
- `.cal-now` поминутный мгновенный пересчёт top (без transition) против застывшей линии.
- `.pdot` рендерится только при наличии проекта с цветом (нет пустого декор-кружка §7).
- Мета-роль сведена к 13px с явно задокументированными отклонениями (11px таймлайн / 14px дата-счётчик) + гарантия §3 min-touch-text-14 (11px-текст не тач-цель).

**Принято как валидное (без правки):** функциональность точек `.cal-now::before` (маркер времени) и `.pdot` (идентичность проекта) — не декор §7; геометрия radius 16/24 — намеренное отклонение с design-debt тикетом.