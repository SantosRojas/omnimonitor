import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientInfoCard } from "../patient-info-card";
import { resetI18n, setLanguage } from "../../../../i18n/testing";
import type { TelemetryReading } from "../../domain/scada-store";

/** Minimal reading for a given signal name. */
function reading(
  internal_name: string,
  value: number | string | null,
): TelemetryReading {
  return {
    id: 1,
    machine_id: 1001,
    therapy_id: null,
    signal_id: null,
    internal_name,
    recorded_at: null,
    raw_value: typeof value === "number" ? value : null,
    value: value as unknown as number,
    unit: null,
    phase: null,
    created_at: "2026-08-03T10:00:00Z",
  };
}

describe("PatientInfoCard", () => {
  afterEach(() => {
    resetI18n();
  });

  it("renders patient info from the therapy summary when no bridge signals arrived", () => {
    render(
      <PatientInfoCard
        info={{}}
        therapySummary={{
          patientExternalId: "PAT-001",
          patientName: "Maria",
          age: 42,
          weight: 72,
          kit: "Prismaflex ST100",
          therapyType: "CVVH",
        }}
      />,
    );

    expect(screen.getByText("Patient")).toBeInTheDocument();
    expect(screen.getByText("Maria (PAT-001)")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Weight")).toBeInTheDocument();
    expect(screen.getByText("72 kg")).toBeInTheDocument();
    expect(screen.getByText("Therapy Mode")).toBeInTheDocument();
    expect(screen.getByText("CVVH")).toBeInTheDocument();
    expect(screen.getByText("Kit")).toBeInTheDocument();
    expect(screen.getByText("Prismaflex ST100")).toBeInTheDocument();
  });

  it("falls back to the patient external id when the name is missing", () => {
    render(
      <PatientInfoCard
        info={{}}
        therapySummary={{ patientExternalId: "PAT-001", patientName: null }}
      />,
    );

    expect(screen.getByText("PAT-001")).toBeInTheDocument();
  });

  it("merges the patient name with the live bridge DNI instead of hiding the name", () => {
    render(
      <PatientInfoCard
        info={{ g_patient_id_str: reading("g_patient_id_str", "BRIDGE-PAT") }}
        therapySummary={{
          patientExternalId: "PAT-001",
          patientName: "Maria",
          weight: 72,
          kit: "Prismaflex ST100",
          therapyType: "CVVH",
        }}
      />,
    );

    expect(screen.getByText("Maria (BRIDGE-PAT)")).toBeInTheDocument();
    expect(screen.queryByText("PAT-001")).not.toBeInTheDocument();
  });

  it("shows the name with the external id when only the therapy summary has patient data", () => {
    render(
      <PatientInfoCard
        info={{}}
        therapySummary={{ patientExternalId: "PAT-001", patientName: "Maria" }}
      />,
    );

    expect(screen.getByText("Maria (PAT-001)")).toBeInTheDocument();
  });

  it("renders an Age row when the therapy summary has an age", () => {
    render(
      <PatientInfoCard
        info={{}}
        therapySummary={{ patientExternalId: "PAT-001", patientName: "Maria", age: 58 }}
      />,
    );

    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
  });

  it("renders string-typed bridge readings instead of a placeholder", () => {
    render(
      <PatientInfoCard
        info={{
          g_patient_id_str: reading("g_patient_id_str", "BRIDGE-PAT"),
          d_kit_type_str: reading("d_kit_type_str", "ST100"),
        }}
      />,
    );

    expect(screen.getByText("BRIDGE-PAT")).toBeInTheDocument();
    expect(screen.getByText("ST100")).toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("renders nothing for a field with no reading and no summary value", () => {
    render(<PatientInfoCard info={{}} />);

    expect(screen.queryByText("Patient")).not.toBeInTheDocument();
    expect(screen.queryByText("Age")).not.toBeInTheDocument();
    expect(screen.queryByText("Weight")).not.toBeInTheDocument();
    expect(screen.queryByText("Anticoagulant")).not.toBeInTheDocument();
  });

  it("uses the en signal overlay for therapy time and net removal labels", () => {
    render(
      <PatientInfoCard
        info={{}}
        therapyTime="01:30:00"
        netRemovalVol="250 ml"
        displayNameMap={{
          c_acc_therapy_time_act: "Tiempo de terapia transcurrido",
          c_acc_net_rem_vol_act: "Remoción neta acumulada",
        }}
      />,
    );

    expect(screen.getByText("Therapy elapsed time")).toBeInTheDocument();
    expect(screen.getByText("Accumulated net removal")).toBeInTheDocument();
    expect(screen.getByText("01:30:00")).toBeInTheDocument();
    expect(screen.getByText("250 ml")).toBeInTheDocument();
    expect(screen.queryByText("Tiempo de terapia transcurrido")).not.toBeInTheDocument();
    expect(screen.queryByText("Remoción neta acumulada")).not.toBeInTheDocument();
  });

  it("shows the DB Spanish names for therapy time and net removal under es", async () => {
    await setLanguage("es");

    render(
      <PatientInfoCard
        info={{}}
        therapyTime="01:30:00"
        netRemovalVol="250 ml"
        displayNameMap={{
          c_acc_therapy_time_act: "Tiempo de terapia transcurrido",
          c_acc_net_rem_vol_act: "Remoción neta acumulada",
        }}
      />,
    );

    expect(screen.getByText("Tiempo de terapia transcurrido")).toBeInTheDocument();
    expect(screen.getByText("Remoción neta acumulada")).toBeInTheDocument();
    expect(screen.getByText("01:30:00")).toBeInTheDocument();
    expect(screen.getByText("250 ml")).toBeInTheDocument();
  });
});
