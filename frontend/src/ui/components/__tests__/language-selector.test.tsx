import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSelector } from "../LanguageSelector";
import { resetI18n, setLanguage } from "../../../i18n/testing";

describe("LanguageSelector", () => {
  const user = userEvent.setup();

  afterEach(() => {
    resetI18n();
  });

  describe("expanded variant", () => {
    it("renders ES|EN segmented options with the active language highlighted", () => {
      render(<LanguageSelector variant="expanded" />);

      const es = screen.getByRole("button", { name: "ES" });
      const en = screen.getByRole("button", { name: "EN" });
      expect(es).toBeInTheDocument();
      expect(en).toBeInTheDocument();
      // test default is en
      expect(en).toHaveAttribute("aria-pressed", "true");
      expect(es).toHaveAttribute("aria-pressed", "false");
    });

    it("switches the active segment when clicking the other language", async () => {
      render(<LanguageSelector variant="expanded" />);

      await user.click(screen.getByRole("button", { name: "ES" }));

      expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("collapsed variant", () => {
    it("renders only the globe trigger until the popover is opened", () => {
      render(<LanguageSelector variant="collapsed" />);

      // Accessible name comes from title={t("common.language")}.
      expect(screen.getByRole("button", { name: "Language" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "ES" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "EN" })).not.toBeInTheDocument();
    });

    it("opens the popover on click and switches language on selection", async () => {
      render(<LanguageSelector variant="collapsed" />);

      await user.click(screen.getByRole("button", { name: "Language" }));

      const es = screen.getByRole("button", { name: "ES" });
      expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();

      await user.click(es);

      // Popover closes and the shared instance switches to es.
      expect(screen.queryByRole("button", { name: "ES" })).not.toBeInTheDocument();
      expect(document.documentElement.lang).toBe("es");
    });
  });

  describe("settings variant", () => {
    it("renders a labeled settings-style control", () => {
      render(<LanguageSelector variant="settings" />);

      expect(screen.getByText("Language")).toBeInTheDocument(); // t("common.language")
      expect(screen.getByRole("button", { name: "ES" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();
    });

    it("switches language when selecting the other option", async () => {
      render(<LanguageSelector variant="settings" />);

      await user.click(screen.getByRole("button", { name: "ES" }));

      expect(screen.getByRole("button", { name: "ES" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("document html lang sync (R3)", () => {
    it("keeps document.documentElement.lang aligned with the active language", async () => {
      await setLanguage("es");
      render(<LanguageSelector variant="expanded" />);

      expect(document.documentElement.lang).toBe("es");

      await user.click(screen.getByRole("button", { name: "EN" }));

      expect(document.documentElement.lang).toBe("en");
    });
  });
});
