export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 28 }}>
      <div className="muted" style={{ marginBottom: action ? 14 : 0 }}>{text}</div>
      {action}
    </div>
  );
}
