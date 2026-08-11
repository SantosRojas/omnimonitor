import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Square } from "lucide-react";
import { HttpTherapyRepo } from "../../../data/repos/http-therapy-repo";
import { useAuthStore } from "../../../store/auth-store";
import { Button } from "../../../ui/primitives/button";
import { Input } from "../../../ui/primitives/input";
import { ConfirmDialog } from "../../../ui/components/ConfirmDialog";

interface CloseTherapyButtonProps {
  therapyId: number;
  className?: string;
  /** Final patient weight pre-filled in the confirm dialog (from the serial frame). */
  defaultWeight?: number | null;
}

const therapyRepo = new HttpTherapyRepo();

/**
 * Explicit "Close therapy" action shown in the SCADA header while a therapy
 * is active. Confirms before completing the session via the existing
 * `updateStatus` API, optionally recording the patient's final weight
 * (`end_weight`, defaulting to the weight sent by the serial frame), then
 * invalidates the therapy queries so the SCADA reflects the completed state.
 *
 * Only non-viewer roles (operator, admin) can close a therapy.
 */
export function CloseTherapyButton({
  therapyId,
  className,
  defaultWeight,
}: CloseTherapyButtonProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [endWeight, setEndWeight] = useState<string>(
    defaultWeight != null ? String(defaultWeight) : "",
  );

  const canClose = user?.role !== "viewer";

  const closeTherapy = useMutation({
    mutationFn: async () => {
      const parsedWeight =
        endWeight.trim() === "" ? null : Number(endWeight);
      const finalWeight =
        parsedWeight !== null && Number.isFinite(parsedWeight)
          ? parsedWeight
          : null;
      // Record the final weight first (when provided), then complete the
      // session. Both calls are idempotent-safe for the close flow.
      if (finalWeight !== null) {
        await therapyRepo.updateMetadata(therapyId, {
          end_weight: finalWeight,
        });
      }
      return therapyRepo.updateStatus(therapyId, "completed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapies"] });
      queryClient.invalidateQueries({ queryKey: ["therapy-comments", therapyId] });
      setDialogOpen(false);
    },
  });

  if (!canClose) return null;

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        className={className}
        onClick={() => {
          // Re-seed from the serial frame each time the dialog opens.
          setEndWeight(defaultWeight != null ? String(defaultWeight) : "");
          setDialogOpen(true);
        }}
        disabled={closeTherapy.isPending}
      >
        <Square className="h-3.5 w-3.5" />
        {t("scada.closeTherapy.label")}
      </Button>
      <ConfirmDialog
        open={dialogOpen}
        title={t("scada.closeTherapy.title")}
        message={t("scada.closeTherapy.message")}
        onConfirm={() => closeTherapy.mutate()}
        onCancel={() => setDialogOpen(false)}
        isLoading={closeTherapy.isPending}
      >
        <label className="mt-4 block">
          <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("scada.closeTherapy.finalWeight")}
          </span>
          <Input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={endWeight}
            onChange={(e) => setEndWeight(e.target.value)}
            placeholder={t("scada.closeTherapy.weightPlaceholder")}
            className="mt-1"
          />
        </label>
      </ConfirmDialog>
    </>
  );
}
