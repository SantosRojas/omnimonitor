import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlarmPanel, type ScadaAlarm } from "../alarm-panel";
import { resetI18n, setLanguage } from "../../../../i18n/testing";

const criticalAlarm: ScadaAlarm = {
  id: "alarm-1",
  severity: "critical",
  message: "Pressure high",
  timestamp: "2026-08-10T10:00:00Z",
  acknowledged: false,
};

describe("AlarmPanel severity", () => {
  afterEach(() => {
    resetI18n();
  });

  it("renders the en severity label by default", () => {
    render(<AlarmPanel alarms={[criticalAlarm]} />);

    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("Pressure high")).toBeInTheDocument();
  });

  it("renders the es severity label after switching language", async () => {
    await setLanguage("es");
    render(<AlarmPanel alarms={[criticalAlarm]} />);

    expect(screen.getByText("CRÍTICO")).toBeInTheDocument();
    expect(screen.getByText("Pressure high")).toBeInTheDocument();
  });
});
