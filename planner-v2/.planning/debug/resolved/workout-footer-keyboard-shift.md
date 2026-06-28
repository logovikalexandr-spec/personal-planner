---
status: resolved
trigger: "workout-footer-keyboard-shift: на экране тренировки при правке числа iOS-клава сбивает вертикальное расстояние нижней кнопки-футера «Завершить тренировку»"
created: 2026-06-23T00:00:00Z
updated: 2026-06-28T05:00:00Z
---

## Current Focus

hypothesis: РЕШЕНО ✅ (владелец device-verify: «ПОБЕДА!!!» — полоса ушла везде, футер ок, после клавы не застревает). Три бага закрыты: (1) футер всплывал → убрали fixed-футер, кнопка в конце скролла .wl-body; (2) freeze body — НЕВЕРНЫЙ диагноз (думали keyboard), откачен; (3) ИСТИННЫЙ корень чёрной полосы/62px = black-translucent+viewport-fit:cover дают ICB=812, `height:100%`/`100dvh` резолвились в 812 → 62px (812..874) canvas-полоса → фикс: 100vh во всех full-screen правилах.
test: tsc/build/vitest зелёные + device-verify ✅
expecting: —
next_action: финализировано (архив + knowledge base). Коммит делает оркестратор (один воз).

## Symptoms

expected: Правишь число → клава открывается → кнопка «Завершить» стоит над клавой; клава закрылась → кнопка у нижнего края без дыры. Расстояние не скачет.
actual: При правке числа расстояние нижней строки-футера сбивается. На клаве футер налезает/уезжает; после закрытия — снизу дыра, кнопка не у края.
errors: нет (визуальный/layout-баг)
reproduction: iPhone PWA standalone → Цели → Рекомпозиция → 🏋 Тренировки → тап числа (.wl-num-input, autoFocus, select on focus) → numeric-клава → смотреть «Завершить тренировку».
started: давний баг, всплывал раньше. Две попытки фикса провалились.

## Eliminated

- hypothesis: Привязать высоту `.wl-overlay` к visualViewport (height=vv.height, top=vv.offsetTop) починит sticky-футер
  evidence: ЗАДЕПЛОЕНО → владелец «всё то же самое». Sticky bottom:0 прилипает к границе скролл-порта контейнера, а не к вьюпорту; ужать высоту контейнера недостаточно — sticky остаётся в потоке скролла, iOS auto-scroll-into-view фокус-инпута сдвигает scrollTop и отлепляет/сдвигает sticky. Плюс env(safe-area-inset-bottom) в padding футера добавляет home-inset даже когда клава съела низ.
  timestamp: 2026-06-23 (до этой сессии, со слов оркестратора)
- hypothesis: подскролл черновика / заморозка fitHeight при editing
  evidence: первая слепая попытка, не помогла (со слов оркестратора)
  timestamp: ранее

## Evidence

- timestamp: 2026-06-23
  checked: workout-log.css `.wl-overlay`/`.wl`/`.wl-bottom`/`.wl-head`
  found: `.wl-overlay` = position:fixed inset:0 overflow-y:auto (скролл-контейнер). `.wl` = min-height:100% flex-col (контент). `.wl-bottom` = position:sticky bottom:0 padding ...calc(12px+env(safe-area-inset-bottom)), фон linear-gradient. `.wl-head` = sticky top:0.
  implication: Sticky-футер позиционируется относительно ближайшего скроллящего предка (.wl-overlay), bottom:0 = низ скролл-ПОРТА. Когда iOS меняет visualViewport (клава) и/или скроллит контент чтобы показать инпут, sticky остаётся привязан к скролл-боксу, не к видимой зоне.
- timestamp: 2026-06-23
  checked: lib/viewportAnchor.ts (useBottomAnchor) — существующий рабочий паттерн проекта
  found: Комментарий прямо фиксирует: «position:fixed + bottom глючит в Telegram iOS WebView — при открытой клавиатуре и нулевом скролле элемент улетает вверх». Решение: top = vv.offsetTop + vv.height − offsetHeight, пересчёт на vv.resize/scroll + window scroll capture + ResizeObserver + setTimeout(280) дождаться анимации клавы. Используется баром «Готово» и quick-add.
  implication: В проекте УЖЕ есть проверенный by-construction способ прижать футер к низу видимого вьюпорта. Его и надо применить к `.wl-bottom`.
