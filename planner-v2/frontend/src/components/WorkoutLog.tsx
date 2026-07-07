import { useEffect, useMemo, useRef, useState } from "react";
import "./workout-log.css";

/* ── Типы (для мокапа локально; при сборке переедут в types.ts) ──────────── */
export interface WExercise { id: number; name: string; muscle_group: string }
export interface WTemplateExercise {
  exercise_id: number; target_sets: number; rep_low: number; rep_high: number; coach_target_weight?: number | null;
}
export interface WTemplate { id: number; name: string; exercises: WTemplateExercise[] }
export interface WSet {
  exercise_id: number; set_index: number; weight: number; reps: number; rpe?: number | null; done?: boolean; note?: string | null;
}
export interface WSession {
  id: number; date: string; template_name: string; duration_minutes?: number | null;
  review_note?: string | null; coach_note?: string | null; set_count: number;
}
export interface WHistPoint { date: string; top_1rm: number; best_set: { weight: number; reps: number }; total_volume: number }

export interface WorkoutApi {
  getTemplates(): Promise<WTemplate[]>;
  getExercises(): Promise<WExercise[]>;
  getWorkouts(): Promise<WSession[]>;
  getWorkoutSets(sessionId: number): Promise<WSet[]>;
  getHistory(exerciseId: number): Promise<WHistPoint[]>;
  lastSets(exerciseId: number): Promise<WSet[]>;
  completeSession(input: { template_id: number; template_name: string; sets: WSet[]; review_note: string }): Promise<{ coach_note: string }>;
  cancelSession?(id: number): Promise<void>;
  // Автосейв-на-сервер (по ходу трени, не только в конце). Опциональны: превью-мок их не даёт.
  startSession?(input: { template_id: number; date: string }): Promise<number>;
  putSets?(sid: number, sets: WSet[]): Promise<void>;
  finishSession?(sid: number, review: string): Promise<{ coach_note: string }>;
}

/* ── Иконки (inline SVG) ─────────────────────────────────────────────────── */
const svg = (d: React.ReactNode, w = 20) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const IcoBack = () => svg(<path d="M15 18l-6-6 6-6" />);
const IcoChart = () => svg(<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 2 4-5" /></>);
const IcoChevR = () => svg(<path d="M9 6l6 6-6 6" />, 16);
const IcoChevD = () => svg(<path d="M6 9l6 6 6-6" />, 16);
const IcoPlus = () => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, 18);
const IcoCheck = () => svg(<path d="M5 12l5 5L20 7" />, 16);
const IcoTrophy = () => svg(<><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M5 4H3v2a3 3 0 0 0 3 3" /><path d="M19 4h2v2a3 3 0 0 1-3 3" /></>, 24);

/* ── Поле числа: тап → ввод (без плюс/минус) ─────────────────────────────── */
function EditNum({ value, unit, onChange }: { value: number; unit?: string; onChange: (v: number) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  if (edit) {
    return (
      <input className="wl-num-input" autoFocus inputMode="decimal" value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const v = parseFloat(draft.replace(",", ".")); onChange(isNaN(v) ? value : v); setEdit(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    );
  }
  return (
    <button className="wl-num" onClick={() => { setDraft(String(value)); setEdit(true); }}>
      <span className="wl-num-val"><span className="mono">{value}</span>{unit && <span className="wl-num-u">{unit}</span>}</span>
    </button>
  );
}

/* ── Строка подхода: тап-правка, зажатие номера → удалить ─────────────────── */
function SetRow({ n, row, onChange, onDelete }: { n: number; row: WSet; onChange: (p: Partial<WSet>) => void; onDelete: () => void }) {
  const timer = useRef(0);
  const start = () => { timer.current = window.setTimeout(() => { if (window.confirm("Удалить подход?")) onDelete(); }, 500); };
  const stop = () => window.clearTimeout(timer.current);
  return (
    <div className={"wl-setrow" + (row.done ? " done" : "")}>
      <button className="wl-idx" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} title="зажми → удалить">{n}</button>
      <EditNum value={row.weight} unit="кг" onChange={(w) => onChange({ weight: w })} />
      <EditNum value={row.reps} onChange={(r) => onChange({ reps: r })} />
      <EditNum value={row.rpe ?? 0} onChange={(v) => onChange({ rpe: v })} />
      <button className={"wl-check" + (row.done ? " on" : "")} onClick={() => onChange({ done: !row.done })} aria-label="сделал">
        {row.done ? <IcoCheck /> : null}
      </button>
    </div>
  );
}

/* ── График ──────────────────────────────────────────────────────────────── */
function ProgressChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) return <div className="skeleton" style={{ height: 140 }} />;
  const W = 320, H = 140, pad = 8;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (data.length - 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <polygon points={`${pad},${H - pad} ${pts} ${W - pad},${H - pad}`} fill="var(--accent-soft)" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 4 : 2.5} fill="var(--accent)" />)}
    </svg>
  );
}

