type P = { active?: boolean };
const stroke = (a?: boolean) => (a ? "var(--accent)" : "currentColor");

export function IcoToday({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14h4" />
    </svg>
  );
}
export function IcoCalendar({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" />
    </svg>
  );
}
export function IcoTasks({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l2 2 3-3M4 12l2 2 3-3M4 18l2 2 3-3M13 6h7M13 12h7M13 18h7" />
    </svg>
  );
}
export function IcoGoals({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" />
    </svg>
  );
}
export function IcoProjects({ active }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
export function IcoMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

const sv = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IcoAll = () => sv(<><path d="M4 6h16M4 12h16M4 18h10" /></>);
export const IcoTodaySmall = () => sv(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" /></>);
export const IcoTomorrow = () => sv(<><path d="M3 18h18M12 3v6M9 6l3-3 3 3M5 14l1.5-1.5M19 14l-1.5-1.5" /></>);
export const IcoNext7 = () => sv(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M7 13h3M7 17h3" /></>);
export const IcoInbox = () => sv(<><path d="M3 13l2.5-7A2 2 0 0 1 7.4 5h9.2a2 2 0 0 1 1.9 1.3L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></>);
export const IcoWeekPlan = () => sv(<><path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6M9 16h4" /></>);
export const IcoDot = () => sv(<circle cx="12" cy="12" r="4.5" />);
export const IcoPlus = () => sv(<><path d="M12 5v14M5 12h14" /></>);
export const IcoMore = () => sv(<><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>);
export const IcoSend = () => sv(<><path d="M12 19V5M6 11l6-6 6 6" /></>);
export const IcoExpand = () => sv(<><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></>);

/* ── Wave 1 nav-иконки (color-swap через stroke(active), constant strokeWidth 2) ── */
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

/* ── Wave 1 chrome-глифы (через sv(), stroke 1.9, размер задаёт контекст) ── */
export const IcoChevron = () => sv(<path d="M9 6l6 6-6 6" />);                       /* шеврон строк/entry-card (замена «›»/«▸») */
export const IcoRepeatMicro = () => sv(<><path d="M4 9a8 8 0 0 1 14-3M20 15a8 8 0 0 1-14 3" /><path d="M18 3v3.5h-3.5M6 21v-3.5h3.5" /></>); /* таймлайн-мета 12px (замена 🔁) */
export const IcoBellMicro = () => sv(<><path d="M18 9a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M10.5 20a2 2 0 0 0 3 0" /></>); /* таймлайн-мета 12px (замена ⏰) */
export const IcoPin = () => sv(<><path d="M9 4h6M10 4l-1 7-3 2v2h12v-2l-3-2-1-7M12 17v3" /></>); /* pin-маркер ~14px (замена 📌) */

/* ── Wave 2 — TaskDetail chrome-глифы (через sv(), размер задаёт контекст) ── */
export const IcoBack = () => sv(<path d="M15 18l-6-6 6-6" />);                          /* стрелка назад top-bar */
export const IcoClose = () => sv(<><path d="M18 6L6 18M6 6l12 12" /></>);                /* крест (закрыть/отмена) */
export const IcoCalendar2 = () => sv(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>); /* дата-строка детали */
export const IcoClock = () => sv(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>); /* время */
export const IcoList2 = () => sv(<><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" /></>);  /* список/проект-строка */
export const IcoRepeat = () => sv(<><path d="M4 9a8 8 0 0 1 14-3l3 3M20 15a8 8 0 0 1-14 3l-3-3" /><path d="M21 3v6h-6M3 21v-6h6" /></>); /* повтор-строка детали */
export const IcoBell = () => sv(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>); /* напоминания-строка */
export const IcoTag = () => sv(<><path d="M20.6 13.8L12 22l-8.6-8.2A5.5 5.5 0 0 1 12 5a5.5 5.5 0 0 1 8.6 8.8z" /><circle cx="15.5" cy="9" r="1.3" /></>); /* теги-строка */
export const IcoTrash = () => sv(<><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4h6v3" /></>); /* удалить */
export const IcoXCircle = () => sv(<><path d="M5 5l14 14M5 19L19 5" /></>);              /* Won't Do (overflow-бар) */
export const IcoCheck = () => sv(<path d="M5 12l5 5L20 6" />);                            /* галочка (чеклист done) */

/* ── Wave 2 F2 — свайп-действия / batch / multi-select ── */
export const IcoMove = () => sv(<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></>); /* «В список» (свайп/batch) */
export const IcoFlag = () => sv(<><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>);             /* приоритет (batch) */
export const IcoSelectCircle = ({ on }: { on?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={on ? "var(--accent)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {on
      ? <><circle cx="12" cy="12" r="9" fill="var(--accent)" stroke="none" /><path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2.4" /></>
      : <circle cx="12" cy="12" r="9" />}
  </svg>
);  /* кружок выбора строки в режиме multi-select (заливка = выбрано) */