- timestamp: 2026-06-23
  checked: components/Sheet.tsx — почему портал в body
  found: «Портал в body: иначе шит внутри Drawer (transform+will-change → containing block для position:fixed) позиционируется относительно шторки = висит в воздухе». `.wl-overlay` рендерится внутри `.screen.t4` внутри Drawer-структуры табов — те же containing-block риски для fixed.
  implication: Футер как position:fixed надёжнее портально-в-body, иначе transform-предок (анимация таба/drawer) сделает fixed относительным к нему, а не к вьюпорту.
- timestamp: 2026-06-28
  checked: текущий код (бандл _wB0Vkel) — WorkoutLog.tsx WorkoutFooter/.wl-bottom, workout-log.css, Goals.tsx vv-эффекты
  found: Футер УЖЕ переведён из fixed/sticky в простой flex:0 нижний элемент `.wl-bottom` внутри `.wl` (overlay flex-col, `.wl-body` flex:1 скроллер). Оверлей `.wl-overlay` height:100dvh(=874). При клаве Goals.tsx вешает `.wl-kb-open`→футер display:none. И всё равно «работает криво».
  implication: Перевод в flex НЕ убрал класс — потому что элемент ВСЁ РАВНО прижат к низу 874-оверлея, а видимая зона при клаве = 498. Низ оверлея (498..874) под полупрозрачным баром клавы → сквозь него мелькает контент `.wl-body`/момент до применения `.wl-kb-open`. Сама сущность «низ-привязанный элемент на vv-нестабильном экране» = корень. Лечить расчёт бессмысленно — надо удалить сущность.
- timestamp: 2026-06-28
  checked: оценка радикального варианта против всех 9 known-fail
  found: Кнопка в конце потока `.wl-body` (не у низа вьюпорта) by-construction не воспроизводит: (1) всплытие — нет bottom-привязки; (2) letterbox-полоса — нет элемента у низа; (3) контент-под-футером — кнопка САМА контент; (4) bleed таб-бара — решён отдельно body.wl-active, не регрессирует; (5-7) vv-сайзинг оверлея больше не нужен (убираем .wl-kb-open) → нет всплытия в покое/при клаве; (9) скрытие футера не нужно. UX-цена: доскролл до конца = норма для длинной формы, юзер после правки последнего подхода уже внизу, черновик автосейвится.
  implication: Радикальный вариант устраняет ВЕСЬ класс футер-багов, а не симптом. Применили → verify на устройстве: футер-баг УШЁЛ.

- timestamp: 2026-06-28 (новый баг)
  checked: App.tsx:160-180 — глобальный механизм блокировки скролла фона при оверлеях
  found: В проекте УЖЕ есть проверенный фикс «экран улетает при фокусе инпута»: для оверлеев с autoFocus-инпутом (quickOpen / openTaskId=TaskDetail) App вешает на body `position:fixed; top:-scrollY` НА ВРЕМЯ оверлея, а на закрытие восстанавливает + `window.scrollTo(0, y)`. Это ЗАМОРАЖИВАЕТ документ → iOS физически не может проскроллить layout-вьюпорт под клаву. Комментарий прямо называет симптом «экран улетает» / «снизу чёрный провал ≈scrollY». TaskDetail (.detail-overlay = fixed inset:0 + autoFocus) этим покрыт и НЕ страдает.
  implication: Это ровно класс нового бага. .wl-overlay структурно идентичен .detail-overlay (полноэкранный fixed + autoFocus-инпут), НО рендерится внутри Goals и НЕ входит в App.anyOverlay → механизм body-lock для него НЕ включается → iOS скроллит документ под клаву и не возвращает → застревает на всех табах (body/документ общий).
  implication2: Корень нового бага = workout-оверлей обходит общий body-lock. Фикс by-construction = подключить .wl-overlay к ТОМУ ЖЕ механизму (заморозка body на время оверлея). Замороженный документ не может уехать → нет «застревания» ни в трени, ни после на других табах.

