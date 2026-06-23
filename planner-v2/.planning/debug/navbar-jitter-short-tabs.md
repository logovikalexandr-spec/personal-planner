---
status: resolved
trigger: "navbar-jitter-short-tabs: Bottom tab bar jitters/twitches ONLY on Gantt and Goals (short tabs) in iOS PWA standalone mode"
created: 2026-06-23T00:00:00Z
updated: 2026-06-23T00:30:00Z
resolved: 2026-06-23
---

## RESOLUTION (confirmed by owner on device — "ок")

TRUE root cause (revealed by owner: "после Pull-to-refresh подлетала нижняя строка вверх"):
the symptom was NOT touch-jitter — it was the bottom tab bar FLYING UP **after** a pull-to-refresh.
PullToRefresh called `location.reload()`; a full reload in iOS standalone PWA on the SHORT tabs
(Gantt/Goals, content < viewport) repositions the `position:fixed; bottom:0` bar upward (post-reload
iOS layout transient). Not fixable by position patches (visualViewport anchor fixed the lift but
jittered on scroll events; preventDefault tweaks missed).

FIX: pull-to-refresh no longer reloads. Soft in-app data refresh instead:
- `lib/refreshSignal.ts` — global `planner:refresh` event; screens subscribe `load()` via `useRefreshSignal`
- `lib/pwa.refreshApp` — dispatch event + background `swReg.update()` (new code on cold-start); NO reload
- `PullToRefresh` resets spinner when refreshApp resolves
Deployed `index-D8ft11z5.js`, health 200.

LESSON: full reload of a fixed-bottom-bar PWA on short/non-scrollable pages causes iOS post-reload
repositioning. Prefer soft in-app refresh over location.reload() for pull-to-refresh.

## Current Focus

hypothesis: PullToRefresh onMove fires on micro-vertical-drags on short tabs (atTop()=true always since window.scrollY=0 and no scrollable ancestor). While claimed="pending" it calls e.preventDefault() to suppress rubber-band. iOS responds to the simultaneous preventDefault on an overscroll by re-compositing the fixed tabbar position relative to the bounced document, causing sub-frame visual displacement. The React setState(setVisual(0)) call is NOT the cause. The cause is iOS compositing the fixed bar relative to the scroll layer when preventDefault is called during an active overscroll gesture on a non-scrollable page. The real fix: eliminate the iOS rubber-band/overscroll entirely on the document level, or suppress it in a way that does NOT create a scroll-position discontinuity from the fixed bar's perspective.
test: Read theme.css overscroll-behavior declarations; verify they apply to all layers. Read PullToRefresh logic for the pending->decide path on short page (no scrollable ancestor). Compare what happens vs a tall page.
expecting: Confirmed: on short tabs every downward micro-touch triggers pending->preventDefault path, causing iOS overscroll compositor jitter on fixed elements.
next_action: IMPLEMENT FIX - the correct fix is to add touch-action: pan-x pinch-zoom (or none) to the .app container via CSS, preventing iOS from running its overscroll physics on the document root when no internal scroller is available. BUT we must not break internal scrollers. Better approach: in PullToRefresh onMove, check if dy movement is too small to be a real pull before calling preventDefault; or don't call preventDefault in "pending" state at all - only call it after claimed="pull" is confirmed. This stops the oscillating "pending->prevent->iOS bounces->repeat" loop.

## Symptoms

expected: Bottom tab bar stays perfectly still on every tab, including short ones (Gantt, Goals).
actual: On Gantt and Goals tabs only, the tab bar visibly jerks/jitters/twitches. Other tabs are stable.
errors: No JS console errors reported.
reproduction: Open app as iOS standalone PWA (Home Screen). Go to Цели or Гант tab. Interact (touch/drag/try to scroll/pull). Bar jitters. The two affected tabs have content shorter than viewport (non-scrollable).
started: Appeared during/after adding pull-to-refresh feature.

## Eliminated

- hypothesis: visualViewport JS anchor on .tabbar causes jitter via vv-event recomputations
  evidence: JS anchor was already removed before this investigation; jitter persists without it
  timestamp: 2026-06-23T00:00:00Z

- hypothesis: overscroll-behavior:none on html/body prevents all iOS rubber-band
  evidence: html,body { overscroll-behavior: none } is in theme.css (line 34), already deployed, jitter persists. iOS WebKit in standalone PWA mode does not fully honor overscroll-behavior:none on the document root when touch events have passive:false preventDefault-capable listeners - the compositor can still shift fixed elements.
  timestamp: 2026-06-23T00:01:00Z

## Evidence

