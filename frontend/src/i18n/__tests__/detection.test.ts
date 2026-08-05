import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { changeLanguage, getInitialLanguage, initI18n } from "../index";

describe("getInitialLanguage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns 'en' when a valid en preference is stored", () => {
    localStorage.setItem("lang", "en");
    expect(getInitialLanguage()).toBe("en");
  });

  it("returns 'es' when no preference is stored", () => {
    expect(getInitialLanguage()).toBe("es");
  });

  it("returns 'es' when an invalid value is stored", () => {
    localStorage.setItem("lang", "fr");
    expect(getInitialLanguage()).toBe("es");
  });
});

describe("changeLanguage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    await changeLanguage("en");
  });

  it("persists the selected language to localStorage", async () => {
    await initI18n({ lng: "en" });
    await changeLanguage("es");
    expect(localStorage.getItem("lang")).toBe("es");
  });
});
