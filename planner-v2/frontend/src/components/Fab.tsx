export function Fab({ onAdd, onAi }: { onAdd: () => void; onAi: () => void }) {
  return (
    <>
      <button className="fab fab-secondary" onClick={onAi} aria-label="AI">AI</button>
      <button className="fab" onClick={onAdd} aria-label="Добавить">+</button>
    </>
  );
}
