import { changeLanguage, type SupportedLng } from "./index";

/** Switches the shared i18n instance to the given language and awaits the change. */
export async function setLanguage(lng: SupportedLng): Promise<void> {
  await changeLanguage(lng);
}

/** Restores the test default language (en) between tests. */
export function resetI18n(): void {
  void changeLanguage("en");
}
