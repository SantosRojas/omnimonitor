import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import es from "./locales/es/translation.json";
import en from "./locales/en/translation.json";

/** Languages shipped by the catalog. */
export const supportedLngs = ["es", "en"] as const;
export type SupportedLng = (typeof supportedLngs)[number];

/** Default language when no valid saved preference exists. */
export const DEFAULT_LANGUAGE: SupportedLng = "es";

/** Shared singleton instance, created once at module load (design D2). */
export const i18n = i18next.createInstance().use(initReactI18next);

/**
 * Resolves the initial language: a valid `localStorage("lang")` preference
 * wins, otherwise the default ("es"). No browser-locale detection (D1).
 */
export function getInitialLanguage(): SupportedLng {
  const stored = localStorage.getItem("lang");
  return stored === "es" || stored === "en" ? stored : DEFAULT_LANGUAGE;
}

/**
 * Synchronously initializes the shared i18n instance (idempotent).
 *
 * Bundles both catalogs as static imports (no HTTP/lazy loading), sets
 * `fallbackLng: "es"` and `supportedLngs: ["es", "en"]`, and — on every
 * language change — keeps `document.documentElement.lang` and
 * `localStorage("lang")` in sync (spec R3).
 */
export function initI18n(options?: { lng?: SupportedLng }): typeof i18n {
  if (i18n.isInitialized) return i18n;

  const lng = options?.lng ?? getInitialLanguage();

  // Registered before init so the resolved initial language is captured too.
  i18n.on("languageChanged", (activeLng) => {
    document.documentElement.lang = activeLng;
    localStorage.setItem("lang", activeLng);
  });

  i18n.init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...supportedLngs],
    // i18next v26 renamed `initImmediate` to `initAsync`; false = synchronous
    // init so `i18n.t` works right after init (spec R2).
    initAsync: false,
    interpolation: { escapeValue: false },
  });

  // Keep the static <html lang> attribute aligned with the resolved language.
  document.documentElement.lang = i18n.language;

  return i18n;
}

/** Switches the shared instance's language; the listener persists it. */
export function changeLanguage(lng: SupportedLng): Promise<void> {
  return i18n.changeLanguage(lng).then(() => undefined);
}

/**
 * React hook exposing the active language and a typed change function.
 * Re-renders on every `languageChanged` event (design D3).
 */
export function useI18n(): {
  language: string;
  changeLanguage: (lng: SupportedLng) => Promise<void>;
} {
  const { i18n: instance } = useTranslation();
  return {
    language: instance.language,
    changeLanguage: (lng) => instance.changeLanguage(lng).then(() => undefined),
  };
}
