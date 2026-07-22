import type { Signal, SignalMapping } from "../types";

export interface SignalRepo {
  list(): Promise<Signal[]>;
  create(data: {
    internal_name: string;
    display_name?: string;
    unit?: string;
  }): Promise<Signal>;
  update(
    id: number,
    data: { display_name?: string; unit?: string },
  ): Promise<Signal>;
  delete(id: number): Promise<void>;
  addMapping(
    signalId: number,
    data: { numeric_value: string; display_name: string },
  ): Promise<SignalMapping>;
  deleteMapping(signalId: number, mappingId: number): Promise<void>;
}
