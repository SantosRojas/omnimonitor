import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";
import { resetI18n, setLanguage } from "../../../i18n/testing";

describe("StatusBadge", () => {
  afterEach(() => {
    resetI18n();
  });

  it("renders the en status label by default", () => {
    render(<StatusBadge status="active" />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders the es status label after switching language", async () => {
    await setLanguage("es");
    render(<StatusBadge status="active" />);

    expect(screen.getByText("Activa")).toBeInTheDocument();
  });

  it("falls back to the raw value for unknown statuses", () => {
    render(<StatusBadge status="weird_status" />);

    expect(screen.getByText("weird_status")).toBeInTheDocument();
  });
});
