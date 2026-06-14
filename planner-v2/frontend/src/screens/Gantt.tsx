import { Empty } from "../components/Empty";

// Заглушка таба «Гант» (T3). Контракт: база-проекта-v3/pages/T3a-gantt-all.html.
// Экран строится отдельной фазой; таб добавлен сейчас, чтобы IA совпадала с мокапом.
export function Gantt() {
  return (
    <div className="screen">
      <h1>Гант</h1>
      <Empty text="Гант-таймлайн проектов — скоро." />
    </div>
  );
}
