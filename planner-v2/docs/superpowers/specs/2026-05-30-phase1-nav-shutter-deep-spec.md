# Phase 1 deep-spec — навигация-шторка + единый паттерн выбора

<!-- team-org Фаза 1 (product-depth). Опирается на реальный код. -->

## Карта флоу (каждый интерактивный элемент → что при тапе, что открывается/закрывается)

**Входы в навигацию-шторку (Drawer) — ДВА, как решено:**

| Элемент | Где | Тап / жест | Открывает | Закрывает |
|---|---|---|---|---|
| Свайп от левого края (edge-swipe ≥ ~50px вправо, угол горизонтальный) | любой основной экран (Today/Calendar/Goals/Tracking) и ListView | drag от левого края | Drawer поверх текущего экрана | — |
| Хамбургер `IcoMenu` | ListView header (`onMenu`) | тап | сейчас делает `setViewing(null)` → ДОЛЖЕН открывать Drawer | — |
| Таб «Списки» | BottomTabs | тап | `Lists` как полноэкранный экран (второй вход, остаётся) | — |
| Backdrop `.drawer-backdrop` | Drawer | тап | — | Drawer (`onClose`) |
| Свайп влево из тела Drawer | Drawer | drag dx<−50, гориз. | — | Drawer (есть в коде) |

**Внутри Drawer / Lists (один компонент `ProjectTree`, navigation-режим):**

| Элемент | Тап | Открывает | Закрывает Drawer? |
|---|---|---|---|
| Smart-row (Все/Сегодня/…/Входящие/Неделя) | `onSelect({kind:smart})` → `setViewing` | целевой ListView | ДА (Drawer закрывается, экран меняется) |
| Tree-row тело (проект, включая родителя/субкатегорию) | `onSelect({kind:project})` → `setViewing` | ListView проекта | ДА |
| chevron `tree-chev` | `onToggle(id)` (stopPropagation) | раскрывает/сворачивает поддерево in-place | НЕТ |
| `IcoMore` (меню) | `onMenu(p)` | `ProjectMenu` (создать подпроект/ред./пин/удалить) | НЕТ |
| drag (long-press 200мс touch / 6px mouse) | reorder внутри одного родителя | — | НЕТ |
| «+ Проект» строка | `setSheet({create, parentId:null})` | `ProjectSheet` | НЕТ |
| ProjectMenu → «Подпроект» | `setSheet({create, parentId:id})` | `ProjectSheet` с предвыбранным родителем | НЕТ |

**Picker выбора проекта (TaskComposer → composer-bar «проект»):**

| Элемент | Тап | Действие | Закрывает sheet? |
|---|---|---|---|
| composer-bar кнопка «проект» | `openPicker("project")` (blur title) | `ProjectPickerSheet` поверх composer | — |
| Строка «📥 Входящие» | `onPick(null); onClose()` | projectId=null | ДА (single-select, ~140мс) |
| Строка проекта (родитель = категория) | `onPick(p.id); onClose()` | projectId=p.id | ДА |
| Строка субкатегории (depth≥1, напр. Здоровье→Спорт) | `onPick(p.id); onClose()` | projectId=p.id | ДА — **должно вести себя ИДЕНТИЧНО родителю** |
| ✓ маркер | — (визуал текущего выбора) | — | — |

Эталон-боль: в `ProjectPickerSheet` дерево всегда-развёрнуто (нет chevron), каждая строка — single-select. Сейчас в коде это уже `onPick+onClose`. Дыра не в `ProjectPickerSheet`, а в том, что (а) picker строит дерево СВОИМ `walk`, а не `flatten` — расходится с навигацией; (б) субкатегория и родитель тут — обе валидные строки выбора, и это правильно, но это НЕ задокументировано как «выбор всегда до листа», поэтому при добавлении 3-го уровня легко сломать.

## Матрица состояний (поверхность × пусто/загрузка/ошибка/выбрано/частично/край)

