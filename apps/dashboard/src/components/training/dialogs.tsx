"use client";

import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDeleteDatasetDialog({
  open,
  name,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  name: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            This removes the dataset from Training. Jobs that already used it keep their history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmCancelJobDialog({
  open,
  name,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  name: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {name}?</DialogTitle>
          <DialogDescription>
            The job will stop at the next status check. You can retry it later from the same plan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Keep running
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Cancel job
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
