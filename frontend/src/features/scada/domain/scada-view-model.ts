import type { TelemetryHistoryPoint, TelemetryReading } from "./scada-store";

/**
 * Read-only projection of one machine's SCADA state, composed by
 * `useScadaViewModel` for the presentational `ScadaLayout` tree.
 *
 * Keeps the layout free of store subscriptions and data derivation:
 * everything it needs is either raw telemetry, therapy status, or a
 * pre-formatted presentation value.
 */
export interface ScadaViewModel {
  telemetry: {
    info: Record<string, TelemetryReading>;
    pressures: Record<string, TelemetryReading>;
    flows: Record<string, TelemetryReading>;
    history: TelemetryHistoryPoint[];
  };
  therapy: {
    active: boolean;
    stateName: string;
    start: string | null;
    id: number | undefined;
  };
  presentation: {
    displayNameMap: Record<string, string>;
    therapyTimeDisplay: string | undefined;
    netRemovalDisplay: string | undefined;
  };
  device: {
    serialNumber: string | undefined;
  };
}
