import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Square } from "lucide-react";
import { HttpTherapyRepo } from "../../../data/repos/http-therapy-repo";
import { useAuthStore } from "../../../store/auth-store";
import { Button } from "../../../ui/primitives/button";
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
        Close therapy
      </Button>
      <ConfirmDialog
        open={dialogOpen}
        title="Close current therapy?"
        message="Therapy is still active. Do you want to close it?"
        onConfirm={() => closeTherapy.mutate()}
        onCancel={() => setDialogOpen(false)}
        isLoading={closeTherapy.isPending}
      >
        <label className="mt-4 block">
          <span className="block text-sm font-medium text-gray-700">
            Final patient weight (kg)
          </span>
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={endWeight}
            onChange={(e) => setEndWeight(e.target.value)}
            placeholder="Weight from serial frame"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
          />
        </label>
      </ConfirmDialog>
    </>
  );
}
