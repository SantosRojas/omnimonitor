import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import { i18n, initI18n } from "./i18n";
import { useAuthStore } from "./store/auth-store";
import { setTokenGetter, setOnUnauthorized } from "./data/api-client";
import "./index.css";

// ── Bootstrap ──────────────────────────────────────────────────

// Initialize the i18n singleton synchronously BEFORE the first render so the
// first paint already uses the resolved language (localStorage("lang") or
// "es") — no flash of raw keys or the wrong language (spec R2).
initI18n();

// Hydrate auth state from localStorage before the first render so
// the route guards see the persisted token immediately.
useAuthStore.getState().hydrate();

// Wire up the Axios interceptor's token getter. The getter reads
// the current token from the Zustand store on every request — this
// avoids a direct import cycle between the store and api-client.
setTokenGetter(() => useAuthStore.getState().token);

// When the API responds 401, clear credentials and let PrivateRoute
// redirect to /login on the next navigation.
setOnUnauthorized(() => {
  useAuthStore.getState().logout();
});

// ── Render ─────────────────────────────────────────────────────

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    "Root element (#root) not found. Ensure index.html has a <div id='root'></div>.",
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
