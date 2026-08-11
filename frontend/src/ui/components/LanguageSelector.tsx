import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useI18n, type SupportedLng } from "../../i18n";
import { Button } from "../primitives/button";
import { cn } from "../primitives";

interface LanguageSelectorProps {
  /** Presentation variant: segmented control, icon button + popover, or settings row. */
  variant?: "expanded" | "collapsed" | "settings";
  className?: string;
}

const LANGUAGE_OPTIONS: ReadonlyArray<{ value: SupportedLng; label: string }> = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
];

/**
 * Segmented ES|EN control mirroring the AppLayout theme-toggle styling
 * (rounded border pill; active segment highlighted with shadow).
 */
function SegmentedControl({
  value,
  onChange,
  size = "sm",
  ariaLabel,
}: {
  value: SupportedLng;
  onChange: (lng: SupportedLng) => void;
  size?: "sm" | "lg";
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700"
    >
      {LANGUAGE_OPTIONS.map(({ value: lng, label }) => (
        <button
          key={lng}
          type="button"
          onClick={() => onChange(lng)}
          aria-pressed={value === lng}
          className={cn(
            "flex flex-1 items-center justify-center rounded-md font-medium transition-all",
            size === "sm" ? "px-2 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
            value === lng
              ? "bg-neutral-100 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
              : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Collapsed trigger: globe icon button that toggles an ES/EN popover rendered
 * above the trigger. Plain `useState` menu — no Radix wrapper (design D8).
 */
function CollapsedControl({ title }: { title: string }) {
  const { language, changeLanguage } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-expanded={open}
      >
        <Globe className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-28 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {LANGUAGE_OPTIONS.map(({ value: lng, label }) => (
            <button
              key={lng}
              type="button"
              onClick={() => {
                void changeLanguage(lng);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-center rounded-md px-3 py-1.5 text-sm transition-colors",
                language === lng
                  ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Language switcher with three presentation variants (design D8):
 * - `expanded`: segmented ES|EN control for the expanded sidebar.
 * - `collapsed`: globe icon button with a plain useState popover.
 * - `settings`: labeled segmented control for the Settings page.
 *
 * The active language comes from `useI18n()`; switching persists through the
 * i18n singleton's `languageChanged` listener (spec R4).
 */
export function LanguageSelector({
  variant = "expanded",
  className,
}: LanguageSelectorProps) {
  const { language, changeLanguage } = useI18n();
  const { t } = useTranslation();

  const title = t("common.language");
  const active: SupportedLng =
    language === "es" || language === "en" ? language : "es";

  if (variant === "collapsed") {
    return (
      <div className={className}>
        <CollapsedControl title={title} />
      </div>
    );
  }

  if (variant === "settings") {
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {title}
        </p>
        <SegmentedControl
          value={active}
          onChange={(lng) => void changeLanguage(lng)}
          size="lg"
          ariaLabel={title}
        />
      </div>
    );
  }

  return (
    <div className={className} title={title}>
      <SegmentedControl
        value={active}
        onChange={(lng) => void changeLanguage(lng)}
        ariaLabel={title}
      />
    </div>
  );
}
