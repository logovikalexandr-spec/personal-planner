# TickTick teardown → planner-v2 parity roadmap

> Фаза РАЗВЕДКА (2026-06-02). Источник: 5 параллельных research-агентов по help.ticktick.com / blog / отзывам.
> Цель: довести planner-v2 до уровня TickTick «до атомов» (single-user). Премиум-замки TickTick у нас СНЯТЫ (одиночный пользователь — всё бесплатно).
> Это product-depth deep-спека + reuse-карта (вход для designer-мокапов и architect-контрактов). Код по этому файлу НЕ пишем без согласования мокапов.

---

## 0. Принцип адаптации single-user

TickTick = командный SaaS с премиум-тарифом. Мы клонируем **поведение и ощущение**, но **выкидываем**:
- Аккаунты, логин, онбординг-карусель, шаринг/коллаборацию, «Assigned to me».
- Все премиум-замки → у нас бесплатно: длительность задачи (start/end), кастомные фильтры, мультинапоминания, длительность фокуса, темы.
- Лимиты free-тарифа (9 списков / 99 задач / 1 вложение) — не применяем.
- Apple Watch / Wear, виджеты ОС (опционально, нужен натив), внешние календарь-подписки (опционально).

Берём «соединительную ткань ощущения»: drag-insert FAB, инлайн quick-add + natural-language парсинг, кастом-свайпы, drag-reorder, long-press % прогресса, анимация чекбокса + слайд-аут + хаптик, smart-lists с «show if not empty», локал-ферст оптимистик-синк.

---

## 1. КАРТА GAP / REUSE (что уже есть vs нужно)

Легенда: ✅ есть · 🟡 частично · ❌ нет.

### Модель данных (backend `db/models.py`)
| Сущность | Состояние | Что добавить |
|---|---|---|
| Project | ✅ name/slug/color/icon/parent_id/is_inbox/pinned/order/archived | view_mode(list/kanban/timeline), group_by, sort_by, default_priority, kind(task/note) |
| Task | 🟡 title/desc/project/priority/due_date/due_time/end_time/reminder_at(1)/recurrence(строка)/status/done_at/parent_task_id/tags | progress(0-100), reminders[] (мульти), recurrence структурный, section_id, won't_do статус, time_zone, pinned |
| Tag | 🟡 name/color (плоский) | parent_id (1 уровень вложенности), order, pinned |
| InboxItem, Attachment | ✅ | — |
| **CheckItem** | ❌ | новая: task_id, title, done, order (чеклист ≠ сабтаск) |
| **Habit** | ❌ | вся сущность (см. §5) |
| **HabitRecord** | ❌ | habit_id, date, status, amount, mood, note |
| **FocusRecord** | ❌ | mode, start, duration, task_id, note |
| **Countdown** | ❌ | type, name, icon, date, counting_mode, repeat |
| **Filter** (кастом smart-list) | ❌ | name, rules(json), order |
| **Section** | ❌ | project_id, name, order (колонки kanban / группы) |

### Frontend экраны/компоненты
| Зона | Состояние | Gap |
|---|---|---|
| Today (hour-timeline + inbox card) | 🟡 | scheduled-на-таймлайне + «to-schedule» секция, Plan-Your-Day триаж, скрытые часы 00-07/21-24, current-time линия |
| Calendar | 🟡 только День | Неделя / Месяц / 3-дня / Agenda / Год, time-block drag+resize, undated-tray, month-dots+overflow |
| Lists | ✅ smart+проекты+error | кастом-фильтры, секции, view-switch (list/kanban/timeline), group&sort per-list, теги-вью, search |
| Goals | ❌ stub | Habits-модуль целиком |
| Tracking | ❌ stub | Pomodoro/Focus + Statistics + Eisenhower Matrix + Countdown |
| TaskComposer (quick-add) | 🟡 date/priority/project/tag/subtask | natural-language парсинг, мульти-reminder, recurrence-UI, checklist-режим |
| TaskItem (row) | 🟡 чекбокс/прио-кант | кастом-свайпы (4 слота), long-press %-прогресс, multi-select |
| **TaskDetail (full screen)** | ❌ | новый: notes-markdown, чеклист+прогресс-ring, активность, все поля, overflow-меню |
| Sheets/pickers | ✅ единый Sheet.tsx, стек-шторки | recurrence-picker, reminder-picker(мульти), section-picker |

---

## 2. CORE TASKS — атомы (домен 1)

