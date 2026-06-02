# Волна 2 — контракт сборки (architect)

> Источник истины Фазы 2. Backend ∥ frontend пишут СТРОГО по нему. Утверждённые мокапы: `design/wave2-mock/wave2.html` + `wave2-states.html` (8 экранов). Teardown: `2026-06-02-ticktick-teardown-and-roadmap.md`.
> Охват Волны 2 = ядро задачи: TaskDetail full-screen, checklist+progress, мульти-reminder, структурный recurrence + регенерация, won't-do, свайпы, multi-select, quick-add NL-парсинг. (Folders/Sections/views = Волна 3, НЕ трогать.)

## 1. МОДЕЛЬ (backend `db/models.py`) — дельта

### Task — новые поля
- `progress: int = 0` (0-100; двигается ТОЛЬКО чеклистом, авто-пересчёт при изменении CheckItem).
- `pinned: bool = False`.
- `status` — расширить допустимые значения: `todo | in_progress | done | wont_do | archived` (строка как сейчас; «wont_do» = Won't Do). `done_at` ставится и для done, и для wont_do (= момент закрытия).
- `recurrence_json: JSON | None` — структурный повтор (см. §4). Старый `recurrence: str` оставить для legacy/display, новый код пишет json.
- (НЕ добавляем: time_zone, section_id — позже.)

### CheckItem — новая таблица
```
id:int pk · task_id:FK(task) · title:str(500) · done:bool=False · order_index:int=0 · created_at
```
- Лёгкий пункт чеклиста (НЕ задача). Каскад-удаление с задачей.
- При любом изменении `done` пунктов → пересчёт `task.progress = round(done/total*100)` (если total>0; иначе progress не трогаем — он ручной).

### Reminder — новая таблица (мульти-напоминания)
```
id:int pk · task_id:FK(task) · kind:str('relative'|'absolute') · offset_minutes:int|None · at_time:Time|None · created_at
```
- `relative` → offset_minutes (за N мин до due_time; напр. 30, 1440=за день). `absolute` → at_time (для all-day задач).
- Миграция: существующий `task.reminder_at` → создать Reminder-строки где возможно; колонку `reminder_at` оставить (legacy), новый код использует Reminder[].

### Миграция Alembic
Новая ревизия после текущей head. add columns на task (progress, pinned, recurrence_json) + create table check_item, reminder. Бэкфилл progress=0, перенос reminder_at в reminder (best-effort). Down-grade обратный.

## 2. API (FastAPI `api/routes/tasks.py` + новые) — контракт

Базовый префикс как в проекте (`/api`). initData-auth как есть.

### Task detail (расширить)
- `GET /tasks/{id}` → TaskDetail: все поля + `checkitems: CheckItem[]` (order) + `reminders: Reminder[]` + `subtasks: Task[]` (где parent_task_id=id, краткие) + `tags`. `progress` включён.
- `PATCH /tasks/{id}` — принимает любое подмножество: title, description, project_id, priority, due_date, due_time, end_time, status, pinned, recurrence_json, progress(ручной override). 
  - Если в PATCH `status: 'done'` И `recurrence_json` задан → сервис помечает текущую done + **генерирует следующий экземпляр** (см. §4), возвращает `{task, next_task?}`.
  - `status: 'wont_do'` → done_at=now, без регенерации.

### CheckItems
- `POST /tasks/{id}/checkitems` {title} → CheckItem (order=max+1).
- `PATCH /checkitems/{id}` {title?, done?, order_index?} → CheckItem; при изменении done → пересчёт task.progress.
- `DELETE /checkitems/{id}` → 204; пересчёт progress.
- (Опц. bulk reorder: `PATCH /tasks/{id}/checkitems/reorder` {ids:[]}.)

### Reminders
- `PUT /tasks/{id}/reminders` {reminders:[{kind,offset_minutes?,at_time?}]} → заменяет набор, возвращает Reminder[]. (Проще полной заменой набора, чем поштучно.)

### Schemas (`api/schemas.py`)
Pydantic: CheckItemIn/Out, ReminderIn/Out, RecurrenceJson (модель §4), TaskDetailOut (extends текущий TaskOut + checkitems/reminders/subtasks/progress/pinned). TaskPatchIn расширить.

## 3. Сервис (`services/tasks.py`)
- `recompute_progress(task)` — по чеклисту.
- `complete_task(task)` — если recurrence → `generate_next(task)`; иначе status=done+done_at.
- `generate_next(task)` — по recurrence_json вычислить следующую due_date (см.§4), создать копию (title/desc/project/priority/recurrence_json/checkitems-сброшены) с новой датой, текущую закрыть.
- CRUD checkitems/reminders.

## 4. RECURRENCE_JSON — формат + движок
```json
{
  "freq": "daily|weekly|monthly|yearly",
  "interval": 1,
  "weekdays": [0,2,4],          // для weekly, 0=Пн..6=Вс
  "monthday": null,              // для monthly (день месяца) ИЛИ
  "base": "due|completion|dates",// база отсчёта
  "specific_dates": [],          // для base=dates (ISO даты)
  "end": {"type": "never|date|count", "value": null}
}
```
Движок `next_date(rec, from_date)`:
- base=`due`: считать от плановой due_date. base=`completion`: считать от сегодня (даты выполнения). base=`dates`: следующая из specific_dates > from.
- weekly+weekdays: ближайший следующий выбранный день недели с учётом interval недель.
- monthly: +interval месяцев, тот же monthday (clamp на конец месяца).
- end: count → счётчик исчерпан = не генерировать; date → > end.value = стоп.
МVP: реализовать daily/weekly(weekdays)/monthly/yearly + base due/completion + end never/date/count. specific_dates — можно заглушить (флаг), если время поджимает.

## 5. FRONTEND — план компонентов + reuse-карта

### Reuse (есть — переиспользовать, НЕ дублировать)
- `Sheet.tsx` — база всех шторок (swipe-from-grip, стек). Recurrence/Reminder/DateDuration строить НА НЁМ.
- `pickers.tsx`, `DateSheet.tsx` — расширить, не плодить новые паттерны выбора (single=tap+close 140мс; multi=Готово — см. PATTERNS).
- `TaskItem.tsx` — добавить свайп+long-press СЮДА (не новый компонент строки).
- `lib/projectTree.ts` — не трогаем (Волна 3).
- `icons.tsx` — все глифы SVG отсюда (хром=SVG). Новые иконки добавлять сюда.
- `theme.css` — токены отсюда; новые классы по DESIGN.md (onyx/ember/Geist). ОБЩИЙ ФАЙЛ → правки последовательно.

### Новые/изменённые (порядок = сначала foundation, потом features; общие файлы последовательно)
**F1 foundation:**
- `types.ts` (+CheckItem, Reminder, RecurrenceJson, progress, status'wont_do', pinned, TaskDetail).
- `api.ts` (+getTaskDetail, patchTask расшир., checkitem CRUD, putReminders).
- `components/TaskDetail.tsx` — НОВЫЙ full-screen (мокап #1/C): title-inline, notes, rows(date/priority/list/repeat/reminders/tags), checklist+progress-ring, subtask-блок, overflow-бар. Состояния: загрузка(скелетон)/ошибка(ретрай)/пусто-чеклист.
- `components/Checklist.tsx` — пункты + ring (мокап #1).
- `components/RecurrenceSheet.tsx` — на Sheet (мокап #3).
- `components/RemindersSheet.tsx` — на Sheet, мульти (мокап #4).
- `components/DateDurationSheet.tsx` — расширить/заменить DateSheet: мини-календарь + дата/длительность segmented + all-day + входы повтор/напоминание (мокап A).
- `App.tsx` — роут на TaskDetail по тапу строки (общий файл, последовательно).

**F2 features:**
- `TaskItem.tsx` — свайп (right=complete ember, left=date/move/delete), long-press → multi-select. (мокап B,D).
- `components/BatchBar.tsx` — нижняя batch-панель (мокап D).
- Won't-do стиль строки + секция «Выполнено и Won't Do» (свёрнутая) в `ListView.tsx`/`screens/Lists.tsx`,`Tasks.tsx`.
- Quick-add NL-парсинг в `TaskComposer.tsx`/`AddTaskBar.tsx`: парсер `lib/quickParse.ts` (дата RU «завтра/сегодня/HH:MM», `#тег`, `!1..!4`, `~проект`), подсветка токенов, тап=вернуть.

### Матрица состояний (DoD) на каждый новый экран/шторку
пусто(CTA) · загрузка(скелетон, НЕ спиннер) · ошибка(отлична, ретрай) · выбрано · край(длинный title/0/много пунктов).

## 6. ТЕСТЫ
- backend pytest: recurrence next_date (все freq+base+end), recompute_progress, complete_task с/без повтора, checkitem/reminder CRUD, TaskDetail сериализация.
- frontend: `npm run build` зелёный (tsc+vite). Юнит quickParse (если есть харнесс).

## 7. ГЕЙТ (Фаза 3)
- reviewer: depth-гейт vs PATTERNS (один паттерн поведения везде) + DESIGN (onyx/ember/Geist/без emoji/скелетоны) → MERGE/BLOCK.
- CEO (я): визуальная проверка живьём (dev-сервер + скрин всех экранов) ДО «готово». Не верить build-хэшу.
- Деплой rsync на prod, финальное визуальное ОК владельца.

## Не делать в Волне 2
Folders/lists split, Sections, kanban/timeline, кастом-фильтры, теги-вложенность, search, календарь Неделя/Месяц, Today-Plan-Your-Day, Habits, Tracking, Settings. Всё это — следующие волны.
