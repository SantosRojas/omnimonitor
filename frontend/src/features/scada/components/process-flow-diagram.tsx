import type { FC } from "react";
import { cn } from "../../../ui/primitives";

interface ProcessFlowDiagramProps {
  /** Pressure in source cylinder */
  sourcePressure: number;
  /** Regulated/working pressure */
  workingPressure: number;
  /** Flow indicator active */
  flowActive: boolean;
  /** Flow rate in L/min */
  flowRate?: number;
  /** Machine state for coloring */
  isRunning?: boolean;
  className?: string;
}

const ProcessFlowDiagram: FC<ProcessFlowDiagramProps> = ({
  sourcePressure,
  workingPressure,
  flowActive,
  flowRate,
  isRunning,
  className,
}) => {
  const active = isRunning ?? flowActive;

  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <svg width={280} height={80} viewBox="0 0 280 80" className="overflow-visible">
        {/* Cylinder */}
        <rect x={8} y={20} width={32} height={48} rx={4} className="fill-neutral-300 stroke-neutral-400 dark:fill-neutral-700 dark:stroke-neutral-500" strokeWidth={1.5} />
        <rect x={14} y={14} width={20} height={10} rx={2} className="fill-neutral-300 stroke-neutral-400 dark:fill-neutral-700 dark:stroke-neutral-500" strokeWidth={1.5} />
        {/* Cylinder label */}
        <text x={24} y={52} textAnchor="middle" className="fill-neutral-600 dark:fill-neutral-300 text-[10px] font-medium">
          {sourcePressure.toFixed(0)}
        </text>
        <text x={24} y={68} textAnchor="middle" className="fill-neutral-400 text-[7px]">
          psi
        </text>

        {/* Pipe from cylinder to regulator */}
        <line x1={40} y1={35} x2={80} y2={35} stroke="currentColor" className="text-neutral-400 dark:text-neutral-500" strokeWidth={2} />

        {/* Regulator */}
        <rect x={80} y={25} width={24} height={20} rx={3} className={active ? "fill-blue-100 stroke-blue-500 dark:fill-blue-900 dark:stroke-blue-400" : "fill-neutral-100 stroke-neutral-400 dark:fill-neutral-800 dark:stroke-neutral-500"} strokeWidth={1.5} />
        <text x={92} y={39} textAnchor="middle" className={active ? "fill-blue-700 dark:fill-blue-200" : "fill-neutral-500"} fontSize={8} fontWeight={600}>REG</text>

        {/* Pipe from regulator to flow meter */}
        <line x1={104} y1={35} x2={140} y2={35} stroke="currentColor" className={active ? "text-blue-400" : "text-neutral-400 dark:text-neutral-500"} strokeWidth={2} />

        {/* Flow indicator */}
        <g>
          <circle cx={158} cy={35} r={14} className={flowActive ? "fill-green-100 stroke-green-500 dark:fill-green-900 dark:stroke-green-500" : "fill-neutral-100 stroke-neutral-400 dark:fill-neutral-800 dark:stroke-neutral-500"} strokeWidth={1.5} />
          {flowActive ? (
            <text x={158} y={35} textAnchor="middle" dominantBaseline="central" className="fill-green-700 dark:fill-green-200 text-xs">
              ●
            </text>
          ) : (
            <text x={158} y={35} textAnchor="middle" dominantBaseline="central" className="fill-neutral-400 text-xs">
              ×
            </text>
          )}
          {flowRate !== undefined && (
            <text x={158} y={52} textAnchor="middle" className="fill-neutral-500 text-[8px]">
              {flowRate.toFixed(1)} L/min
            </text>
          )}
        </g>

        {/* Pipe to output */}
        <line x1={172} y1={35} x2={210} y2={35} stroke="currentColor" className={active ? "text-blue-400" : "text-neutral-400 dark:text-neutral-500"} strokeWidth={2} />

        {/* Output / working pressure */}
        <rect x={210} y={22} width={56} height={26} rx={3} className={active ? "fill-blue-50 stroke-blue-500 dark:fill-blue-950 dark:stroke-blue-500" : "fill-neutral-50 stroke-neutral-400 dark:fill-neutral-900 dark:stroke-neutral-500"} strokeWidth={1.5} />
        <text x={238} y={36} textAnchor="middle" className={active ? "fill-blue-700 dark:fill-blue-200" : "fill-neutral-500 dark:fill-neutral-400"} fontSize={11} fontWeight={700}>
          {workingPressure.toFixed(0)}
        </text>

        {/* Arrow at output */}
        {active && (
          <polygon points="266,35 276,31 276,39" fill="currentColor" className="text-blue-500" />
        )}

        {/* Legend */}
        <text x={158} y={72} textAnchor="middle" className="fill-neutral-400 dark:fill-neutral-500 text-[8px]">
          Source → Regulator → Flow → Output
        </text>
      </svg>
    </div>
  );
};
ProcessFlowDiagram.displayName = "ProcessFlowDiagram";

export { ProcessFlowDiagram };
