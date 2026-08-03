import { useState, useRef, useEffect, lazy, Suspense, type ReactNode } from "react";
import { Card } from "../../../ui/primitives/card";
import { cn } from "../../../ui/primitives";
import { RadialGauge } from "./radial-gauge";
import { PressureCylinder } from "./pressure-cylinder";
import { FlowIndicator } from "./flow-indicator";
import { ProcessDiagram } from "./process-diagram";
import { TherapyStateMachineTimeline } from "./therapy-state-machine-timeline";
import { PatientInfoCard } from "./patient-info-card";
import { AlarmPanel, type ScadaAlarm } from "./alarm-panel";
import { CommentsPanel } from "./comments-panel";
import {
  PRESSURE_GAUGES,
  FLOW_INDICATORS,
  PRESSURE_SERIES,
  FLOW_SERIES,
} from "../signal-configs";
import { getNum, getUnit, hasSignal } from "../domain/signal-classifier";
import { useCylinderConfigs } from "../domain/use-cylinder-config";
import { preferencesStorage } from "../infrastructure/preferences";
import { ToggleLeft, ToggleRight, Maximize, Minimize } from "lucide-react";
import type { ScadaViewModel } from "../domain/scada-view-model";

const ScadaTrendChart = lazy(() =>
  import("./scada-trend-chart").then((m) => ({ default: m.ScadaTrendChart })),
);

const TREND_CHART_FALLBACK = (
  <div className="flex h-[180px] items-center justify-center text-xs text-scada-muted">
    Cargando gráfico…
  </div>
);

interface TherapySummary {
  patientExternalId?: string | null;
  patientName?: string | null;
  age?: number | null;
  weight?: number | null;
  kit?: string | null;
  therapyType?: string | null;
}

interface ScadaLayoutProps {
  vm: ScadaViewModel;
  alarms?: ScadaAlarm[];
  onAcknowledge?: (alarmId: string) => void;
  therapySummary?: TherapySummary;
  children?: ReactNode;
}

const SCADA_CARD_CLASS =
  "rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm";

/**
 * Real-time SCADA screen: patient info + alarms + flows column,
 * pressure gauges/cylinders + visible-signals panel, trend charts,
 * therapy timeline and the dialysis circuit diagram.
 *
 * Ported from pdms-omni `presentation/components/scada/scada-layout.tsx`
 * with omni's `ScadaViewModel` and preferences storage.
 */
