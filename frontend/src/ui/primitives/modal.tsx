import { useEffect, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./button";

export interface ModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Heading text rendered in the modal header. */
  title: string;
  /** Called when the user dismisses the modal (Escape or close button). */
  onClose: () => void;
  /** Modal body content. */
  children: ReactNode;
  /** Optional extra classes applied to the dialog panel. */
  className?: string;
  /** Panel width — `md` matches the ConfirmDialog width, `lg` is wider. */
  size?: "md" | "lg";
}

/**
 * Accessible modal overlay used for master-detail forms.
 *
 * Renders a centered dialog panel over a dimmed backdrop. Dismisses on
 * Escape or the header close button. Dark mode styling
 * matches the ConfirmDialog overlay so both stay visually consistent.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  className,
  size = "md",
}: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();

  // Dismiss on Escape regardless of where focus lives (window-level).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — inert, only Escape or the close button dismiss the modal */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      {/* Dialog panel */}
      <div
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-xl dark:bg-neutral-900 dark:text-neutral-100",
          size === "lg" ? "max-w-lg" : "max-w-md",
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <h2
            id={titleId}
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            {title}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