- timestamp: 2026-06-28 (ОПРОВЕРЖЕНИЕ bug-2 диагноза + истинный корень)
  checked: device-скриншоты после деплоя bug-2 фикса + статический разбор index.html/theme.css + research black-translucent
  found: bug-2 диагноз БЫЛ НЕВЕРЕН. Новые факты: чёрная полоса снизу теперь ПО ДЕФОЛТУ, БЕЗ клавы, на ВСЕХ табах (зашёл в трень — полоса; вышел в Цели — полоса). Клавиатура не участвует → баг СТРУКТУРНЫЙ, не keyboard. Моя freeze-правка (body position:fixed) сделала полосу постоянной → ОТКАЧЕНА. Device-замер СТАБИЛЬНО: documentElement.clientHeight=812, window.innerHeight=874, экран физически 874. Разница ВСЕГДА 62px. index.html: `apple-mobile-web-app-status-bar-style:black-translucent` + viewport-fit=cover. theme.css:31 `html,body,#root{height:100%}`.
  found2 (research, sources в ответе): height:100% резолвится против ICB, который при cover+black-translucent НЕ включает зону под статус-баром → ICB=812. `100dvh` НЕнадёжен на cold-start (не «exercised»). `100vh` в standalone (нет тулбара) сходится к ПОЛНОМУ экрану 874 и работает с холодного старта; vh = large viewport, не качается под клаву.
  implication: ИСТИННЫЙ корень всех «полос/62px» = база высоты документа `height:100%` (=812 ICB) + `bottom:0`/`100dvh`, считающиеся от 812. Низ контента/таб-бара=812, зона 812..874 непокрыта = canvas-фон = чёрная полоса. Фикс = перевести базу высоты на 100vh (=874). Это глобальный структурный фикс, не workout-локальный.

## Resolution

root_cause: ПЕРВОПРИЧИНА = наличие на экране ЛЮБОГО элемента, ПРИЖАТОГО К НИЗУ вьюпорта (sticky/fixed/flex-bottom внутри 100dvh-оверлея), в условиях iOS standalone PWA, где клавиатура ужимает visualViewport (874→498), а layout-вьюпорт/100dvh-оверлей остаётся 874. Любая «привязка к низу» обязана непрерывно отслеживать качели vv (812↔874 в покое от статус-бара/Island, →498 с клавой) и iOS auto-scroll-into-view — это и даёт ВЕСЬ класс: всплытие футера в середину, чёрная letterbox-полоса (зона ниже схлопнутого вьюпорта красится только canvas-фоном body, CSS туда не рисует), зазор/перекрытие подхода, bleed экрана Целей+таб-бара сквозь полупрозрачный бар клавы (низ 874-оверлея 498..874 под клавой). 20+ попыток (sticky, fixed+портал+vv-якорь, кламп, vv-сайзинг оверлея, display:none футера при клаве) чинили РАСЧЁТ позиции элемента-у-низа — но не устраняли саму сущность, поэтому каждый фикс лечил один симптом и плодил другой.
fix: Удалена сущность «элемент у низа вьюпорта». Кнопка «Завершить/Отменить тренировку» (`.wl-action`) теперь обычный последний элемент ПОТОКА в скроллере `.wl-body` (после «Ревью тренировки»), а не футер. Нет элемента, прижатого к низу экрана → by-construction нечему всплывать, оставлять letterbox-полосу, просвечивать сквозь бар клавы. Удалены: `WorkoutFooter`/`.wl-bottom`, vv-эффект `.wl-kb-open` в Goals.tsx (детект клавы больше не нужен), `wlOverlayRef`. `.wl-overlay` остаётся простым height:100dvh. `body.wl-active` (прячет общий таб-бар/FAB за оверлеем) СОХРАНЁН — это независимый правильный механизм, не регрессирует. Снята вся диагностика: `WlDebugOverlay`, `BUILD_TAG` в шапке, скрытый 3-тап-тоггл по заголовку, CSS `.wl-debug`, импорт `createPortal`.
verification: tsc -b → 0; vite build → 0 (бандл index-Bb3hV012.js); vitest 83/83. DEVICE-VERIFY ✅ — футер-баг ушёл, кнопка в конце скролла не всплывает.