- **Quick-add**: инлайн-бар над клавиатурой + drag-insert FAB (позиция дропа = порядок вставки). Natural-language: `завтра 17:00`, `#тег`, `!1`(прио), `~проект`, `every monday`. Распознанное подсвечено — тап по токену = вернуть в текст (opt-out). Настройка «убирать текст из задачи».
- **Поля**: title · notes(markdown) · priority{none0/low1/medium3/high5, флаги: high=red medium=amber low=ember} · due_date · due_time · start/end+duration · all-day↔timed · time_zone · pinned.
- **Сабтаск vs чеклист** (КЛЮЧЕВОЕ различие):
  - *Сабтаск* = полноценная задача (своя дата/прио/напоминание), parent_task_id. У TickTick free ≤19, у нас без лимита, многоуровень.
  - *Чек-айтем* = лёгкий пункт (только title+done+order), **двигает %-прогресс родителя** (ring). Сабтаски — НЕ двигают %.
  - Режим переключается; задача конвертируется чеклист↔сабтаски.
- **Recurrence** (структурный, не строка): пресеты день/неделя/месяц/год/кастом. 3 типа: **по плановой дате** / **по дате выполнения** / **по конкретным датам**. Интервал «каждые N», дни недели, день/неделя месяца. Конец: дата / N раз / навсегда. Skip-occurrence. Регенерация: выполнил → текущая done + новая на следующую дату.
- **Reminders**: мульти (TT до 5). Относительные («за 5 мин / 1 час / 1 день») для timed; абсолютные (время) для all-day. Default-reminder в настройках. «Назойливый» повтор-алерт.
- **TaskDetail**: title (инлайн) · Date&Duration-пикер · priority · move-to-list · notes-markdown · tags · check-items · attachment · progress-ring (long-press статус-бар → swipe %). Overflow: pin/won't-do/duplicate/copy-link/activity/convert-note/start-focus.
- **Complete**: круглый чекбокс цвета прио, тап → галка+слайд-аут+fade, undo. Completed-секция/смарт-лист «Show Completed» тоггл. **Won't Do** статус (отдельный смарт-лист, Restart возвращает). Анимация+звук(опц)+хаптик.
- **Sort & Group** (per-list): group by список/время(Overdue/Today/Tomorrow/Next7/Later)/приоритет/тег/custom. Sort by date/priority/title/custom-drag. Overdue-секция с кнопкой Postpone (все на сегодня).
- **Свайпы**: 4 слота (short/long × left/right), опции none/complete/date/priority/move/delete. Дефолт: right=complete, left=date/move/delete.
- **Multi-select**: long-press (Android-стиль) → batch date/move/delete/priority/merge.

## 3. ORGANIZATION — атомы (домен 2)

- **Smart-lists** (системные, неудаляемые): Inbox(нескрываемый) · Today(+overdue) · Tomorrow · Next7 · All · Completed · Won't Do · Trash. Каждый: Show / Hide / **Show if not empty**.
- **Кастом-фильтры** (TT-премиум, у нас free): построить по list+tag+priority+date+keyword, AND/OR (advanced), preview, сохранить именованным. Живёт как smart-list.
- **Lists**: create/color/icon(emoji или эмодзи в начале имени)/folder/pin/archive/delete-в-trash. Тип: Task / Note (без completion). Drag-reorder.
- **Folders**: контейнер списков, **1 уровень** (не вкладывается в папку). Collapse/expand. (У нас сейчас project.parent_id-дерево — адаптация ок, но решить: дерево проектов ИЛИ папки+списки.)
- **Tags**: create/color, **вложенность 1 уровень** (parent), tag-management-страница, фильтр по тегу, пилюли на строках, цвет-by-tag.
- **View modes** (per-list): **List** / **Kanban**(колонки=секции, drag меняет атрибут) / **Timeline**(горизонт. ось, длина=duration, undated-панель справа).
- **Sections**: подгруппы внутри списка (= колонки kanban). Add/rename/delete/reorder. Только обычные списки.
- **Search**: глобальный — title+notes+tags+list-name, тоггл completed.
- Edge: archived-папка, trash-restore, пустой проект, тег-нигде.

## 4. CALENDAR — атомы (домен 3)

