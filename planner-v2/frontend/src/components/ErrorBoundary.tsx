import { Component, type ErrorInfo, type ReactNode } from "react";

// Ловит краш любого дочернего компонента → аккуратная плашка вместо белого/чёрного экрана.
// Корневой щит: один упавший экран не должен уносить всё приложение в пустоту.
// (Боль владельца «кривое поле → белый экран» — закрыто этим.)
interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // лог в консоль (прод-телеметрии нет — ZERO-AFK); видно в devtools/Telegram-логах
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="err-screen" role="alert">
          <div className="err-card">
            <div className="err-ttl">Что-то сломалось</div>
            <div className="err-sub">Экран не удалось показать. Это сбой приложения, не ваши данные.</div>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
