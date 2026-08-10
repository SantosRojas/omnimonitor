import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Palette, Bell, Globe, Info, Wifi, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/primitives/card";
import { Switch } from "../../ui/primitives/switch";
import { Input } from "../../ui/primitives/input";
import { Button } from "../../ui/primitives/button";
import { useThemeStore } from "../../store/theme-store";
import { LanguageSelector } from "../../ui/components/LanguageSelector";
import { cn } from "../../ui/primitives";
import { useCylinderConfigs } from "../../features/scada/domain/use-cylinder-config";
import type {
  CylinderConfig,
  CylinderPressureType,
} from "../../features/scada/domain/cylinder-config";

const PRESSURE_TYPES = [
  "arterial",
  "venous",
  "tmp",
  "filter",
  "effluent",
] as CylinderPressureType[];

const PRESSURE_FIELDS: (keyof CylinderConfig)[] = ["min", "max", "step"];

export default function Settings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const [alarmSound, setAlarmSound] = useState(() => localStorage.getItem("alarm-sound") !== "off");
  const [reconnectNotify, setReconnectNotify] = useState(() => localStorage.getItem("reconnect-notify") !== "off");
  const { configs, updateConfig, resetConfigs } = useCylinderConfigs();
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const pressureLabels: Record<CylinderPressureType, string> = {
    arterial: t("settings.pressureArterial"),
    venous: t("settings.pressureVenous"),
    tmp: t("settings.pressureTmp"),
    filter: t("settings.pressureFilter"),
    effluent: t("settings.pressureEffluent"),
  };

  const fieldLabels: Record<string, string> = {
    min: t("settings.pressureMin"),
    max: t("settings.pressureMax"),
    step: t("settings.pressureStep"),
  };

  const themes: { key: "light" | "dark"; label: string; icon: typeof Sun }[] = [
    { key: "light", label: t("nav.light"), icon: Sun },
    { key: "dark", label: t("nav.dark"), icon: Moon },
  ];

  function handlePressureChange(type: CylinderPressureType, field: keyof CylinderConfig, raw: string) {
    const key = `${type}.${field}`;
    setLocalValues((prev) => ({ ...prev, [key]: raw }));
    const num = Number.parseFloat(raw);
    if (Number.isFinite(num)) {
      updateConfig(type, field, num);
    }
  }

  function handlePressureBlur(type: CylinderPressureType, field: keyof CylinderConfig) {
    const key = `${type}.${field}`;
    const raw = localValues[key];
    if (raw !== undefined) {
      const num = Number.parseFloat(raw);
      if (!Number.isFinite(num)) {
        setLocalValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }

  function handleReset() {
    resetConfigs();
    setLocalValues({});
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.description")}
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            {t("settings.appearance")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("settings.theme")}</p>
            <div className="flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
              {themes.map(({ key, label, icon: Icon }) => {
                const isActive = theme === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTheme(key)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pressure limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            {t("settings.pressureLimits")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t("settings.pressureLimitsDescription")}
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {PRESSURE_TYPES.map((type) => {
              const cfg = configs[type];
              return (
                <div
                  key={type}
                  className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {pressureLabels[type]}
                  </p>

                  <div className="space-y-1.5">
                    {PRESSURE_FIELDS.map((field) => {
                      const inputKey = `${type}.${field}`;
                      const displayValue =
                        inputKey in localValues ? localValues[inputKey] : String(cfg[field]);
                      return (
                        <div key={field}>
                          <label className="text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
                            {fieldLabels[field]}
                          </label>
                          <Input
                            value={displayValue}
                            onChange={(e) => handlePressureChange(type, field, e.target.value)}
                            onBlur={() => handlePressureBlur(type, field)}
                            className="h-7 text-xs tabular-nums"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={handleReset}>
              {t("settings.resetDefaults")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("settings.notifications")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">{t("settings.alarmSound")}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("settings.alarmSoundDescription")}
              </p>
            </div>
            <Switch
              checked={alarmSound}
              onChange={(e) => {
                setAlarmSound(e.target.checked);
                localStorage.setItem("alarm-sound", e.target.checked ? "on" : "off");
              }}
              label=""
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">{t("settings.reconnectionAlerts")}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("settings.reconnectionAlertsDescription")}
              </p>
            </div>
            <Switch
              checked={reconnectNotify}
              onChange={(e) => {
                setReconnectNotify(e.target.checked);
                localStorage.setItem("reconnect-notify", e.target.checked ? "on" : "off");
              }}
              label=""
            />
          </div>
        </CardContent>
      </Card>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            {t("settings.connection")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t("settings.server", { url: import.meta.env.VITE_API_TARGET || "http://localhost:9001" })}
          </p>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("common.language")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSelector variant="settings" />
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            {t("settings.about")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
          <p><span className="font-medium text-neutral-700 dark:text-neutral-300">{t("settings.version", { value: "0.1.0" })}</span></p>
          <p><span className="font-medium text-neutral-700 dark:text-neutral-300">{t("settings.frontend", { value: "React + Vite + Tailwind v4" })}</span></p>
          <p><span className="font-medium text-neutral-700 dark:text-neutral-300">{t("settings.backend", { value: "Rust + Axum + PostgreSQL" })}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