| Поверхность | Пусто | Загрузка | Ошибка | Выбрано | Частично | Край |
|---|---|---|---|---|---|---|
| Drawer / Lists (дерево проектов) | нет проектов → видна только «+ Проект» (CTA есть) | `getProjects` пока нет — список пуст, БЕЗ скелетона (дыра: PATTERNS требует скелетон) | `catch → setProjects([])` — НЕОТЛИЧИМО от «пусто», нет ретрая (дыра) | active-row подсвечена | часть поддеревьев свёрнута (expanded:Set) | глубина: indent `depth*22` без clamp (дыра: picker clamp есть, дерево — нет); длинное имя обрезается ellipsis в picker, в дереве — нет |
| Smart-списки | счётчики 0 → строка без бейджа (норм) | `counts=null` → бейджи скрыты | `setCounts(null)` → как «0», молча | active подсвечен | — | счётчик 3-значный — перенос бейджа |
| ProjectPickerSheet | только «Входящие» если 0 проектов (не тупик) | `projects` приходят из родителя; пустой кадр без скелетона | проброс ошибки нет — пустой список | ✓ на текущем | single-select, частичного нет | глубина indent `depth*20` clamp ОТСУТСТВУЕТ в коде (PATTERNS заявляет clamp `min(depth,3)` — рассинхрон) |
| TagPickerSheet | «Тегов пока нет» + поле создания (CTA) | `getTags` пусто до ответа | `catch→[]` молча | active-chip | multi-select частичный = норма | много тегов → wrap |
| ListView | `Empty "Пусто. Жми +"` | нет скелетона, пустой `tasks` | `err` карточка «Ошибка: …», но без кнопки ретрай | — | — | длинный заголовок списка |
| Edge-swipe Drawer | n/a | n/a | n/a | Drawer открыт | drag в процессе (нет visual-drag, бинарно open/close) | свайп конфликтует с гориз-скроллом контента (риск) |

## Edge-кейсы (кейс → предлагаемое поведение)

- **Edge-swipe vs горизонтальный скролл (composer-bar, недельный календарь, чипы тегов):** арми свайп ТОЛЬКО если старт в левой кромке ≤ ~20px И |dx|>|dy|*1.5. Иначе игнор. (Иначе побьёт скролл — это причина, по которой Drawer и удаляли.)
- **Edge-swipe при открытой шторке/composer:** не открывать Drawer поверх Sheet. Drawer и Sheet взаимоисключающи; пока есть `addOpen/picker/viewing-sheet`, edge-swipe выключен.
- **Хамбургер в ListView:** сейчас `onMenu=setViewing(null)` возвращает на таб, НЕ открывает Drawer. Решение: хамбургер открывает Drawer (как заявлено «оба входа»); «назад к табу» — это backdrop/свайп-закрытие Drawer + системный back.
- **Drawer открыт из ListView проекта:** выбор другого списка → закрыть Drawer + сменить `viewing`. Выбор того же проекта → просто закрыть Drawer (no-op перезагрузки).
- **Субкатегория-родитель имеет своих детей (3-й уровень, напр. Здоровье→Спорт→Зал):** в picker'е все 3 уровня — валидные строки выбора (родитель = валидный проект, фиксировано в PATTERNS). Выбор любого = `onPick+onClose`. В навигации каждый имеет chevron, если есть дети.
- **Выбор проекта в composer, проект потом удалён в Drawer (между сессиями):** composer держит `projectId`, при сохранении бэкенд должен фоллбэкнуть в Inbox; UI показывает «Входящие» (`proj?.name ?? "Входящие"`) — уже устойчиво.
- **expanded init только один раз** (`didInitExpand`): новый созданный подпроект форсит expand родителя (`setExpanded add`) — ок. Но если все свернуть вручную, перезаход не сбрасывает — ок (намеренно).
- **Длинное имя проекта в дереве навигации:** нет ellipsis (в picker есть) → обрезать так же.
- **Глубина > 3 в дереве навигации:** indent растёт без clamp → имя уезжает. Клампить как в picker.
- **Reorder во время открытого Drawer + edge-swipe:** во время drag (`dragging`/`activeId`) edge-swipe и swipe-close должны быть выключены (в Drawer уже `if (...dragging) return`).
- **Двойной вход одновременно:** таб «Списки» это экран, Drawer это оверлей. Находясь на табе «Списки», edge-swipe откроет Drawer поверх Lists — дубль контента. Решение: на табе «Списки» edge-swipe Drawer выключить (контент уже на экране).

