import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Palette, RotateCcw } from "lucide-react";
import {
  ACCENT_OPTIONS,
  DEFAULT_ACCENTS,
  useThemeStore,
} from "../../store/theme-store";
import { cn } from "../primitives";

interface AccentPickerProps {
  /** Presentation variant: labeled card or compact icon trigger with a dropdown. */
  variant?: "card" | "icon";
  className?: string;
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function AccentPicker({ variant = "card", className }: AccentPickerProps) {
  const { t } = useTranslation();
  const { theme, accent, setAccent, resetAccent } = useThemeStore();
  const current = accent ?? DEFAULT_ACCENTS[theme];

  const [customColor, setCustomColor] = useState(current);
  useEffect(() => {
    setCustomColor(accent ?? DEFAULT_ACCENTS[theme]);
  }, [accent, theme]);

  const swatches = (
    <div className="flex flex-wrap gap-2">
      {ACCENT_OPTIONS.map((option) => {
        const active = current.toLowerCase() === option.value.toLowerCase();
        const label = t(`settings.accentColors.${option.key}`);
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => setAccent(option.value)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "h-6 w-6 rounded-full border border-neutral-300 transition-all dark:border-neutral-600",
              active &&
                "scale-110 border-transparent ring-2 ring-neutral-400 dark:ring-neutral-200",
            )}
            style={{ backgroundColor: option.value }}
          />
        );
      })}
    </div>
  );

  const customRow = (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={HEX_REGEX.test(customColor) ? customColor : "#000000"}
        onChange={(e) => setCustomColor(e.target.value)}
        aria-label={t("settings.accentCustom")}
        className="h-7 w-8 shrink-0 cursor-pointer rounded border border-neutral-300 bg-transparent p-0 dark:border-neutral-700"
      />
      <input
        type="text"
        value={customColor}
        onChange={(e) => setCustomColor(e.target.value)}
        placeholder="#000000"
        aria-label={t("settings.accentCustom")}
        className="h-7 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-700 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:placeholder:text-neutral-500"
      />
      <button
        type="button"
        onClick={() => setAccent(customColor)}
        title={t("settings.accentApply")}
        aria-label={t("settings.accentApply")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent/90 dark:text-neutral-950 dark:hover:bg-accent/80"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      {accent && (
        <button
          type="button"
          onClick={resetAccent}
          title={t("settings.accentReset")}
          aria-label={t("settings.accentReset")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-500 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  if (variant === "icon") {
    return (
      <IconPicker
        current={current}
        swatches={swatches}
        customRow={customRow}
        label={t("settings.accent")}
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("settings.accent")}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {t("settings.accentDescription")}
        </p>
      </div>
      {swatches}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          {t("settings.accentCustom")}
        </p>
        {customRow}
      </div>
    </div>
  );
}

function IconPicker({
  current,
  swatches,
  customRow,
  label,
  className,
}: {
  current: string;
  swatches: ReactNode;
  customRow: ReactNode;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        <Palette className="h-4 w-4" style={{ color: current }} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-56 space-y-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
          {swatches}
          {customRow}
        </div>
      )}
    </div>
  );
}

AccentPicker.displayName = "AccentPicker";
