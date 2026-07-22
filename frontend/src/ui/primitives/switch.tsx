import { cn } from "./utils";
import { forwardRef, type InputHTMLAttributes, useId } from "react";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = useId();
    const switchId = id ?? generatedId;

    return (
      <label
        htmlFor={switchId}
        className={cn(
          "inline-flex items-center gap-2 cursor-pointer",
          className,
        )}
      >
        <div className="relative">
          <input
            ref={ref}
            id={switchId}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div className="h-6 w-11 rounded-full bg-neutral-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-neutral-900 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 peer-focus-visible:ring-offset-2 dark:bg-neutral-700 dark:peer-checked:bg-white dark:peer-checked:after:bg-neutral-900" />
        </div>
        {label && <span className="text-sm">{label}</span>}
      </label>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