## Аудит согласованности (сущность → где работает / где расходится / единое правило)

- **Построение дерева проектов:** работает через `flatten` в `ProjectTree` (Drawer, Lists). Расходится: `ProjectPickerSheet` строит СВОЙ `byParent`+`walk` (pickers.tsx:50-61). Единое правило: picker тоже зовёт `flatten(projects)` (без expanded = всегда-развёрнуто) — ровно то, что задумано в lib-комментарии. **Сейчас рассинхрон → к выносу.**
- **Indent вложенности:** ProjectTree=`16+depth*22`, picker=`16+depth*20`, PATTERNS требует clamp `min(depth,3)`. Расходится по числу И clamp отсутствует в обоих. Единое правило: одна константа `INDENT` + `min(depth,3)` в обоих режимах.
- **Single-select выбор:** ProjectPicker ✅ `onPick+onClose`, PriorityPicker ✅. Соответствует PATTERNS (тап=onPick+onClose, ~140мс). Расхождение, которое было болью (категория+субкатегория не закрывали в composer): в текущем коде `ProjectPickerSheet` закрывает на любой строке — значит либо уже починено, либо боль была в более раннем под-picker'е субкатегории, которого в этом файле НЕТ. Единое правило: ЛЮБАЯ строка проекта (любой depth) = single-select onPick+onClose. Зафиксировать в PATTERNS явно: «нет отдельного субкатегория-шага; одно плоское дерево, выбор на любом узле».
- **Multi-select:** TagPicker ✅ toggle + «Готово». Согласовано.
- **Меню проекта / создание подпроекта:** Drawer и Lists — идентичный код (полный дубль `SheetState`, `handleSubmit`, `requestDelete`, `handleReorder`). Расходится только тем, что это копипаста. Единое правило: вынести в общий хук/компонент `ProjectTreePanel`, чтобы Drawer и Lists рендерили одно и то же.
- **Скелетон при загрузке:** PATTERNS требует. Нигде в дереве/picker/ListView нет (catch→[]). Расходится везде. Единое правило: скелетон-строки на время `getProjects/getTasks`.
- **Ошибка отличима от пусто + ретрай:** только ListView имеет «Ошибка: …» (без ретрая); дерево/counts/tags глотают молча. Расходится. Единое правило: отдельное error-состояние с ретраем.

## Reuse-карта (паттерн/компонент → где сейчас / где ДОЛЖЕН жить / согласовано)

