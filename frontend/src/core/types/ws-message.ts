import type { Reading } from "./reading";
import type { MachineStatusPayload } from "./machine";

export type WsMessage =
  | {
      type: "ReadingsBroadcast";
      machine_id: string;
      readings: Reading[];
      therapy_active: boolean;
      therapy_state_name: string;
      therapy_start: string | null;
    }
  | {
      type: "ReadingsReplay";
      machine_id: string;
      readings: Reading[];
    }
  | {
      type: "MachineStatus";
      machine_id: string;
      status: MachineStatusPayload;
    }
  | { type: "RESTFallback"; reason: string }
  | {
      type: "SerialStatus";
      bridge_id: number;
      state: string;
      failure_count: number;
      ws_state: string;
      updated_at: string;
    };
