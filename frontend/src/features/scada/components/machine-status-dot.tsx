import type { FC } from "react";
import { cn } from "../../../ui/primitives";

export type ConnectionStatus = "online" | "offline" | "error";

interface MachineStatusDotProps {
  status: ConnectionStatus;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const sizeMap = { sm: "h-2 w-2", md: "h-3 w-3", lg: "h-4 w-4" };
const colorMap: Record<ConnectionStatus, string> = {
  online: "bg-green-500",
  offline: "bg-neutral-400",
  error: "bg-red-500",
};

const MachineStatusDot: FC<MachineStatusDotProps> = ({
  status,
  size = "md",
  label,
  className,
}) => (
  <span
    className={cn("inline-flex items-center gap-1.5", className)}
    title={status}
  >
    <span
      className={cn(
        "rounded-full",
        sizeMap[size],
        colorMap[status],
        status === "online" && "animate-pulse",
      )}
    />
    {label && <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>}
  </span>
);
MachineStatusDot.displayName = "MachineStatusDot";

export { MachineStatusDot };
