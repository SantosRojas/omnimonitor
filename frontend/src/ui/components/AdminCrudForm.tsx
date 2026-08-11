import { type FormEvent, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

/* ── Public types ─────────────────────────────────────────────── */

export type FieldType = "text" | "select" | "number" | "email";

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
  /** Server-side error message surfaced above the submit button (e.g. a 409 conflict). */
  error?: string | null;
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * Reusable admin CRUD form.
 *
 * Renders a TailwindCSS-styled form with support for text, number, and
 * select field types. Displays inline validation errors for required fields.
 * Used for both create and edit operations.
 */
export function AdminCrudForm({
  fields,
  onSubmit,
  initialValues,
  isLoading,
  error,
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

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label
            htmlFor={`crud-${field.name}`}
            className="block text-sm font-medium text-gray-700"
          >
            {field.label}
          </label>

          {field.type === "select" && field.options ? (
            <select
              id={`crud-${field.name}`}
              value={String(values[field.name] ?? "")}
              onChange={(e) => setValue(field.name, e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t("admin.form.select", { label: field.label })}</option>
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`crud-${field.name}`}
              type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
              value={String(values[field.name] ?? "")}
              onChange={(e) => setValue(field.name, e.target.value)}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 ${
                errors[field.name]
                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              }`}
              placeholder={t("admin.form.enter", { label: field.label.toLowerCase() })}
            />
          )}

          {errors[field.name] && (
            <p className="mt-1 text-xs text-red-600">{errors[field.name]}</p>
          )}
        </div>
      ))}

      {/* ── Server error (e.g. 409 conflict) ────────────────────── */}
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {/* ── Submit ──────────────────────────────────────────────── */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {isLoading ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}