| Паттерн/компонент | Где сейчас | Где ДОЛЖЕН жить | Согласовано |
|---|---|---|---|
| `flatten`/`childCountMap` | lib/projectTree.ts; ProjectTree использует; picker — НЕ использует | оба режима через lib | НЕТ (picker дублирует walk) |
| `INDENT` + clamp `min(depth,3)` | ProjectTree=22 без clamp; picker=20 без clamp | одна константа в lib, clamp в обоих | НЕТ |
| Панель «Smart + дерево + Проект»-CTA + меню + ProjectSheet | дублирована Drawer.tsx и Lists.tsx (≈идентичны) | один `ProjectTreePanel` (props: variant drawer/screen) | НЕТ (полный дубль) |
| `Sheet` (swipe-from-grip) | Sheet.tsx, все picker'ы | как есть | ДА |
| Drawer оверлей + edge-swipe | Drawer.tsx цел, но не смонтирован в App; edge-swipe отсутствует | App рендерит Drawer; edge-swipe-хэндлер общий | НЕТ (отвязан, надо вернуть) |
| Single-select правило (onPick+onClose 140мс) | ProjectPicker, PriorityPicker | все single-pick sheet'ы | ДА |
| Multi-select правило (toggle+Готово) | TagPicker | все multi-pick | ДА |
| Хамбургер `IcoMenu` | ListView: `onMenu→setViewing(null)` | должен открывать Drawer | НЕТ (семантика «закрыть», не «меню») |
| `ProjectSheet` (выбор родителя при создании проекта) | используется, не прочитан здесь | проверить: его выбор родителя ДОЛЖЕН быть тем же single-select древо-picker'ом | НЕИЗВЕСТНО (вероятный второй источник «боли субкатегории» — проверить) |

## Открытые развилки (фича-уровень, 2+ разумных поведения — выбор пользователю)

1. **Хамбургер в ListView — что делает?**
   (a) Открывает Drawer-навигацию (третий вход, единая «шторка везде»);
   (b) Остаётся «назад к табу» (`setViewing(null)`), а Drawer только edge-swipe + таб.
   Рекомендация: (a) — иначе хамбургер дублирует системный back и противоречит «шторка возвращается».

2. **Edge-swipe на табе «Списки» (где контент дерева уже на экране).**
   (a) Выключить edge-swipe там (избегаем дубля);
   (b) Разрешить (consistency: жест работает везде одинаково).
   Рекомендация: (a).

3. **Drawer vs полноэкранный «Списки» — это одно или два?**
   (a) Таб «Списки» = тот же `ProjectTreePanel`, что и в Drawer, просто без оверлея (один источник, оба входа в одну сущность);
   (b) Drawer = быстрый доступ (только Smart + пины), полный «Списки» = таб.
   Рекомендация: (a) — «одна сущность — одно поведение».

4. **Заголовок секции Smart-списков:** Drawer пишет «Списки», Lists пишет «Смарт-списки». Унифицировать до одного термина (развилка: «Списки» vs «Смарт-списки»).

5. **Глубина дерева — есть ли жёсткий лимит уровней?** clamp есть только на indent (визуал), но создание подпроекта-подпроекта не ограничено. (a) Разрешить произвольную глубину (indent clamp скрывает); (b) Лимит 3 уровня (категория→субкатегория→лист, как «Здоровье→Спорт→…»), блокировать «+ Подпроект» глубже. Рекомендация: (b) для предсказуемости picker'а.

6. **При выборе проекта в picker — нужен ли отдельный under-sheet для субкатегорий или одно плоское дерево?** Текущий код = одно плоское всегда-развёрнутое дерево (рекомендуется, совпадает с PATTERNS). Альтернатива: drill-in (тап категории → лист субкатегорий) — но это и есть исходная боль (лишний шаг, незакрытие). Рекомендация: плоское дерево, явно зафиксировать в PATTERNS, чтобы никто не вернул drill-in.

**Незакрытый риск для проверки перед реализацией:** `ProjectSheet.tsx` (выбор родителя при создании/редактировании проекта) не прочитан — это вероятный второй источник «боли субкатегории». Его выбор родителя должен использовать тот же `flatten`-древо-picker single-select, иначе рассинхрон сохранится.

Файлы: `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/App.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/components/Drawer.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/components/ProjectTree.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/components/pickers.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/components/TaskComposer.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/screens/Lists.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/components/ListView.tsx`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/lib/projectTree.ts`, `/Users/logovik/ИИ-агенты/Projects/Alexandr/personal-planner/planner-v2/frontend/src/components/ProjectSheet.tsx` (НЕ прочитан — проверить).