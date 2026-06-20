# План — Календарь «Дни» (Волна 1)

> Мокап-контракт: `база-проекта-v3/pages/T2d-calendar-days.html` (T2d). Размер M.
> Реюз: gesture из DayTimeline (боевой, iOS-проверен) + обвязка из CalendarWeek.

## Acceptance (из мокапа)
1. Сегмент `Дни · Месяц · Лента` (таб «Неделя» удалён).
2. Вид «Дни»: степпер 2/3/4/7, дефолт 2, запоминается (localStorage `cal.dayCount`).
3. 7 = неделя Пн–Вс; 2/3/4 = окно от якоря (старт=сегодня).
4. `‹ ›`: 2/3/4 сдвиг на N дней; 7 — на неделю.
5. Колонка = timed-блоки (DayTimeline compact) + drag внутри дня (move/resize → onResize→patchTask время).
6. Полоса «весь день» сверху + веха-флажки на числах (порт из CalendarWeek).
7. Тап числа/колонки (пустой) → таб «Задачи» с этой датой. Тап блока → TaskDetail.
8. Лоток «без даты» свёрнут (как в week сейчас).
9. Цвет-легенда убрана.
10. Миграция: active `week` → `days` (дефолт), старый стейт не ломает.

## Файлы
- `types.ts`: `CalendarView = "days"|"month"|"agenda"`; `DayCount = 2|3|4|7`.
- `lib/calDates.ts` (+test): `daysList(anchor,count)` → Date[] (count<7: [anchor..+count-1]; 7: weekDays(anchor)).
- `components/DayTimeline.tsx`: +`compact?:boolean` (laneLeft мал, класс `.dt-compact`; дефолт false = Today 1:1).
- `components/CalendarDays.tsx` (NEW): обвязка — заголовки(имя+число+флаг,тап→onOpenDay) + all-day строка + N×DayTimeline(compact,onResize,onOpen,autoScroll=false).
- `screens/Calendar.tsx`: view default days; dayCount+localStorage; viewWindow/shift/rangeLabel для days; степпер UI; рендер CalendarDays; tray для days; onOpenDay проп.
- `App.tsx`: pendingTodayISO; `onOpenDay(iso)` → setTab today + view timeline + дата; проп в Calendar.
- `screens/Today.tsx`: +`gotoISO?` проп + effect setSelectedISO.
- `theme.css`: `.cd-*` обвязка + `.dt-compact`.
- `tests-e2e/T2-calendar.spec.ts`: week→days, +степпер.

## Edge-кейсы
- Смена count: setAnchor(today) → окно предсказуемо стартует с сегодня (кроме 7=неделя текущего).
- localStorage пуст/битый → дефолт 2.
- DayTimeline compact: НЕ передаём onCreateDraft (создания нет) → жесты создания off, только move/resize.
- undated load: сейчас только в week → переключить на days.
- Все колонки autoScroll=false (иначе N таймлайнов дёргают скролл).
- isToday по каждой колонке отдельно (now-линия только на сегодня).

## Отложено (Волна 2)
cross-day drag, драг из/в лоток, свайп-шторки (edge-swipe УЖЕ в коде App — разобрать на устройстве).

## Гейты
tsc 0 · lint:tokens · vitest (daysList) · e2e T2 (days+stepper) · самопроверка preview-app-mock vs мокап.
