import { type FormEvent, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Select } from "../primitives/select";

/* ── Public types ─────────────────────────────────────────────── */

export type FieldType = "text" | "select" | "number" | "email" | "password";

export interface Field {
  /** Field name (used as the key in form values). */
  name: string;
  /** Human-readable label rendered above the input. */
  label: string;
  /** Input type — determines what kind of control to render. */
  type: FieldType;
  /** Options for `type: "select"` fields. */
  options?: { value: string; label: string }[];
  /** When `true`, an empty value is allowed (no required-field error). */
  optional?: boolean;
}

export interface AdminCrudFormProps {
  /** Field definitions. */
  fields: Field[];
  /** Called when the form is submitted with valid values. */
  onSubmit: (values: Record<string, string | number>) => void;
  /** Optional initial values for edit mode. */
  initialValues?: Record<string, string | number>;
  /** Whether the form is currently submitting. */
  isLoading: boolean;
  /** Server-side error message surfaced above the actions (e.g. a 409 conflict). */
  error?: string | null;
  /** Called when the user dismisses the form (Cancel button). */
  onCancel?: () => void;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Reusable admin CRUD form.
 *
 * Renders a TailwindCSS-styled form with support for text, password, number,
 * email, and select field types. Displays inline validation errors for
 * required fields, wired up with `aria-invalid` / `aria-describedby`. Used
 * for both create and edit operations, typically inside a modal.
 */
export function AdminCrudForm({
  fields,
  onSubmit,
  initialValues,
  isLoading,
  error,
  onCancel,
}: AdminCrudFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<
    Record<string, string | number>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialise values when `initialValues` changes.
  useEffect(() => {
    if (initialValues) {
      setValues({ ...initialValues });
    } else {
      const blank: Record<string, string | number> = {};
      for (const f of fields) {
        blank[f.name] = f.type === "number" ? "" : "";
      }
      setValues(blank);
    }
    setErrors({});
  }, [initialValues, fields]);

  /* ── Validation ──────────────────────────────────────────────── */
  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.name];
      const empty =
        v === undefined ||
        v === "" ||
        (typeof v === "number" && isNaN(v));
      if (empty && !f.optional) {
        next[f.name] = t("admin.form.required", { label: f.label });
      }
      if (!empty && f.type === "email" && typeof v === "string") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          next[f.name] = t("admin.form.invalidEmail", { label: f.label });
        }
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /* ── Submit ──────────────────────────────────────────────────── */
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate() || isLoading) return;
    onSubmit(values);
  }

  /* ── Change handler ──────────────────────────────────────────── */
  function setValue(name: string, raw: string) {
    const field = fields.find((f) => f.name === name);
    const parsed: string | number =
      field?.type === "number" ? (raw === "" ? "" : Number(raw)) : raw;

    setValues((prev) => ({ ...prev, [name]: parsed }));
    // Clear the error for this field on change
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  /* ── Field rendering helpers ─────────────────────────────────── */
  const isInvalid = (name: string) => errors[name] !== undefined;
  const errorId = (name: string) => `crud-${name}-error`;
  const invalidClassName =
    "border-red-500 focus-visible:ring-red-500 dark:border-red-500";

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label
            htmlFor={`crud-${field.name}`}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            {field.label}
          </label>

          {field.type === "select" && field.options ? (
            <Select
              id={`crud-${field.name}`}
              value={String(values[field.name] ?? "")}
              onChange={(e) => setValue(field.name, e.target.value)}
              options={field.options}
              placeholder={t("admin.form.select", { label: field.label })}
              aria-invalid={isInvalid(field.name) || undefined}
              aria-describedby={
                isInvalid(field.name) ? errorId(field.name) : undefined
              }
              className={isInvalid(field.name) ? invalidClassName : undefined}
            />
          ) : (
            <Input
              id={`crud-${field.name}`}
              type={field.type}
              value={String(values[field.name] ?? "")}
              onChange={(e) => setValue(field.name, e.target.value)}
              placeholder={t("admin.form.enter", { label: field.label.toLowerCase() })}
              aria-invalid={isInvalid(field.name) || undefined}
              aria-describedby={
                isInvalid(field.name) ? errorId(field.name) : undefined
              }
              className={isInvalid(field.name) ? invalidClassName : undefined}
            />
          )}

          {errors[field.name] && (
            <p
              id={errorId(field.name)}
              aria-live="polite"
              className="mt-1 text-xs text-red-600 dark:text-red-400"
            >
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}

      {/* ── Server error (e.g. 409 conflict) ────────────────────── */}
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
