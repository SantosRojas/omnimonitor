import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { LanguageSelector } from "../../components/LanguageSelector";
import { resetI18n } from "../../../i18n/testing";

// jsdom does not implement window.matchMedia, but theme-store invokes it at
// module load (getInitialTheme). Stub it BEFORE AppLayout's module graph is
// evaluated (AppLayout is imported dynamically below for this reason), so the
// sidebar mounts in "light" mode.
function stubMatchMedia() {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
}
stubMatchMedia();

/**
 * Settings surface: the same settings-variant LanguageSelector that the real
 * Settings page mounts in its Language card (Settings.tsx). It is rendered
 * inside AppLayout's <Outlet />, mirroring the production route tree
 * (AppLayout wraps the settings route in App.tsx).
 */
function SettingsSurface() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <LanguageSelector variant="settings" />
    </div>
  );
}

async function renderAppLayoutWithSettings() {
  // Dynamic import: module evaluation of AppLayout (and theme-store) must
  // happen after the matchMedia stub above.
  const { AppLayout } = await import("../AppLayout");
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/settings" element={<SettingsSurface />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout + Settings cross-surface language sync (R4)", () => {
  const user = userEvent.setup();

  afterEach(() => {
    resetI18n();
  });

  it("re-renders the AppLayout nav in Spanish when the language is switched from the Settings surface", async () => {
    await renderAppLayoutWithSettings();

    // Test default is en: the AppLayout nav renders English copy.
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();

    // The Settings surface (inside <Outlet />) hosts the settings selector.
    const settingsArea = within(screen.getByRole("main"));
    expect(settingsArea.getByText("Language")).toBeInTheDocument();

    // Switch to Spanish from the Settings surface.
    await user.click(settingsArea.getByRole("button", { name: "ES" }));

    // Cross-surface sync: the AppLayout nav re-renders with Spanish copy
    // through the shared i18n singleton (spec R2/R4).
    expect(await screen.findByRole("link", { name: "Panel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configuración" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();

    // document <html lang> stays aligned with the active language (R3).
    expect(document.documentElement.lang).toBe("es");
  });
});
