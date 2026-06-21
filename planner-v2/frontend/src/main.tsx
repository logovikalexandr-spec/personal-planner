import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TokenGate } from "./components/TokenGate";
import { needsAuth } from "./lib/auth";

// PWA вне Telegram без токена → экран входа; иначе обычное приложение.
const Root = needsAuth() ? <TokenGate /> : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>{Root}</ErrorBoundary>
  </StrictMode>,
);
