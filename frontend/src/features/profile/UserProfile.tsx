import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/auth-store";
import { HttpProfileRepo } from "../../data/repos/http-profile-repo";
import type { ApiError } from "../../core/types";
import { PageHeader } from "../../ui/layouts/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/primitives/card";
import { Button } from "../../ui/primitives/button";
import { Input } from "../../ui/primitives/input";

const profileRepo = new HttpProfileRepo();

/** Extracts the normalized API error payload, if present. */
function asApiError(error: unknown): ApiError | undefined {
  if (error && typeof error === "object" && "error" in error) {
    return error as ApiError;
  }
  return undefined;
}

export default function UserProfile() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const storedUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => profileRepo.getMe(),
  });

  // Prefer the freshly fetched profile (includes email); fall back to the
  // cached session user while loading or if the request fails.
  const user = profile ?? storedUser;

  // Sync the edit form whenever the loaded profile changes.
  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email ?? "");
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: () => profileRepo.updateMe({ username, email: email || null }),
    onSuccess: (updated) => {
      setUser(updated);
      queryClient.setQueryData(["profile", "me"], updated);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      profileRepo.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  const passwordError =
    asApiError(passwordMutation.error)?.status_code === 400
      ? t("settings.currentPasswordIncorrect")
      : asApiError(passwordMutation.error)?.error ?? t("errors.passwordChangeFailed");

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || updateMutation.isPending) return;
    updateMutation.mutate();
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    passwordMutation.mutate();
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
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.username")}</span>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">{user?.username ?? "—"}</p>
          </div>
          <div>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.email")}</span>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">{user?.email ?? "—"}</p>
          </div>
          <div>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.role")}</span>
            <p className="font-medium capitalize text-neutral-900 dark:text-neutral-100">{user?.role ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.editProfile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label htmlFor="profile-username" className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("settings.username")}
              </label>
              <Input
                id="profile-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("settings.usernamePlaceholder")}
                required
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("settings.email")}
              </label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("settings.emailPlaceholder")}
              />
            </div>
            {updateMutation.isError && (
              <p className="text-sm text-red-500 dark:text-red-400">
                {asApiError(updateMutation.error)?.error ?? t("errors.updateProfileFailed")}
              </p>
            )}
            {updateMutation.isSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">{t("settings.profileUpdated")}</p>
            )}
            <Button type="submit" disabled={updateMutation.isPending || !username.trim()}>
              {updateMutation.isPending ? t("settings.saving") : t("settings.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
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
              <p className="text-sm text-red-500 dark:text-red-400">{t("settings.passwordsMismatch")}</p>
            )}
            {passwordMutation.isError && (
              <p className="text-sm text-red-500 dark:text-red-400">{passwordError}</p>
            )}
            {passwordMutation.isSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">{t("settings.passwordChanged")}</p>
            )}
            <Button type="submit" disabled={passwordMutation.isPending || newPassword !== confirmPassword}>
              {passwordMutation.isPending ? t("settings.changingPassword") : t("settings.changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
