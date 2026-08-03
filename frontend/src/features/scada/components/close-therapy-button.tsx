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
}

const therapyRepo = new HttpTherapyRepo();

/**
 * Explicit "Close therapy" action shown next to the therapy state timeline
 * while a therapy is active. Confirms before completing the session via the
 * existing `updateStatus` API, then invalidates the therapy queries so the
 * SCADA reflects the completed state.
 *
 * Only non-viewer roles (operator, admin) can close a therapy.
 */
export function CloseTherapyButton({ therapyId, className }: CloseTherapyButtonProps) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const canClose = user?.role !== "viewer";

  const closeTherapy = useMutation({
    mutationFn: () => therapyRepo.updateStatus(therapyId, "completed"),
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
        onClick={() => setDialogOpen(true)}
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
      />
    </>
  );
}
