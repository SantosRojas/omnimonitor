import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useAuthStore } from "./store/auth-store";
import { setTokenGetter, setOnUnauthorized } from "./data/api-client";
import "./index.css";

// ── Bootstrap ──────────────────────────────────────────────────

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
    <App />
  </StrictMode>,
);
