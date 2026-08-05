import { describe, expect, it } from "vitest";
import { getTherapyStepIndex } from "../therapy-state-machine-timeline";

describe("getTherapyStepIndex", () => {
  it("maps preparation states to step 0", () => {
    expect(getTherapyStepIndex("preparacion")).toBe(0);
    expect(getTherapyStepIndex("Preparación")).toBe(0);
    expect(getTherapyStepIndex("preparando")).toBe(0);
  });

  it("maps connect states to step 1", () => {
    expect(getTherapyStepIndex("conectar")).toBe(1);
    expect(getTherapyStepIndex("Desconexión temp. - conectar pac.")).toBe(1);
  });

  it("maps therapy states to step 2", () => {
    expect(getTherapyStepIndex("terapia")).toBe(2);
    expect(getTherapyStepIndex("Terapia Activa")).toBe(2);
  });

  it("maps finish states to step 3", () => {
    expect(getTherapyStepIndex("fin")).toBe(3);
    expect(getTherapyStepIndex("finalizada")).toBe(3);
    expect(getTherapyStepIndex("finalizado")).toBe(3);
  });

  it("maps database-level therapy statuses to timeline steps", () => {
    expect(getTherapyStepIndex("planned")).toBe(0);
    expect(getTherapyStepIndex("active")).toBe(2);
    expect(getTherapyStepIndex("paused")).toBe(2);
    expect(getTherapyStepIndex("completed")).toBe(3);
    expect(getTherapyStepIndex("cancelled")).toBe(3);
  });

  it("returns -1 for states that match no step substring", () => {
    expect(getTherapyStepIndex("")).toBe(-1);
    expect(getTherapyStepIndex("unknown-state")).toBe(-1);
    expect(getTherapyStepIndex("idle")).toBe(-1);
  });

  it("is case-insensitive", () => {
    expect(getTherapyStepIndex("TERAPIA")).toBe(2);
    expect(getTherapyStepIndex("PreParAción")).toBe(0);
  });
});