- **Views**: List · **День** · 3-дня · **Неделя** · **Месяц** · Agenda · Год(heatmap). View-switch top-right, long-press tab → Год.
- **Анатомия Неделя/День**: верх = **all-day-бар** (бездатно-времени / all-day / cross-day спан-бары), низ = **вертикальный hour-таймлайн** (timed-блоки, высота=duration).
- **Навигация**: swipe период; быстрый swipe=±неделя, медленный drag=скраб диапазона; double-tap месяц=сегодня. Week start: Вс/Пн/Сб.
- **Time-block**: long-press слот = задача (дефолт **1ч**); drag вниз = duration; resize за точки (моб) / стрелки (десктоп); **мин 30 мин**. Multi-day = all-day спан-бар.
- **Drag**: undated-tray→слот (назначить дату/время), reschedule, all-day→timed, между днями в Месяце.
- **Undated-tray** «Arrange Tasks»: свайп от правого края; список бездатных, фильтр list/tag/priority, drag на сетку.
- **Скрытые часы**: 00-07 и 21-24 свёрнуты, тап разворачивает, drag-края задаёт рабочее окно.
- **Current-time линия** (тонкая, точка слева).
- **Месяц**: чипы/бары в ячейке, overflow «+N», тап дня → День; drag-select ячеек = multi-day.
- **View Options**: color by list/tag/priority · show completed(faded) · show details · show habits · show focus.
- DROP/опц: внешние подписки (Google/iCloud) — премиум+аккаунт.

## 5. GOALS = HABITS — атомы (домен 4a)

- **Создание**: name · icon{preset/emoji/text}+color · **goal**: «выполнить всё»(binary) ИЛИ «достичь количество»(target+unit, напр. 8 чашек) · **метод записи**: auto(+N за тап) / manual(ввод суммы) / complete-all · **частота**: daily(выбор дней недели) / weekly(N раз) / interval(каждые N дней) · reminders ≤10 (каждый со временем) · **длительность** 7/30/forever · habit-log(mood+заметка) · show-in-Today/Next7 · секции (Утро/День/Ночь).
- **Check-in**: свайп/тап. auto=+1, manual=ввод, complete-all=день готов. Можно «Unachieved»(явный промах). Лог прошлых дат тапом по календарю.
- **Detail**: current streak · total check-ins · **completion% против ЦЕЛИ частоты** (3×/нед и сделал 3 = 100%, не нужно ежедневно) · best streak (хранится отдельно) · monthly check-in таблица(heatmap) · habit-log записи.
- **Archive** (= «сдаться», данные сохранены) / Restore. Габитов в TT free 5 — у нас без лимита.
- **Empty-state**: галерея 60+ пресетов (Жизнь/Здоровье/Спорт/Настрой), не пустой экран.
- Данные: §модель Habit + HabitRecord (status done/partial/unachieved/none).

## 6. TRACKING = FOCUS + STATS + MATRIX + COUNTDOWN (домен 4b)

- **Pomodoro/Focus**: Pomo(down 25/5, long-break после 4, кастом) / Stopwatch(up). Линк к задаче (focus-кнопка / swipe / detail). White-noise, strict-mode(allowlist), flip-start, full-screen-clock, focus-note, floating-window. Finish → **FocusRecord**(start/duration/task/note/type), добавляемый вручную, фильтр, удаление. Estimate pomos/duration (TT-премиум, у нас free).
- **Statistics**: Achievement Value (только задачи; +добавил/+выполнил/+вовремя/−просрочил; 12 уровней; апдейт 00:00). Completion trend (день/нед/мес). Completion rate (выполнено/запланировано). Focus stats: pomo-count, duration, trend, timeline, most-focused-time, year-grid heatmap, распределение by list/tag/task.
- **Eisenhower Matrix**: 2×2 важность×срочность. Дефолт-маппинг по приоритету (High/Med/Low/None → Q1/Q2/Q3/Q4=Do/Schedule/Delegate/Delete). Drag в квадрант = переписать атрибуты (today+high в Q1). Квадрант = rule-driven фильтр (list/tag/date/priority), не фиксированный. **Это view над задачами — без новой сущности.**
- **Countdown**: типы Holiday/Birthday/Anniversary/Custom. Icon+name+date+reminder+repeat(yearly)+counting(down/up). Pin (только один), show-group, archive.
- Все модули в TT **опт-ин в таб-бар** — у нас Goals/Tracking уже выделены; внутри Tracking — под-секции (Focus/Stats/Matrix/Countdown).

## 7. SHELL / IA / FEEL (домен 5)

