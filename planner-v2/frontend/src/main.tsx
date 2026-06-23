import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TokenGate } from "./components/TokenGate";
import { ConfirmHost } from "./lib/confirm";
import { needsAuth } from "./lib/auth";
import { initPwa } from "./lib/pwa";

initPwa(); // регистрация SW + тихая проверка обновления при возврате из фона

// PWA вне Telegram без токена → экран входа; иначе обычное приложение.
const Root = needsAuth() ? <TokenGate /> : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {Root}
      <ConfirmHost />
    </ErrorBoundary>
  </StrictMode>,
);
