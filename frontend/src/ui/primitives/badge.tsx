import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "./utils";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-neutral-900 text-white dark:bg-accent dark:text-neutral-950",
        secondary: "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
        success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
        danger: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
        outline: "border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
Badge.displayName = "Badge";

export { Badge, badgeVariants };