- TT real-nav: bottom-bar 4 кастом-слота (Task/Calendar/Pomo/Settings) + sidebar-drawer(списки). У нас 5 фикс-табов (Today/Calendar/Lists/Goals/Tracking) — легит single-user упрощение (флэт sidebar в табы). Settings → за профиль-иконку, НЕ таб.
- **+FAB**: drag-insert → инлайн quick-add (не полный редактор), чипы date/priority/list/tag, эскалация в full-detail.
- **Жесты**: свайп-строки(кастом), pull-to-refresh→sync, long-press(multi-select+context), drag-reorder, long-press-время→%прогресс, edge-swipe drawer. (swipe-между-табами — НЕ точно, tap-only.)
- **Микро**: чекбокс fill-анимация → слайд-аут/fade → в Completed; хаптик; звук(опц). Spring ~150-250ms ease-out (свой, не TT-спека).
- **Settings**: swipe-actions, smart-date toggle, default reminder/list/priority, date&time(tz fixed/floating, week-start, countdown-mode), appearance(light/dark/auto+accent+font-size), smart-list visibility, show-completed, badge-source, daily-digest.
- **Local-first**: оптимистик, тихий offline auto-sync, pull-to-refresh, дружелюбные empty-states, seed 2-4 demo-задачи учат чекбокс+свайп.

---

## 8. РОАДМАП ВОЛН до паритета

Каждая волна = 3 фазы (РАЗВЕДКА-мокапы → СБОРКА → ГЕЙТ) по TEAM.md. Порядок = ценность × зависимости. Волна 1 (Фундамент-IA) уже в проде.

| Волна | Имя | Содержание | Зависит от |
|---|---|---|---|
| **2** | **Task Detail + ядро задачи** | Full-screen TaskDetail, notes-markdown, checklist+progress-ring, мульти-reminder, recurrence-движок+UI, natural-language quick-add. Модель: CheckItem, reminders[], progress, recurrence-структура. | 1 |
| **3** | **Списки до атомов** | group&sort per-list, секции, кастом-фильтры, теги(вложенность+management+tag-view), search, Kanban-view. | 2 |
| **4** | **Календарь до атомов** | Неделя/Месяц/Agenda, time-block drag+resize, undated-tray, скрытые часы, current-time, month-overflow, Timeline-view. | 2 |
| **5** | **Today-гибрид + жесты** | Plan-Your-Day триаж, scheduled/to-schedule split, кастом-свайпы(4 слота), multi-select, long-press %, drag-reorder polish, Won't Do, Postpone-overdue. | 2,4 |
| **6** | **Goals = Habits** | Habit+HabitRecord, create-flow, check-in(auto/manual/complete-all), streak/heatmap/completion%, галерея-пресетов, archive. | 1 |
| **7** | **Tracking = Focus+Stats+Matrix+Countdown** | Pomodoro/Stopwatch+FocusRecord, statistics(trend/rate/focus-heatmap/achievement), Eisenhower(view), Countdown. | 2,6 |
| **8** | **Settings + feel-полировка** | Settings-экран, default-reminder/list/priority, week-start, accent, show-completed, анимации/хаптик, seed demo, daily-digest. | все |

Оценка: 7 волн (2-8). Зависимости: всё ядро висит на Волне 2 (TaskDetail+модель). Параллелить можно 6(Habits) с 3/4 после 2.

---

## 9. РЕШЕНИЯ ПОЛЬЗОВАТЕЛЯ (зафиксировано 2026-06-02)

1. **Охват = ЯДРО СНАЧАЛА (волны 2-5).** Задачи/детали/списки/календарь/Today до TickTick-уровня. Goals(вол.6)+Tracking(вол.7) — после ядра.
2. **Структура = ПАПКИ + СПИСКИ (как TT).** Папка = контейнер 1 уровня, внутри плоские списки. Миграция с текущего `project.parent_id`-дерева. (Влияет на модель: разделить folder/list ИЛИ project.kind=folder|list + запрет вложенности списка в список.)
3. **Tracking = Habits + Статистика + Матрица + Countdown. POMODORO/FOCUS — ВЫКИНУТ** (не нужен). → Волну 7 урезать: убрать FocusRecord/таймер; Achievement-стату оставить (но focus-часть статы выпадает).
4. **Внешний календарь — DROP сейчас.** НО: вся база задач Александра живёт в **Notion** → **синхронизация Notion (Notion = источник задач)** = отдельная задача ПОСЛЕ ядра (вол.5). Запарковано, не в текущем охвате.

### Скорректированный план
Текущий охват: **Волны 2 → 3 → 4 → 5**. Затем гейт-пауза, дальше Habits(6)/Tracking-урезанный(7)/Settings(8) + Notion-sync (новая волна). Волна 7 без Pomodoro.

---

## Источники-флаги (проверить в живом TT перед пиксель-клоном)
Точные hex приоритетов (high=red подтв.; medium=amber/low=blue — репорт), полная грамматика NL-парсера, undo-аффорданс, кадэнс назойливого алерта, Ebbinghaus-интервалы, overlap timed-блоков, «+N more» порог, DST. Дефолт-сорт каждого smart-list не документирован → моделить как сохранённый group+sort.
