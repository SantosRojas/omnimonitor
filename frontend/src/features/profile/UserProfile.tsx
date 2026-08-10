import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "../../store/auth-store";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/primitives/card";
import { Button } from "../../ui/primitives/button";
import { Input } from "../../ui/primitives/input";

async function changePassword(data: { currentPassword: string; newPassword: string }) {
  const res = await fetch("/api/users/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to change password");
  return res.json();
}

export default function UserProfile() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={t("settings.userProfile")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.accountInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="text-sm text-neutral-500">{t("settings.username")}</span>
            <p className="font-medium">{user?.username ?? "—"}</p>
          </div>
          <div>
            <span className="text-sm text-neutral-500">{t("settings.email")}</span>
            <p className="font-medium">{(user as any)?.email ?? "—"}</p>
          </div>
          <div>
            <span className="text-sm text-neutral-500">{t("settings.role")}</span>
            <p className="font-medium capitalize">{user?.role ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder={t("settings.currentPassword")}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder={t("settings.newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder={t("settings.confirmPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {newPassword !== confirmPassword && confirmPassword && (
              <p className="text-sm text-red-500">{t("settings.passwordsMismatch")}</p>
            )}
            {mutation.isError && (
              <p className="text-sm text-red-500">{t("errors.passwordChangeFailed")}</p>
            )}
            {mutation.isSuccess && (
              <p className="text-sm text-green-600">{t("settings.passwordChanged")}</p>
            )}
            <Button type="submit" disabled={mutation.isPending || newPassword !== confirmPassword}>
              {mutation.isPending ? t("settings.changingPassword") : t("settings.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