export function ScadaLayout({
  vm,
  alarms = [],
  onAcknowledge,
  therapySummary,
  children,
}: ScadaLayoutProps) {
  const { telemetry, therapy, presentation } = vm;
  const { info, pressures, flows, history } = telemetry;

  const [pressureView, setPressureView] = useState<"gauge" | "cylinder">("gauge");
  const [fsChart, setFsChart] = useState<"presiones" | "caudales" | null>(null);
  const pressureRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const { configs } = useCylinderConfigs();

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFsChart(null);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFs(chart: "presiones" | "caudales") {
    const el = chart === "presiones" ? pressureRef.current : flowRef.current;
    if (!el) return;
    if (fsChart === chart) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
      setFsChart(chart);
    }
  }

  const ALL_SIGNAL_KEYS = [
    ...PRESSURE_GAUGES.map((g) => g.key),
    ...FLOW_INDICATORS.map((g) => g.key),
  ];

  const [visibleSignals, setVisibleSignals] = useState<Set<string>>(() => {
    const stored = preferencesStorage.getVisibleSignals();
    if (stored && stored.length > 0) return new Set(stored);
    return new Set(ALL_SIGNAL_KEYS);
  });

  function toggleSignal(key: string) {
    setVisibleSignals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      preferencesStorage.setVisibleSignals([...next]);
      return next;
    });
  }

  const visiblePressures = PRESSURE_GAUGES.filter((g) => visibleSignals.has(g.key));
  const visibleFlowIndicators = FLOW_INDICATORS.filter((g) => visibleSignals.has(g.key));
  const visiblePressureSeries = PRESSURE_SERIES.filter((s) => visibleSignals.has(s.key));
  const visibleFlowSeries = FLOW_SERIES.filter((s) => visibleSignals.has(s.key));

  return (
    <div className="flex w-full flex-col gap-3 md:flex-row">
      {children}
      {/* =================== FIRST COLUMN ========================== */}
      <div className="flex w-full shrink-0 flex-col gap-3 md:w-72">
        <PatientInfoCard
          info={info}
          therapyStart={therapy.start}
          therapyTime={presentation.therapyTimeDisplay}
          netRemovalVol={presentation.netRemovalDisplay}
          displayNameMap={presentation.displayNameMap}
          therapySummary={therapySummary}
        />
        {alarms.length > 0 && <AlarmPanel alarms={alarms} onAcknowledge={onAcknowledge} />}

        <Card className={cn(SCADA_CARD_CLASS, "p-3")}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-scada-muted">
            Flows
          </h3>
          <div className="flex flex-col gap-3">
            {visibleFlowIndicators.map((g) => (
              <FlowIndicator
                key={g.key}
                value={getNum(flows, g.key)}
                max={g.max}
                unit={
                  getUnit(flows, g.key) ||
                  (g.key === "c_net_rem_flow_act" ? "ml/h" : "ml/min")
                }
                label={g.label}
                color={g.color}
                hasData={hasSignal(flows, g.key)}
              />
            ))}
          </div>
        </Card>

        {therapy.id != null && (
          <CommentsPanel therapyId={therapy.id} therapyActive={therapy.active} />
        )}
      </div>
      {/* =================== SECOND COLUMN ========================== */}

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Pressure gauges and cylinders */}
          <Card className={cn(SCADA_CARD_CLASS, "flex-1 p-3")}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-scada-muted">
                Pressures
              </h3>
              <button
                onClick={() => setPressureView((v) => (v === "gauge" ? "cylinder" : "gauge"))}
                className="text-scada-muted transition-colors hover:text-scada-text"
                title={pressureView === "gauge" ? "Cylinder view" : "Gauge view"}
              >
                {pressureView === "gauge" ? (
                  <ToggleRight className="h-5 w-5 text-primary" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-primary" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap justify-around gap-2">
              {pressureView !== "gauge" ? (
                visiblePressures.map((g) => {
                  const cfg = configs[g.type] ?? { min: 0, max: 500, step: 100 };
                  const dataExists = hasSignal(pressures, g.key);

                  return (
                    <RadialGauge
                      key={g.key}
                      value={getNum(pressures, g.key)}
                      min={cfg.min}
                      max={cfg.max}
                      unit="mmHg"
                      label={g.label}
                      color={g.color}
                      size="md"
                      warning={Math.abs(cfg.max) * 0.7}
                      critical={Math.abs(cfg.max) * 0.85}
                      hasData={dataExists}
                    />
                  );
                })
              ) : (
                visiblePressures.map((g) => {
                  const cfg = configs[g.type] ?? { min: 0, max: 500, step: 100 };
                  const dataExists = hasSignal(pressures, g.key);

                  return (
                    <PressureCylinder
                      key={g.key}
                      label={g.label}
                      value={getNum(pressures, g.key)}
                      unit="mmHg"
                      config={cfg}
                      color={g.color}
                      size="md"
                      hasData={dataExists}
                    />
                  );
                })
              )}
            </div>
          </Card>

          {/* Visible signals toggle */}
          <Card className={cn(SCADA_CARD_CLASS, "p-3")}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-scada-muted">
              Visible signals
            </h3>
            <div className="space-y-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-scada-muted/60">
                Pressures
              </p>
              {PRESSURE_GAUGES.map((g) => {
                const checked = visibleSignals.has(g.key);
                return (
                  <label
                    key={g.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-white/5"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleSignal(g.key)}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150",
                        checked
                          ? "border-scada-accent bg-scada-accent/15"
                          : "border-scada-border bg-transparent hover:border-scada-text hover:bg-white/5",
                      )}
                    >
                      {checked && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-scada-accent" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <span className="text-xs text-scada-text">{g.label}</span>
                  </label>
                );
              })}
              <p className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-scada-muted/60">
                Flows
              </p>
              {FLOW_INDICATORS.map((g) => {
                const checked = visibleSignals.has(g.key);
                return (
                  <label
                    key={g.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-white/5"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleSignal(g.key)}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150",
                        checked
                          ? "border-scada-accent bg-scada-accent/15"
                          : "border-scada-border bg-transparent hover:border-scada-text hover:bg-white/5",
                      )}
                    >
                      {checked && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-scada-accent" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <span className="text-xs text-scada-text">{g.label}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        </div>

        {therapy.active && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card
              ref={pressureRef}
              className={SCADA_CARD_CLASS}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-scada-muted">
                  Pressure Trend
                </h3>
                <button
                  onClick={() => toggleFs("presiones")}
                  className="text-scada-muted transition-colors hover:text-scada-text"
                >
                  {fsChart === "presiones" ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Suspense fallback={TREND_CHART_FALLBACK}>
                  <ScadaTrendChart
                    data={history}
                    series={visiblePressureSeries}
                    displayNameMap={presentation.displayNameMap}
                    height={fsChart === "presiones" ? "100%" : "180px"}
                  />
                </Suspense>
              </div>
            </Card>
            <Card
              ref={flowRef}
              className={SCADA_CARD_CLASS}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-scada-muted">
                  Flow Trend
                </h3>
                <button
                  onClick={() => toggleFs("caudales")}
                  className="text-scada-muted transition-colors hover:text-scada-text"
                >
                  {fsChart === "caudales" ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Suspense fallback={TREND_CHART_FALLBACK}>
                  <ScadaTrendChart
                    data={history}
                    series={visibleFlowSeries}
                    displayNameMap={presentation.displayNameMap}
                    height={fsChart === "caudales" ? "100%" : "180px"}
                  />
                </Suspense>
              </div>
            </Card>
          </div>
        )}

        <div className="flex w-full flex-row gap-3">
          <TherapyStateMachineTimeline
            currentState={therapy.stateName}
            therapyActive={therapy.active}
          />
          <ProcessDiagram pressures={pressures} flows={flows} />
        </div>
      </div>
    </div>
  );
}
