export function initData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

export async function getMe(): Promise<{ id: number; first_name: string | null }> {
  const r = await fetch("/api/me", { headers: { "X-Telegram-Init-Data": initData() } });
  if (!r.ok) throw new Error(`me failed: ${r.status}`);
  return r.json();
}
