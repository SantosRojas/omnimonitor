import { cn } from "./utils";
import { useRef, useState, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = () => {
    clearTimeout(timeoutRef.current);
    setVisible(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  };

  return (
    <div className={cn("relative inline-flex", className)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white shadow-lg whitespace-nowrap dark:bg-white dark:text-neutral-900"
          role="tooltip"
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-white" />
        </div>
      )}
    </div>
  );
}
Tooltip.displayName = "Tooltip";

export { Tooltip };
