import { useState } from "react";
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

const PRESSURE_LABELS: Record<CylinderPressureType, string> = {
  arterial: "Arterial",
  venous: "Venoso",
  tmp: "TMP",
  filter: "Filtro",
  effluent: "Efluente",
};

const PRESSURE_TYPES = Object.keys(PRESSURE_LABELS) as CylinderPressureType[];

const PRESSURE_FIELDS: (keyof CylinderConfig)[] = ["min", "max", "step"];
const FIELD_LABELS: Record<string, string> = { min: "Mín", max: "Máx", step: "Paso" };

export default function Settings() {
  const { theme, setTheme } = useThemeStore();
  const [alarmSound, setAlarmSound] = useState(() => localStorage.getItem("alarm-sound") !== "off");
  const [reconnectNotify, setReconnectNotify] = useState(() => localStorage.getItem("reconnect-notify") !== "off");
  const { configs, updateConfig, resetConfigs } = useCylinderConfigs();
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const themes: { key: "light" | "dark"; label: string; icon: typeof Sun }[] = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
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
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Customize your application experience
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Theme</p>
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
            Límites de presión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Configurar los límites mínimo, máximo y paso de escala para cada tipo de presión
            (utilizado en la vista de cilindro graduado). Estos valores se comparten entre
            todos los clientes conectados.
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
                    {PRESSURE_LABELS[type]}
                  </p>

                  <div className="space-y-1.5">
                    {PRESSURE_FIELDS.map((field) => {
                      const inputKey = `${type}.${field}`;
                      const displayValue =
                        inputKey in localValues ? localValues[inputKey] : String(cfg[field]);
                      return (
                        <div key={field}>
                          <label className="text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
                            {FIELD_LABELS[field]}
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
              Restablecer valores predeterminados
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Alarm Sound</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Play a sound when a machine alarm is triggered
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
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Reconnection Alerts</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Show a notification when the WebSocket reconnects
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
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Server: <span className="font-mono text-neutral-700 dark:text-neutral-300">{import.meta.env.VITE_API_TARGET || "http://localhost:9001"}</span>
          </p>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Language
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
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
          <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Version:</span> 0.1.0</p>
          <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Frontend:</span> React + Vite + Tailwind v4</p>
          <p><span className="font-medium text-neutral-700 dark:text-neutral-300">Backend:</span> Rust + Axum + PostgreSQL</p>
        </CardContent>
      </Card>
    </div>
  );
}
