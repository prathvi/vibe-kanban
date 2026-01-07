import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { attemptsApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface DeleteWorktreeConfirmationDialogProps {
  workspaceId: string;
  containerRef: string;
  branch?: string;
}

const DeleteWorktreeConfirmationDialogImpl =
  NiceModal.create<DeleteWorktreeConfirmationDialogProps>(
    ({ workspaceId, containerRef, branch }) => {
      const modal = useModal();
      const [isDeleting, setIsDeleting] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const handleConfirmDelete = async () => {
        setIsDeleting(true);
        setError(null);

        try {
          await attemptsApi.deleteWorktree(workspaceId);
          modal.resolve();
          modal.hide();
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to delete worktree';
          setError(errorMessage);
        } finally {
          setIsDeleting(false);
        }
      };

      const handleCancelDelete = () => {
        modal.reject();
        modal.hide();
      };

      // Display either branch name or container path
      const displayName = branch || containerRef;

      return (
        <Dialog
          open={modal.visible}
          onOpenChange={(open) => !open && handleCancelDelete()}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Worktree</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the worktree
                {branch ? (
                  <>
                    {' '}
                    for branch{' '}
                    <span className="font-semibold">"{displayName}"</span>
                  </>
                ) : (
                  <>
                    {' '}
                    at <span className="font-semibold">"{displayName}"</span>
                  </>
                )}
                ?
              </DialogDescription>
            </DialogHeader>

          <Alert variant="default" className="mb-4">
            This will delete the local worktree files to free up disk space.
            Task history and logs will be preserved. You can recreate the
            worktree by starting a new attempt.
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-4">
              {error}
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              autoFocus
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Worktree'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const DeleteWorktreeConfirmationDialog = defineModal<
  DeleteWorktreeConfirmationDialogProps,
  void
>(DeleteWorktreeConfirmationDialogImpl);
