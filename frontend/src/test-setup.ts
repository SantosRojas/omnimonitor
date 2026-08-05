import "@testing-library/jest-dom";
import { initI18n } from "./i18n";

// Initialize i18n synchronously with English so existing English-copy
// assertions stay green; locale-specific tests use the i18n/testing helpers.
initI18n({ lng: "en" });
