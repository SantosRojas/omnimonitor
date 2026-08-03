import { useState, useMemo } from "react";
import { Send, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpTherapyRepo } from "../../../data/repos/http-therapy-repo";
import { useAuthStore } from "../../../store/auth-store";
import { Card } from "../../../ui/primitives/card";
import { Button } from "../../../ui/primitives/button";
import { Input } from "../../../ui/primitives/input";
import { ConfirmDialog } from "../../../ui/components/ConfirmDialog";
import type { TherapyComment } from "../../../core/types";

interface CommentsPanelProps {
  therapyId: number;
  therapyActive?: boolean;
}

const therapyRepo = new HttpTherapyRepo();

/**
 * Therapy comments list + add (viewer read-only, admin can delete).
 * Ported from pdms-omni `presentation/components/scada/comments-panel.tsx`
 * using omni's existing therapy-comments API client and react-query
 * conventions (see TherapyHistoryPage).
 */
export function CommentsPanel({
  therapyId,
  therapyActive = false,
}: CommentsPanelProps) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canComment = user?.role !== "viewer";
  const isAdmin = user?.role === "admin";

  const [commentText, setCommentText] = useState("");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const { data: comments = [], isLoading } = useQuery<TherapyComment[]>({
    queryKey: ["therapy-comments", therapyId],
    queryFn: () => therapyRepo.getComments(therapyId),
    enabled: therapyId > 0,
  });

  const sortedComments = useMemo(
    () =>
      [...comments].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [comments],
  );

  const addComment = useMutation({
    mutationFn: () => therapyRepo.createComment(therapyId, commentText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapy-comments", therapyId] });
      setCommentText("");
      if (therapyActive) {
        setCloseDialogOpen(true);
      }
    },
  });

  const closeTherapy = useMutation({
    mutationFn: () => therapyRepo.updateStatus(therapyId, "completed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapies"] });
      queryClient.invalidateQueries({ queryKey: ["therapy-comments", therapyId] });
      setCloseDialogOpen(false);
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: number) => therapyRepo.deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["therapy-comments", therapyId] });
    },
  });

  const sending = addComment.isPending || deleteComment.isPending || closeTherapy.isPending;

  return (
    <Card className="rounded-xl border border-scada-border bg-scada-card p-3 text-scada-text shadow-sm">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-scada-muted">
        Comments ({comments.length})
      </h3>

      <div className="mb-2 max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-xs text-scada-muted">Loading...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-scada-muted">No comments</p>
        ) : (
          sortedComments.map((c) => (
            <div key={c.id} className="rounded-md bg-scada-card/50 p-2 text-xs">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="font-medium text-scada-text">{c.username}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-scada-muted">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => deleteComment.mutate(c.id)}
                      className="text-scada-muted transition-colors hover:text-scada-danger"
                      title="Delete comment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="leading-relaxed text-scada-muted">{c.content}</p>
            </div>
          ))
        )}
      </div>

      {canComment && (
        <div className="flex gap-2">
          <Input
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && commentText.trim() && !sending) {
                addComment.mutate();
              }
            }}
            className="h-8 border-scada-border bg-scada-surface text-xs text-scada-text placeholder:text-scada-muted"
          />
          <Button
            size="icon"
            className="h-8 w-8"
            onClick={() => addComment.mutate()}
            disabled={!commentText.trim() || sending}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {therapyActive && (
        <ConfirmDialog
          open={closeDialogOpen}
          title="Close current therapy?"
          message="Therapy is still active. Do you want to close it?"
          onConfirm={() => closeTherapy.mutate()}
          onCancel={() => setCloseDialogOpen(false)}
          isLoading={closeTherapy.isPending}
        />
      )}
    </Card>
  );
}
