import { useEffect, useState } from "react";
import { getMe } from "./api";

export default function App() {
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    getMe().then((m) => setName(m.first_name)).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div style={{ padding: 24 }}>Ошибка авторизации: {err}</div>;
  return <div style={{ padding: 24 }}>Planner v2. Привет, {name ?? "..."}.</div>;
}