type LiveSets = Record<number, WSet[]>;

export function WorkoutLog({ goalId, goalName, onBack, api }: { goalId: number; goalName: string; onBack: () => void; api: WorkoutApi }) {
  void goalId;
  const [view, setView] = useState<{ m: "list" } | { m: "active"; t: WTemplate; existing?: WSession } | { m: "exercise"; ex: WExercise }>({ m: "list" });
  const [templates, setTemplates] = useState<WTemplate[]>([]);
  const [exercises, setExercises] = useState<WExercise[]>([]);
  const [sessions, setSessions] = useState<WSession[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const exMap = useMemo(() => Object.fromEntries(exercises.map((e) => [e.id, e])), [exercises]);

  useEffect(() => {
    void Promise.all([api.getTemplates(), api.getExercises(), api.getWorkouts()]).then(([t, e, s]) => {
      setTemplates(t); setExercises(e); setSessions(s); setReady(true);
    });
  }, [api]);

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if (!ready) {
    return <div className="wl"><Header title="Тренировки" sub={goalName} onBack={onBack} />
      <div className="wl-body"><div className="skeleton" style={{ height: 72, marginBottom: 10 }} /><div className="skeleton" style={{ height: 72 }} /></div></div>;
  }

  if (view.m === "active") {
    return <ActiveSession template={view.t} existing={view.existing} exMap={exMap} api={api} onOpenExercise={(ex) => setView({ m: "exercise", ex })}
      onBack={() => setView({ m: "list" })}
      onDone={(s) => { setSessions((prev) => [s, ...prev]); setView({ m: "list" }); }}
      onCancel={(id) => { void api.cancelSession?.(id); setSessions((prev) => prev.filter((x) => x.id !== id)); setView({ m: "list" }); }} />;
  }
  if (view.m === "exercise") return <ExerciseHistory ex={view.ex} api={api} onBack={() => setView({ m: "list" })} />;

  /* ── Вид: список ── */
  const monNow = currentMonday();
  const doneNames = new Set(sessions.filter((s) => sameWeek(s.date, monNow)).map((s) => s.template_name));
  const nextName = templates.find((t) => !doneNames.has(t.name))?.name;
  const weekSessions = sessions.filter((s) => sameWeek(s.date, monNow));
  const groups = groupSessions(sessions);

  return (
    <div className="wl">
      <Header title="Тренировки" sub={goalName} onBack={onBack} />
      <div className="wl-body">
        <div className="wl-weeknow">
          <div className="wl-weeknow-range">Эта неделя · {weekRangeNow()}</div>
          <div className="wl-weeknow-prog">{doneNames.size} из {templates.length} тренировок</div>
        </div>

        <div className="section-label">Начать тренировку</div>
        <div className="list">
          {templates.map((t) => {
            const done = doneNames.has(t.name);
            const isNext = !done && t.name === nextName;
            return (
              <button key={t.id} className={"wl-tpl" + (isNext ? " next" : "") + (done ? " is-done" : "")} onClick={() => setView({ m: "active", t })}>
                <span className="wl-tpl-ico">{tplEmoji(t.name)}</span>
                <span className="grow" style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{done ? "сделана на этой неделе" : `${t.exercises.length} упражнений`}</div>
                </span>
                {isNext && <span className="wl-next-badge">следующая</span>}
                {done ? <span className="wl-tpl-done"><IcoCheck /></span> : <span className="wl-tpl-chev"><IcoChevR /></span>}
              </button>
            );
          })}
        </div>

        {weekSessions.length > 0 && (
          <div className="wl-weeksum">
            <span className="wl-weeksum-emo"><IcoTrophy /></span>
            <div className="grow">
              <div className="wl-weeksum-title">{weekSessions.length >= templates.length ? "Неделя закрыта!" : "Итоги недели"}</div>
              <div className="muted" style={{ fontSize: 12 }}>{weekSessions.length} из {templates.length} тренировок</div>
            </div>
            {weekSessions.length >= templates.length && <span className="wl-tpl-done"><IcoCheck /></span>}
          </div>
        )}

        <div className="section-label">История</div>
        {sessions.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "8px 2px" }}>Пока пусто — начни первую тренировку.</div>}
        {groups.map((mon) => {
          const moOpen = open.has(mon.key);
          const cnt = mon.weeks.reduce((a, w) => a + w.items.length, 0);
          return (
            <div key={mon.key} className="wl-mgroup">
              <button className="wl-month" onClick={() => toggle(mon.key)}>
                <span className={"wl-acc-chev" + (moOpen ? " open" : "")}><IcoChevD /></span>
                <span className="grow" style={{ textAlign: "left" }}>{mon.label}</span>
                <span className="wl-acc-cnt">{cnt}</span>
              </button>
              {moOpen && mon.weeks.map((wk) => {
                const wkOpen = open.has(wk.key);
                return (
                  <div key={wk.key} className="wl-wgroup">
                    <button className="wl-week" onClick={() => toggle(wk.key)}>
                      <span className={"wl-acc-chev" + (wkOpen ? " open" : "")}><IcoChevD /></span>
                      <span className="grow" style={{ textAlign: "left" }}>{wk.label}</span>
                      <span className="wl-acc-cnt">{wk.items.length}</span>
                    </button>
                    {wkOpen && (
                      <div className="list">
                        {wk.items.map((s) => {
                          const t = templates.find((x) => x.name === s.template_name);
                          return (
                          <div key={s.id} className="card wl-daycard" style={{ padding: 14 }} onClick={() => t && setView({ m: "active", t, existing: s })}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                              <span className="wl-day-check"><IcoCheck /></span>
                              <div style={{ fontWeight: 600, fontSize: 15 }}>{weekdayLabel(s.date)}</div>
                              <div className="muted mono" style={{ fontSize: 12, marginLeft: "auto" }}>{fmtDate(s.date)}</div>
                              <span className="wl-tpl-chev"><IcoChevR /></span>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--accent)", marginTop: 1 }}>{s.template_name}</div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.set_count} подходов</div>
                            {s.coach_note && <div className="wl-coach"><span className="wl-coach-badge">тренер</span><span>{s.coach_note}</span></div>}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Header({ title, sub, onBack, right }: { title: string; sub?: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="wl-head">
      <button className="wl-back" onClick={onBack}><IcoBack /></button>
      <div>
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>{title}</div>
        {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
      </div>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

/* ── Активная сессия ─────────────────────────────────────────────────────── */
function ActiveSession({ template, existing, exMap, api, onBack, onDone, onCancel, onOpenExercise }: {
  template: WTemplate; existing?: WSession; exMap: Record<number, WExercise>; api: WorkoutApi;
  onBack: () => void; onDone: (s: WSession) => void; onCancel: (id: number) => void; onOpenExercise: (ex: WExercise) => void;
}) {
  const isDone = !!existing;
  const dateISO = existing?.date ?? localISO(new Date());
  const [live, setLive] = useState<LiveSets>({});
  const [prev, setPrev] = useState<Record<number, WSet[]>>({});
  const [review, setReview] = useState(existing?.review_note ?? "");
  const [saving, setSaving] = useState<"idle" | "saving" | "coach">("idle");
  const [saveErr, setSaveErr] = useState(false);
  const [coach, setCoach] = useState<string | null>(null);
  const [serverSid, setServerSid] = useState<number | null>(existing?.id ?? null);
  const touchedRef = useRef(false);   // была ли правка юзером (не автосейвим голый засев)
  const autoBusyRef = useRef(false);  // идёт ли автосейв (не наслаивать)

  const draftKey = `wl-draft:${template.id}:${dateISO}`;

  useEffect(() => {
    // прошлые подходы — для подписи «прошлый: …»
    void Promise.all(template.exercises.map((te) => api.lastSets(te.exercise_id))).then((all) => {
      const sp: Record<number, WSet[]> = {};
      template.exercises.forEach((te, i) => { sp[te.exercise_id] = all[i]; });
      setPrev(sp);
    });

    if (existing) {
      // ЗАВЕРШЁННАЯ: грузим реальные залогированные подходы из базы (не из шаблона)
      void api.getWorkoutSets(existing.id).then((real) => {
        const sl: LiveSets = {};
        template.exercises.forEach((te) => { sl[te.exercise_id] = []; });
        for (const s of real) (sl[s.exercise_id] ??= []).push(s);
        setLive(sl);
      });
      return;
    }

    // НОВАЯ: восстановить черновик (автосейв) или засеять из шаблона + прошлых весов
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) { setLive(JSON.parse(raw) as LiveSets); return; }
    } catch { /* ignore */ }
    void Promise.all(template.exercises.map((te) => api.lastSets(te.exercise_id))).then((all) => {
      const sl: LiveSets = {};
      template.exercises.forEach((te, i) => {
        const last = all[i];
        const baseW = te.coach_target_weight ?? (last[0]?.weight ?? 0);
        sl[te.exercise_id] = Array.from({ length: te.target_sets }, (_, k) => ({
          exercise_id: te.exercise_id, set_index: k, weight: baseW, reps: last[k]?.reps ?? last[0]?.reps ?? te.rep_low,
          rpe: last[k]?.rpe ?? last[0]?.rpe ?? null, done: false,
        }));
      });
      setLive(sl);
    });
  }, [template, api, existing, dateISO, draftKey]);

  // автосейв черновика (только незавершённая) — не теряем прогресс при выходе из приложения
  useEffect(() => {
    if (existing) return;
    if (Object.keys(live).length === 0) return;
    try { localStorage.setItem(draftKey, JSON.stringify(live)); } catch { /* ignore */ }
  }, [live, existing, draftKey]);

  const cancel = () => { if (existing && window.confirm("Отменить эту тренировку? Она пропадёт из истории.")) onCancel(existing.id); };

  const setRow = (exId: number, idx: number, patch: Partial<WSet>) => {
    touchedRef.current = true;
    setLive((s) => ({ ...s, [exId]: s[exId].map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  };
  const delRow = (exId: number, idx: number) => {
    touchedRef.current = true;
    setLive((s) => ({ ...s, [exId]: s[exId].filter((_, i) => i !== idx) }));
  };
  const addRow = (exId: number) => {
    touchedRef.current = true;
    setLive((s) => ({ ...s, [exId]: [...s[exId], { exercise_id: exId, set_index: s[exId].length, weight: s[exId].at(-1)?.weight ?? 0, reps: s[exId].at(-1)?.reps ?? 8, done: false }] }));
  };

  // Автосейв НА СЕРВЕР по ходу трени (не только на «Завершить»). Как только юзер тронул
  // подход — создаём сессию (лениво, один раз) и льём сеты debounced. Тогда даже если
  // «Завершить» не дожал / сеть моргнула — трень уже на сервере, теряться нечему.
  useEffect(() => {
    if (existing) return;                       // завершённую не автосейвим
    if (!touchedRef.current) return;            // голый засев не сохраняем
    if (!api.startSession || !api.putSets) return; // превью-мок — пропускаем
    const t = setTimeout(async () => {
      if (autoBusyRef.current) return;
      autoBusyRef.current = true;
      try {
        let sid = serverSid;
        if (sid == null) { sid = await api.startSession!({ template_id: template.id, date: dateISO }); setServerSid(sid); }
        await api.putSets!(sid, Object.values(live).flat());
      } catch { /* не вышло — повторим на следующем изменении */ }
      finally { autoBusyRef.current = false; }
    }, 1200);
    return () => clearTimeout(t);
  }, [live, existing, api, template.id, dateISO, serverSid]);

  const complete = async () => {
    setSaving("saving"); setSaveErr(false);
    const allSets = Object.values(live).flat();
    let r: { coach_note: string };
    try {
      if (serverSid != null && api.putSets && api.finishSession) {
        // Уже автосохранена по ходу — досейвим финальные сеты и просто завершаем.
        await api.putSets(serverSid, allSets);
        r = await api.finishSession(serverSid, review);
      } else {
        // Фолбэк: автосейв не успел/недоступен — старый путь (создать+записать+завершить).
        r = await api.completeSession({ template_id: template.id, template_name: template.name, sets: allSets, review_note: review });
      }
    } catch {
      // Сеть/сервер упали. НЕ трогаем черновик (localStorage жив) — данные не теряем,
      // показываем ошибку, кнопка снова активна для повтора. Раньше висело «Сохраняю…» молча.
      setSaving("idle"); setSaveErr(true);
      return;
    }
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setSaving("coach"); setCoach(r.coach_note);
    setTimeout(() => onDone({
      id: serverSid ?? Math.floor(Date.parse(dateISO) / 1000) % 1e6, date: dateISO, template_name: template.name,
      review_note: review, coach_note: r.coach_note, set_count: allSets.length,
    }), 1500);
  };

  return (
    <div className="wl">
      <Header title={template.name} sub={`${weekdayLabel(dateISO)}, ${fmtDate(dateISO)}`} onBack={onBack}
        right={isDone ? <span className="wl-done-pill"><IcoCheck /> завершена</span> : undefined} />
      <div className="wl-body">
        {isDone && existing?.coach_note && (
          <div className="wl-coach" style={{ marginTop: 0, marginBottom: 14 }}>
            <span className="wl-coach-badge">тренер</span><span>{existing.coach_note}</span>
          </div>
        )}
        {template.exercises.map((te) => {
          const ex = exMap[te.exercise_id]; const p = prev[te.exercise_id] ?? [];
          const prevTxt = p.length ? `прошлый: ${p[0].weight}×${p.map((s) => s.reps).join(",")}` : "новое упражнение";
          return (
            <div key={te.exercise_id} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="wl-exname" onClick={() => onOpenExercise(ex)}>{ex?.name ?? "Упражнение"} <span className="wl-exhist"><IcoChart /></span></button>
                <span className="muted mono" style={{ fontSize: 11, marginLeft: "auto" }}>{te.target_sets}×{te.rep_low}–{te.rep_high}</span>
              </div>
              <div className="wl-prev">{prevTxt}{te.coach_target_weight != null && <span className="wl-target">цель {te.coach_target_weight} кг</span>}</div>
              <div className="wl-sets">
                <div className="wl-sets-hd"><span>#</span><span>вес</span><span>повт</span><span>RPE</span><span>сделал</span></div>
                {(live[te.exercise_id] ?? []).map((row, i) => (
                  <SetRow key={i} n={i + 1} row={row} onChange={(p2) => setRow(te.exercise_id, i, p2)} onDelete={() => delRow(te.exercise_id, i)} />
                ))}
                <button className="wl-add" onClick={() => addRow(te.exercise_id)}><IcoPlus /> подход</button>
              </div>
            </div>
          );
        })}
        <button className="wl-add wl-add-ex"><IcoPlus /> добавить упражнение</button>
        <div className="section-label">Ревью тренировки</div>
        <textarea className="input" rows={3} value={review} onChange={(e) => setReview(e.target.value)}
          placeholder="Как прошло? Что докинул/пропустил и почему — тренер прочитает." style={{ resize: "none", lineHeight: 1.4 }} />

        {/* Действие = последний элемент потока (НЕ прижато к низу вьюпорта). Кнопка-у-низа
            на iOS standalone PWA = первопричина всего класса багов: клава ужимает
            visualViewport (874→498) при неизменном 100dvh → любая bottom-привязка
            всплывала / оставляла letterbox-полосу / просвечивала сквозь полупрозрачный
            бар клавы. Обычная кнопка в конце скролла от этого свободна by-construction:
            у низа экрана нет элемента → нечему всплывать/просвечивать. */}
        <div className="wl-action">
          {saveErr && !isDone && (
            <div className="wl-save-err">❌ Не сохранилось (нет связи). Данные целы — жми ещё раз.</div>
          )}
          {isDone ? (
            <button className="btn btn-block wl-cancel" onClick={cancel}>Отменить тренировку</button>
          ) : (
            <button className={"btn btn-block" + (saveErr ? " wl-retry" : "")} disabled={saving !== "idle"} onClick={complete}>
              {saving === "idle" ? (saveErr ? "Повторить сохранение" : "Завершить тренировку") : saving === "saving" ? "Сохраняю…" : "Тренер разбирает…"}
            </button>
          )}
        </div>
      </div>
      {coach && <div className="wl-toast"><div className="wl-coach-badge" style={{ marginBottom: 6 }}>🏋️ тренер · Telegram</div><div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{coach}</div></div>}
    </div>
  );
}

/* ── История упражнения ──────────────────────────────────────────────────── */
function ExerciseHistory({ ex, api, onBack }: { ex: WExercise; api: WorkoutApi; onBack: () => void }) {
  const [hist, setHist] = useState<WHistPoint[] | null>(null);
  useEffect(() => { void api.getHistory(ex.id).then(setHist); }, [ex, api]);
  const chart = (hist ?? []).slice().reverse().map((h) => ({ date: h.date, value: h.best_set.weight }));
  const pr = hist && hist.length ? Math.max(...hist.map((h) => h.best_set.weight)) : 0;
  return (
    <div className="wl">
      <Header title={ex.name} sub="как растёт" onBack={onBack} />
      <div className="wl-body">
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>рабочий вес</span>
            <span className="wl-pr">рекорд {pr} кг</span>
          </div>
          {hist ? <ProgressChart data={chart} /> : <div className="skeleton" style={{ height: 140 }} />}
        </div>
        <div className="section-label">Прошлые тренировки</div>
        <div className="list">
          {(hist ?? []).map((h, i) => (
            <div key={i} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="mono muted" style={{ fontSize: 12, width: 56 }}>{fmtDate(h.date)}</span>
              <span className="mono" style={{ fontWeight: 600 }}>{h.best_set.weight} кг × {h.best_set.reps}</span>
              {h.best_set.weight >= pr && <span className="wl-pr" style={{ fontSize: 10, marginLeft: "auto" }}>рекорд</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── даты ────────────────────────────────────────────────────────────────── */
const MON_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MON_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WD_FULL = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

function localISO(d: Date): string { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function tplEmoji(name: string): string { return name.startsWith("Низ") ? "🦵" : "💪"; }
function fmtDate(iso: string): string { const [, m, d] = iso.split("-"); return `${+d} ${MON_SHORT[+m - 1]}`; }
function dayParse(iso: string): Date { return new Date(iso + "T00:00:00"); }
function weekdayLabel(iso: string): string { return WD_FULL[dayParse(iso).getDay()]; }
function mondayOf(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function currentMonday(): Date { return mondayOf(new Date()); }
function sameWeek(iso: string, monday: Date): boolean { return mondayOf(dayParse(iso)).getTime() === monday.getTime(); }
function weekRangeNow(): string {
  const mon = currentMonday(); const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  return `${mon.getDate()}–${sun.getDate()} ${MON_SHORT[sun.getMonth()]}`;
}
function weekLabel(iso: string): string {
  const mon = mondayOf(dayParse(iso)); const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  return `Неделя ${mon.getDate()}–${sun.getDate()} ${MON_SHORT[sun.getMonth()]}`;
}

interface MonthGroup { key: string; label: string; weeks: { key: string; label: string; items: WSession[] }[] }
function groupSessions(list: WSession[]): MonthGroup[] {
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  const months: MonthGroup[] = [];
  for (const s of sorted) {
    const d = dayParse(s.date); const mk = `${d.getFullYear()}-${d.getMonth()}`;
    let m = months.find((x) => x.key === mk);
    if (!m) { m = { key: mk, label: `${MON_FULL[d.getMonth()]} ${d.getFullYear()}`, weeks: [] }; months.push(m); }
    const wkKey = mondayOf(d).toISOString().slice(0, 10);
    let w = m.weeks.find((x) => x.key === wkKey);
    if (!w) { w = { key: wkKey, label: weekLabel(s.date), items: [] }; m.weeks.push(w); }
    w.items.push(s);
  }
  return months;
}