---
БАГ 2 (вскрылся после фикса 1): «после открытия+закрытия iOS-клавы весь экран застревает ужатым (контент вверху ~70%, снизу чёрная полоса ~30%), протекает на ВСЕ табы».
root_cause_2: workout-оверлей (.wl-overlay) — полноэкранный fixed-оверлей с autoFocus-инпутом (.wl-num-input), структурно идентичен .detail-overlay (TaskDetail). В App.tsx есть проверенный механизм против бага «экран улетает при фокусе инпута»: на время input-оверлеев (quick-add, TaskDetail) body замораживается position:fixed; top:-scrollY, на закрытие — restore + window.scrollTo(0,y). Это не даёт iOS проскроллить layout-вьюпорт под клаву. НО .wl-overlay рендерится внутри Goals, вне App.anyOverlay → механизм его НЕ покрывал. Поэтому autoFocus-инпут трени скроллил документ под клаву, iOS после dismiss не возвращал → застревание; т.к. body/документ общий для всех табов — протекало везде до перезапуска.
fix_2: Goals.tsx — при открытой трени (workoutGoalId != null) применяем ТОТ ЖЕ body-lock, что App.tsx для input-оверлеев: запоминаем scrollY, body position:fixed; top:-y; left/right/width; на закрытие восстанавливаем + window.scrollTo(0,y). Замороженный документ физически не может уехать → баг by-construction невозможен; .wl-overlay (fixed/100dvh) от body-scroll не зависит, виден целиком. Объединено с существующим body.wl-active в один эффект.
verification_2: НЕВЕРНЫЙ ДИАГНОЗ. После деплоя стало ХУЖЕ — чёрная полоса стала постоянной (freeze body position:fixed усугубил). fix_2 ОТКАЧЕН (Goals.tsx вернул к простому body.wl-active toggle без заморозки). Урок: симптом «чёрная полоса» был ошибочно отнесён к keyboard, хотя новые скриншоты показали полосу БЕЗ клавы.

---
БАГ 3 = ИСТИННЫЙ КОРЕНЬ всех «полос/62px» (структурный, НЕ keyboard).
root_cause_3: device-замер СТАБИЛЬНО (без клавы, все табы): documentElement.clientHeight=812, window.innerHeight=874, экран физически 874 → разница ВСЕГДА 62px. index.html: `apple-mobile-web-app-status-bar-style: black-translucent` + `viewport-fit=cover`. При этой комбинации iOS standalone PWA даёт initial containing block (ICB) высотой 812 (исключает зону под статус-баром/Dynamic Island = 62px). theme.css `html,body,#root{height:100%}` резолвится против ICB → ДОКУМЕНТ высотой 812. Низ контента/таб-бара (`.app min-height:100dvh`, `.tabbar bottom:0`, оверлеи `inset:0`/`100dvh`) садится на 812; зона 812..874 (62px) непокрыта документом → красится canvas-фоном браузера = ЧЁРНАЯ ПОЛОСА снизу, на всех табах, без клавы. Research (sources): height:100% против ICB не учитывает зону под статус-баром при cover+black-translucent; 100dvh ненадёжен на cold-start; 100vh в standalone сходится к полному экрану 874 и стабилен с холодного старта (vh = large viewport, не качается под клаву).
fix_3: Структурная замена базы высоты на 100vh (=874, полный экран). theme.css: `html,body,#root` 100%→100vh; `.app` min-height 100dvh→100vh; `.drawer` 100dvh→100vh; `.detail-overlay` inset:0→top/left/right:0+height:100vh; `.screen.detail` 100dvh→100vh; `.token-gate` 100dvh→100vh. workout-log.css: `.wl-overlay` 100dvh→100vh. Документ теперь 874 → красится --bg до реального низа, fixed-bottom (таб-бар) и оверлеи достают 874, чёрной полосы нет ни в трени, ни на табах, без клавы и после клавы. Глобальный фикс (не workout-локальный). ВАЖНО: status-bar-style не трогал (менялся бы только после переустановки PWA) — 100vh решает без этого.
verification_3: tsc -b → 0; vite build → 0 (новый бандл index-CpUx3dCH.js / index-DKqKVfOQ.css); vitest 83/83. Device-verify за владельцем (iOS ICB-quirk нельзя репродить в CDP/десктоп — Chrome не воспроизводит 812≠874; опора на device-замер + research, как требует мета-урок сессии).
files_changed_3: [frontend/src/theme.css, frontend/src/components/workout-log.css, frontend/src/screens/Goals.tsx (откат freeze)]
known_clean: footer-фикс (BUG 1) НЕ тронут — рабочий (.wl-action кнопка в конце скролла, device-verify ✅).

