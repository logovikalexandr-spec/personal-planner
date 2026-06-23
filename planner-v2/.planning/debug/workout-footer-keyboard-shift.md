---
status: awaiting_human_verify
trigger: "workout-footer-keyboard-shift: на экране тренировки при правке числа iOS-клава сбивает вертикальное расстояние нижней кнопки-футера «Завершить тренировку»"
created: 2026-06-23T00:00:00Z
updated: 2026-06-23T00:00:00Z
---

## Current Focus

hypothesis: Футер `.wl-bottom` = `position:sticky bottom:0` ВНУТРИ скролл-контейнера `.wl-overlay` (fixed inset:0, overflow-y:auto). Sticky прилипает к границе СКРОЛЛ-ПОРТА контейнера, а не к visualViewport. iOS при фокусе инпута (а) ужимает visualViewport под клаву, (б) авто-скроллит инпут в зону видимости — это меняет scrollTop оверлея и/или схлопывает sticky. Прошлый фикс (height=vv.height на оверлее) не помог, потому что sticky-футер всё равно привязан к контенту/скролл-порту, плюс env(safe-area-inset-bottom) добавляет home-inset поверх клавы. Решение by-construction: вынести футер из скролл-контейнера в `position:fixed`, прижатый к низу visualViewport через TOP-якорь (паттерн проекта useBottomAnchor), портал в body.
test: статический разбор CSS/layout + сверка с рабочими паттернами проекта (Sheet.tsx, viewportAnchor.ts)
expecting: подтверждение что sticky-в-fixed-overflow не отслеживает visualViewport
next_action: применить фикс — футер fixed+useBottomAnchor через портал; добавить дебаг-оверлей чисел

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

## Resolution

root_cause: Футер `.wl-bottom` использует `position:sticky bottom:0` внутри скролл-контейнера `.wl-overlay` (fixed+overflow-y:auto). Sticky привязан к границе скролл-порта контейнера и к потоку прокрутки контента, а НЕ к visualViewport. На iOS при фокусе числового инпута: (1) клавиатура ужимает visualViewport снизу, (2) WebKit авто-скроллит фокус-инпут в зону видимости, меняя scrollTop оверлея. Sticky-футер реагирует на это сдвигом/налезанием. Прошлый фикс (height=vv.height на самом оверлее) не устранил причину, т.к. футер остаётся sticky-в-скролле, а не привязан к видимой зоне; вдобавок env(safe-area-inset-bottom) в padding добавляет home-inset поверх клавы.
fix: Футер `.wl-bottom` вынесен из скролл-контейнера в position:fixed, портал в body, прижат к низу visualViewport через существующий рабочий паттерн проекта useBottomAnchor (top = vv.offsetTop + vv.height − offsetHeight; пересчёт на vv.resize/scroll + window scroll capture + ResizeObserver + setTimeout 280мс на анимацию клавы). CSS: sticky→fixed left/right/bottom:0/z-index:70 (bottom:0 = fallback без visualViewport). Откатан провальный effect привязки высоты .wl-overlay в Goals.tsx. Добавлен дебаг-оверлей WlDebugOverlay (флаг localStorage wl-debug или ?wldebug) с живыми числами vv.height/offsetTop, innerHeight, overlay.scrollTop, footer rect.
verification: tsc --noEmit чисто; vite build чисто; vitest 83/83 pass. Device-проверка на iPhone — за владельцем (iOS-клаву нельзя репродить в DevTools).
files_changed: [frontend/src/components/WorkoutLog.tsx, frontend/src/components/workout-log.css, frontend/src/screens/Goals.tsx]
</content>
</invoke>
