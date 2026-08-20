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

type ConfirmProps = {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function StopCoworkerDialog({ open, busy, onOpenChange, onConfirm }: ConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stop this coworker?</DialogTitle>
          <DialogDescription>
            This pauses the coworker and detaches the live computer. Chat, memory, skills, and the
            channel stay. You can start it again anytime.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Stop
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAgentDialog({
  open,
  name,
  busy,
  description,
  onOpenChange,
  onConfirm,
}: ConfirmProps & { name: string; description?: string }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            {description ||
              `${name} will be removed from the rail. You have 7 days to recover it. After that it is permanently deleted.`}
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