- timestamp: 2026-06-23T00:02:00Z
  checked: PullToRefresh.tsx onMove handler, lines 58-77
  found: In the "pending" state (before decide() resolves), if dy > 0 AND dy >= Math.abs(dx), e.preventDefault() is called (line 65). This happens BEFORE the gesture is claimed. On short tabs, atTop() always returns true (window.scrollY=0, no scrollable ancestor found), so every touchstart sets st.active=true. Any subsequent micro-downward movement (dy>0, dy>=|dx|) triggers this preventDefault in pending state.
  implication: On tall/scrollable tabs, the touch target usually lands inside a scrollable element (calendar, task list), so nearestScroller() finds it and atTop() returns sc.scrollTop<=0, which is true only if the scroller is at top. More importantly, on tall tabs users DO scroll, so after any scrollY>0, atTop() returns false and PTR doesn't activate at all. The tabs feel stable because gestures inside scrollable areas don't route through the document-level bounce.

- timestamp: 2026-06-23T00:03:00Z
  checked: theme.css lines 33-34 and iOS behavior
  found: `html, body { overscroll-behavior: none; }` IS in the CSS. However, this CSS property is advisory - iOS Safari/WebKit in standalone (WKWebView) mode may still perform rubber-band compositing of the scroll layer even with this set, especially when touch listeners with passive:false are present. The key insight: when preventDefault() is called on touchmove, iOS CANCELS the native scroll/overscroll gesture at the DOM level but MAY still shift the rendering layer composites sub-frame. The fixed tabbar's visual position is anchored to the "document scroll offset" in the compositor - if iOS compositor is briefly shifting the scroll offset (even sub-frame, not captured by JS sampler), the fixed bar moves.

- timestamp: 2026-06-23T00:04:00Z
  checked: PullToRefresh.tsx atTop() function, lines 22-36
  found: atTop() falls through to `return (window.scrollY || document.documentElement.scrollTop || 0) <= 0` when no nearestScroller or daytimeline is found. On Goals/Gantt, there are no elements with overflow-y:auto/scroll AND scrollHeight > clientHeight+1 (content shorter than viewport). So atTop()=true always. st.active=true on every single-finger touchstart.
  implication: Every touch on short tabs activates PTR. Every micro-downward motion (dy>0 && dy>=|dx|) calls e.preventDefault() in pending state. This is a continual feedback loop: touch down → PTR active → any downward flick → preventDefault → iOS compositing effect → bar jitters.

- timestamp: 2026-06-23T00:05:00Z
  checked: Difference between short tabs (Goals, Gantt) vs tall tabs (Today, Calendar, Tracking)
  found: Today has DayTimeline with GPU-transform scroll (special case in atTop). Calendar and Tracking have scrollable content (overflow-y:auto elements with scrollHeight > clientHeight). On Calendar and Tracking, when user touches content area, nearestScroller() finds the scroller and returns it. If scroller.scrollTop > 0 (user has scrolled), atTop()=false and PTR doesn't activate → no jitter. Even when at top, the subsequent downward motion on a NATIVE-scrollable element triggers native scroll behavior first (since the element is scrollable), and iOS recognizes the gesture as a scroll not a bounce.
  implication: The structural difference is that Gantt and Goals have NO internal scrollable container whose content fills/overflows the viewport. The document itself is the only "scroll" layer, and it cannot scroll (content shorter than viewport). iOS in this state treats any downward drag as an overscroll bounce candidate.

## Resolution

root_cause: PullToRefresh calls e.preventDefault() on touchmove BEFORE the gesture is confirmed as a pull (while claimed="pending"), specifically when dy > 0 and dy >= |dx|. On short tabs (Gantt/Goals), there are no internal scrollable containers, so atTop() always returns true, making every touch an active PTR candidate. iOS WebKit responds to this preventDefault on micro-drags by running its overscroll compositor adjustment on the document scroll layer, which visually shifts the position:fixed tabbar for sub-frame durations. The bar appears to jitter. On tall tabs this doesn't happen because: (a) touches usually land on internal scrollable elements that iOS handles natively, (b) after any scrolling on those tabs, atTop() returns false. The overscroll-behavior:none CSS does not fully suppress this compositing artifact when passive:false preventDefault handlers are present.

fix: Move the e.preventDefault() call in the "pending" state to AFTER the decide() function confirms "pull". Do NOT call preventDefault during the pending evaluation phase. Only call preventDefault when claimed==="pull" is confirmed. This eliminates the spurious preventDefault calls on micro-drags that trigger iOS compositor jitter. The existing logic already calls preventDefault unconditionally inside the claimed==="pull" branch (line 72) which is correct.

verification: Bundle deployed to prod (hash Bc8l_Mbh). Old pattern `dy>0&&dy>=Math.abs(dx)` absent from bundle. New flow confirmed: `"pending")return}if(a.claimed==="pull"` — no preventDefault between pending and pull. Health 200. Awaiting device confirmation from owner on iPhone PWA (Гант + Цели tabs).
files_changed: [frontend/src/components/PullToRefresh.tsx]
