import { useState, useEffect } from "react";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/primitives/card";
import { Switch } from "../../ui/primitives/switch";

export default function Settings() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Dark Mode</p>
              <p className="text-xs text-neutral-500">Toggle between light and dark theme</p>
            </div>
            <Switch checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} label="" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-400">Language selection will be available in a future update.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-400">Notification preferences will be available in a future update.</p>
        </CardContent>
      </Card>
    </div>
  );
}
